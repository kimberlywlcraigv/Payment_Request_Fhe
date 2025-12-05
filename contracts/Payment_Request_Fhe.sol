pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract PaymentRequestFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error InvalidState();
    error ReplayDetected();
    error DecryptionFailed();
    error AlreadyInitialized();
    error NotInitialized();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSet(uint256 cooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PaymentRequestSubmitted(uint256 indexed batchId, address indexed sender, bytes32 encryptedNote);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 note);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    mapping(uint256 => mapping(address => euint32)) public encryptedNotes;
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;

    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[msg.sender] = true;
        emit ProviderAdded(msg.sender);
        cooldownSeconds = 60;
        currentBatchId = 0;
        batchOpen = false;
    }

    function addProvider(address _provider) external onlyOwner {
        providers[_provider] = true;
        emit ProviderAdded(_provider);
    }

    function removeProvider(address _provider) external onlyOwner {
        providers[_provider] = false;
        emit ProviderRemoved(_provider);
    }

    function setCooldown(uint256 _cooldownSeconds) external onlyOwner {
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSet(_cooldownSeconds);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) {
            emit Paused();
        } else {
            emit Unpaused();
        }
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) {
            currentBatchId++;
        }
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert InvalidBatch();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitPaymentRequest(uint256 _batchId, euint32 _encryptedNote) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (_batchId != currentBatchId) revert InvalidBatch();
        if (!batchOpen) revert InvalidBatch();
        if (hasSubmitted[_batchId][msg.sender]) revert AlreadyInitialized(); // One submission per provider per batch

        lastSubmissionTime[msg.sender] = block.timestamp;
        encryptedNotes[_batchId][msg.sender] = _encryptedNote;
        hasSubmitted[_batchId][msg.sender] = true;

        emit PaymentRequestSubmitted(_batchId, msg.sender, _encryptedNote.toBytes32());
    }

    function requestNoteDecryption(uint256 _batchId, address _provider) external whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (!_isNoteInitialized(_batchId, _provider)) revert NotInitialized();

        euint32 memory note = encryptedNotes[_batchId][_provider];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = note.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: _batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, _batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();
        if (cleartexts.length != 32) revert DecryptionFailed(); // Expecting one uint256 (32 bytes)

        // State Verification
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedNotes[decryptionContexts[requestId].batchId][msg.sender].toBytes32(); // Rebuild cts from storage
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert InvalidState();
        }

        // Proof Verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode & Finalize
        uint256 note = abi.decode(cleartexts, (uint256));
        decryptionContexts[requestId].processed = true;

        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, note);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _isNoteInitialized(uint256 _batchId, address _provider) internal view returns (bool) {
        return hasSubmitted[_batchId][_provider];
    }
}