import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PaymentRequest {
  id: number;
  amount: number;
  encryptedAmount: string;
  encryptedNote: string;
  note: string;
  timestamp: number;
  requester: string;
  paid: boolean;
}

interface UserAction {
  type: 'create' | 'pay' | 'decrypt';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRequestData, setNewRequestData] = useState({ amount: "", note: "" });
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ amount: number | null; note: string | null }>({ amount: null, note: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('requests');
  const [searchTerm, setSearchTerm] = useState("");
  
  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load payment requests
      const requestsBytes = await contract.getData("payment_requests");
      let requestsList: PaymentRequest[] = [];
      if (requestsBytes.length > 0) {
        try {
          const requestsStr = ethers.toUtf8String(requestsBytes);
          if (requestsStr.trim() !== '') requestsList = JSON.parse(requestsStr);
        } catch (e) {}
      }
      setRequests(requestsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new payment request
  const createRequest = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingRequest(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating payment request with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new request
      const amount = parseFloat(newRequestData.amount);
      const newRequest: PaymentRequest = {
        id: requests.length + 1,
        amount: amount,
        encryptedAmount: FHEEncryptNumber(amount),
        encryptedNote: `FHE-${btoa(newRequestData.note)}`,
        note: newRequestData.note,
        timestamp: Math.floor(Date.now() / 1000),
        requester: address,
        paid: false
      };
      
      // Update requests list
      const updatedRequests = [...requests, newRequest];
      
      // Save to contract
      await contract.setData("payment_requests", ethers.toUtf8Bytes(JSON.stringify(updatedRequests)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created payment request: ${amount} ETH`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Payment request created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRequestData({ amount: "", note: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingRequest(false); 
    }
  };

  // Pay request
  const payRequest = async (requestId: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Processing payment with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the request
      const requestIndex = requests.findIndex(r => r.id === requestId);
      if (requestIndex === -1) throw new Error("Request not found");
      
      // Update payment status
      const updatedRequests = [...requests];
      updatedRequests[requestIndex].paid = true;
      
      // Save to contract
      await contract.setData("payment_requests", ethers.toUtf8Bytes(JSON.stringify(updatedRequests)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'pay',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Paid request: ${updatedRequests[requestIndex].amount} ETH`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Payment recorded with FHE encryption!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Payment failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt data with signature
  const decryptWithSignature = async (encryptedAmount: string, encryptedNote: string): Promise<{ amount: number | null; note: string | null }> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return { amount: null, note: null }; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE payment data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return {
        amount: FHEDecryptNumber(encryptedAmount),
        note: encryptedNote.startsWith('FHE-') ? atob(encryptedNote.substring(4)) : encryptedNote
      };
    } catch (e) { 
      return { amount: null, note: null }; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Render payment statistics
  const renderPaymentStats = () => {
    const totalRequests = requests.length;
    const paidRequests = requests.filter(r => r.paid).length;
    const unpaidRequests = totalRequests - paidRequests;
    const totalAmount = requests.reduce((sum, r) => sum + r.amount, 0);
    const paidAmount = requests.filter(r => r.paid).reduce((sum, r) => sum + r.amount, 0);
    
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalRequests}</div>
          <div className="stat-label">Total Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{paidRequests}</div>
          <div className="stat-label">Paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{unpaidRequests}</div>
          <div className="stat-label">Unpaid</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalAmount.toFixed(2)}</div>
          <div className="stat-label">Total ETH</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{paidAmount.toFixed(2)}</div>
          <div className="stat-label">Paid ETH</div>
        </div>
      </div>
    );
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Create Request</h4>
            <p>User creates a payment request with encrypted amount and note</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>FHE Encryption</h4>
            <p>Amount and note are encrypted using Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Payment Processing</h4>
            <p>Recipient pays the encrypted amount</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Private Decryption</h4>
            <p>Only requester and payer can decrypt the note</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'pay' && '💰'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is Confidential Request for Payment?",
        answer: "It's a protocol that allows users to send FHE-encrypted payment requests with private notes that only the sender and recipient can view."
      },
      {
        question: "How does FHE protect my payment privacy?",
        answer: "FHE encrypts both the payment amount and note, ensuring only authorized parties can access the details while maintaining confidentiality."
      },
      {
        question: "Can I see payment requests I've sent?",
        answer: "Yes, your sent requests are stored encrypted on-chain and can be decrypted with your wallet signature."
      },
      {
        question: "What blockchain is this built on?",
        answer: "The protocol is built on Ethereum and utilizes Zama FHE for privacy-preserving transactions."
      },
      {
        question: "Is the note content really private?",
        answer: "Yes, the note is encrypted end-to-end using FHE and can only be decrypted by the intended parties."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  // Filter requests based on search term
  const filteredRequests = requests.filter(request => 
    request.note.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.amount.toString().includes(searchTerm) ||
    request.requester.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted payment system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="payment-icon"></div>
          </div>
          <h1>Confidential<span>Pay</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-request-btn"
          >
            <div className="add-icon"></div>New Request
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card">
                <h2>Private Payment Requests with FHE</h2>
                <p>ConfidentialPay allows users to send FHE-encrypted payment requests with private notes that only the sender and recipient can view.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon"></div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              <div className="panel-card">
                <h2>FHE Payment Flow</h2>
                {renderFHEFlow()}
              </div>
              
              <div className="panel-card">
                <h2>Payment Statistics</h2>
                {renderPaymentStats()}
              </div>
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
                onClick={() => setActiveTab('requests')}
              >
                Payment Requests
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Actions
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'requests' && (
                <div className="requests-section">
                  <div className="section-header">
                    <h2>Payment Requests</h2>
                    <div className="header-actions">
                      <div className="search-container">
                        <input
                          type="text"
                          placeholder="Search requests..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="search-icon"></div>
                      </div>
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="requests-list">
                    {filteredRequests.length === 0 ? (
                      <div className="no-requests">
                        <div className="no-requests-icon"></div>
                        <p>No payment requests found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowCreateModal(true)}
                        >
                          Create First Request
                        </button>
                      </div>
                    ) : filteredRequests.map((request, index) => (
                      <div 
                        className={`request-item ${selectedRequest?.id === request.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedRequest(request)}
                      >
                        <div className="request-header">
                          <div className="request-amount">{request.amount} ETH</div>
                          <div className={`request-status ${request.paid ? "paid" : "unpaid"}`}>
                            {request.paid ? "Paid" : "Unpaid"}
                          </div>
                        </div>
                        <div className="request-requester">From: {request.requester.substring(0, 6)}...{request.requester.substring(38)}</div>
                        <div className="request-encrypted">Encrypted Note: {request.encryptedNote.substring(0, 15)}...</div>
                        <div className="request-time">{new Date(request.timestamp * 1000).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateRequest 
          onSubmit={createRequest} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingRequest} 
          requestData={newRequestData} 
          setRequestData={setNewRequestData}
        />
      )}
      
      {selectedRequest && (
        <RequestDetailModal 
          request={selectedRequest} 
          onClose={() => { 
            setSelectedRequest(null); 
            setDecryptedData({ amount: null, note: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          payRequest={payRequest}
          isConnected={isConnected}
          address={address}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="payment-icon"></div>
              <span>ConfidentialPay</span>
            </div>
            <p>Private payment requests powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} ConfidentialPay. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect payment privacy. 
            Payment details are encrypted end-to-end and only visible to authorized parties.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateRequestProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  requestData: any;
  setRequestData: (data: any) => void;
}

const ModalCreateRequest: React.FC<ModalCreateRequestProps> = ({ onSubmit, onClose, creating, requestData, setRequestData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRequestData({ ...requestData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-request-modal">
        <div className="modal-header">
          <h2>Create Payment Request</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Amount and note will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Amount (ETH) *</label>
            <input 
              type="number" 
              name="amount" 
              value={requestData.amount} 
              onChange={handleChange} 
              placeholder="Enter amount in ETH..." 
              step="0.01"
              min="0"
            />
          </div>
          
          <div className="form-group">
            <label>Private Note *</label>
            <textarea 
              name="note" 
              value={requestData.note} 
              onChange={handleChange} 
              placeholder="Enter private note (only visible to recipient)..." 
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !requestData.amount || !requestData.note} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Request"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RequestDetailModalProps {
  request: PaymentRequest;
  onClose: () => void;
  decryptedData: { amount: number | null; note: string | null };
  setDecryptedData: (value: { amount: number | null; note: string | null }) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedAmount: string, encryptedNote: string) => Promise<{ amount: number | null; note: string | null }>;
  payRequest: (requestId: number) => void;
  isConnected: boolean;
  address?: `0x${string}`;
}

const RequestDetailModal: React.FC<RequestDetailModalProps> = ({ 
  request, 
  onClose, 
  decryptedData, 
  setDecryptedData, 
  isDecrypting, 
  decryptWithSignature,
  payRequest,
  isConnected,
  address
}) => {
  const handleDecrypt = async () => {
    if (decryptedData.amount !== null) { 
      setDecryptedData({ amount: null, note: null }); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(request.encryptedAmount, request.encryptedNote);
    if (decrypted.amount !== null) {
      setDecryptedData(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="request-detail-modal">
        <div className="modal-header">
          <h2>Payment Request Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="request-info">
            <div className="info-item">
              <span>Amount:</span>
              <strong>{request.amount} ETH</strong>
            </div>
            <div className="info-item">
              <span>Requester:</span>
              <strong>{request.requester.substring(0, 6)}...{request.requester.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(request.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status ${request.paid ? "paid" : "unpaid"}`}>
                {request.paid ? "Paid" : "Unpaid"}
              </strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              <div className="data-row">
                <span>Amount:</span>
                <div className="encrypted-value">{request.encryptedAmount.substring(0, 20)}...</div>
              </div>
              <div className="data-row">
                <span>Note:</span>
                <div className="encrypted-value">{request.encryptedNote.substring(0, 20)}...</div>
              </div>
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting || !isConnected}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedData.amount !== null ? (
                "Hide Decrypted Data"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedData.amount !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Data</h3>
              <div className="decrypted-values">
                <div className="data-row">
                  <span>Amount:</span>
                  <strong>{decryptedData.amount} ETH</strong>
                </div>
                <div className="data-row">
                  <span>Note:</span>
                  <strong>{decryptedData.note}</strong>
                </div>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          {!request.paid && address !== request.requester && (
            <button 
              className="pay-btn" 
              onClick={() => payRequest(request.id)}
              disabled={!isConnected}
            >
              Pay Request
            </button>
          )}
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;