# Confidential Request for Payment Protocol

The **Confidential Request for Payment Protocol** allows users to send FHE (Fully Homomorphic Encryption) encrypted payment requests, ensuring that sensitive details remain private. This unique functionality is powered by **Zama's Fully Homomorphic Encryption technology**, which safeguards the context and purpose of transactions while providing a seamless payment experience. 

## The Challenge: Privacy in Transactions 💸

In an increasingly digital world, maintaining privacy during financial exchanges is paramount. Users often need to communicate specific details when requesting payments, but sharing such information can expose sensitive data to unintended parties. Current solutions fail to provide a secure way to convey payment contexts and purposes without compromising user privacy. 

## How FHE Provides the Solution 🔐

This project leverages the power of **Zama's open-source libraries**, including **Concrete**, to ensure that payment requests and associated notes are encrypted end-to-end. By using Fully Homomorphic Encryption, the protocol allows payment requests to be sent in a secure manner, ensuring that only the sender and recipient can access the sensitive details involved in the transaction. Thus, privacy is preserved without sacrificing usability.

## Core Functionalities 🌟

- **FHE Encrypted Notes:** Users can add confidential remarks to their payment requests, which are secured using FHE encryption.
- **Privacy Protection:** Safeguards the context and purpose of transactions, enhancing user confidence in digital payments.
- **Versatile Applications:** Applicable for both business transactions and personal transfers, making it ideal for various scenarios.
- **Enhanced User Experience:** Implements a sleek mobile payment interface with integrated request cards for easy use.

## Technology Stack 🛠️

- **Zama FHE SDK:** The foundational technology for confidential computing.
- **Node.js:** For backend implementation.
- **Hardhat/Foundry:** Development environments for building and testing smart contracts.
- **Solidity:** The programming language used for smart contract development.

## Directory Structure 📂

Here’s what the project structure looks like:

```
Payment_Request_Fhe/
├── contracts/
│   └── Payment_Request_Fhe.sol
├── scripts/
│   └── deploy.js
├── tests/
│   └── PaymentRequest.test.js
├── package.json
└── hardhat.config.js
```

## Setup Instructions 🚀

To get started with the **Confidential Request for Payment Protocol**, ensure you have the following environment:

1. **Node.js:** Make sure to install Node.js on your machine.
2. **Development Tools:** Use Hardhat or Foundry for deploying the smart contract.
3. **Install Dependencies:**

   Navigate to your project root directory using a terminal, and run:

   ```bash
   npm install
   ```

   This will install all required dependencies, including Zama's FHE libraries, ensuring you're ready to start working with the encrypted payment requests.

**Note:** Do not attempt to `git clone` or use any URLs; follow the installation steps precisely to set up your environment.

## Build and Execute Your Project 🏗️

To compile, test, and run the **Confidential Request for Payment Protocol**, use the following commands in the terminal:

1. **Compile the Contracts:**

   ```bash
   npx hardhat compile
   ```

2. **Run Tests:**

   ```bash
   npx hardhat test
   ```

3. **Deploy the Smart Contract:**

   ```bash
   npx hardhat run scripts/deploy.js
   ```

Once deployed, you can start sending confidential payment requests!

## Code Snippet: Sending a Secure Payment Request 💻

Here’s a quick example of how you might implement a payment request using the protocol:

```javascript
// Import the required libraries
const { ethers } = require("hardhat");

// Function to send a payment request
async function sendPaymentRequest(toAddress, amount, note) {
    const PaymentRequest = await ethers.getContractFactory("Payment_Request_Fhe");
    const paymentRequest = await PaymentRequest.deploy();
    
    // Encrypt the note with Zama's FHE capabilities
    const encryptedNote = encryptWithFHE(note); // Implement the FHE encryption logic

    const tx = await paymentRequest.sendRequest(toAddress, amount, encryptedNote);
    await tx.wait();
    
    console.log(`Payment request sent to ${toAddress} for ${amount} ETH with note.`);
}

// Example usage
sendPaymentRequest("0xRecipientAddress", 0.5, "Payment for services rendered");
```

## Acknowledgements 🙏

**Powered by Zama**: A heartfelt thank you to the Zama team for their groundbreaking work in developing open-source tools and technologies that enable the creation of confidential blockchain applications. Your efforts have made it possible for us to build privacy-centric solutions like the Confidential Request for Payment Protocol.

---

Harness the power of privacy in your transactions with the **Confidential Request for Payment Protocol**, and transform the way you handle payments today!

---
