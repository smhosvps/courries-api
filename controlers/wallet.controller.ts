import axios from "axios";
// src/controllers/walletController.ts
import { Request, Response } from "express";
import { Wallet } from "../models/Wallet";

// Helper function to generate unique reference
const generateReference = (prefix: string = "WAL"): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

// Get wallet balance and info
export const getWallet = async (req: Request, res: Response): Promise<void> => { 
  try {
    const wallet = await Wallet.findOne({ user: req.user._id }).populate(
      "user",
      "firstName lastName email phone"
    );

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
      return; 
    } 

    const response: any = {
      success: true,
      message: "Wallet retrieved successfully",
      data: {
        wallet: {
          _id: wallet._id,
          balance: wallet.balance,
          formattedBalance: `₦${wallet.balance.toLocaleString("en-NG")}`,
          user: wallet.user,
          transactionCount: wallet.transactions.length,
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        },
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Get wallet error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve wallet",
    });
  }
};

// Get wallet transactions with pagination
export const getTransactions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
      return;
    }

    // Get all transactions
    let transactions = wallet.transactions;

    // Sort by createdAt descending (newest first)
    transactions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const response: any = {
      success: true,
      message: "Transactions retrieved successfully",
      data: {
        transactions: transactions, // Return all transactions
        total: transactions.length, // Include total count for reference
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Get transactions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve transactions",
    });
  }
};


export const fundWallet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, amount, reference, description, paymentMethod } = req.body;

    // Get user ID from authenticated request
    const userId = user;
    
    console.log("Funding request:", { userId, amount, reference, description, paymentMethod });

    // Input validation
    if (!amount || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid amount provided. Amount must be a positive number",
      });
      return;
    }

    if (!reference) {
      res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
      return;
    }

    if (!paymentMethod || !["flutterwave", "paystack"].includes(paymentMethod)) {
      res.status(400).json({
        success: false,
        message: "Invalid payment method. Only 'flutterwave' or 'paystack' are supported",
      });
      return;
    }

    let verificationSuccessful = false;
    const currency = "NGN"; // Fixed to NGN only
    
    // Payment verification based on payment method
    if (paymentMethod === "paystack") {
      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || 'sk_test_10625280b82af7e2c39fecbc6f8361249eab2610'}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );

        const { data } = response.data;

        if (
          !data ||
          data.status !== "success" ||
          data.currency !== currency ||
          data.amount !== amount * 100 // Paystack uses kobo (multiplied by 100)
        ) {
          res.status(400).json({
            success: false,
            message: `Paystack payment verification failed. Status: ${data?.status}, Expected: ${amount*100}, Got: ${data?.amount}`,
          });
          return;
        }
        
        verificationSuccessful = true;
        console.log("Paystack verification successful");
        
      } catch (error: any) {
        console.error("Paystack verification error:", error.message);
        res.status(400).json({
          success: false,
          message: `Paystack verification failed: ${
            error.response?.data?.message || error.message
          }`,
        });
        return;
      }
    } else if (paymentMethod === "flutterwave") {
      try {
        const response = await axios.get(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK-23dc1c3c70813de67aa7e697b2243c4c-198609235ddvt-X'}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );

        const { data } = response.data;

        if (
          !data ||
          data.status !== "successful" ||
          data.currency !== currency ||
          data.amount !== amount
        ) {
          res.status(400).json({
            success: false,
            message: `Flutterwave payment verification failed. Status: ${data?.status}, Expected: ${amount}, Got: ${data?.amount}`,
          });
          return;
        }
        
        verificationSuccessful = true;
        console.log("Flutterwave verification successful");
        
      } catch (error: any) {
        console.error("Flutterwave verification error:", error.message);
        res.status(400).json({
          success: false,
          message: `Flutterwave verification failed: ${
            error.response?.data?.message || error.message
          }`,
        });
        return;
      }
    }

    if (!verificationSuccessful) {
      res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
      return;
    }

    // Find or create wallet for the user
    let wallet = await Wallet.findOne({ user: userId });
    
    if (!wallet) {
      // Create new wallet if it doesn't exist
      wallet = new Wallet({
        user: userId,
        balance: 0,
        transactions: []
      });
      console.log("Created new wallet for user:", userId);
    }

    console.log("Current wallet balance before funding:", wallet.balance);

    // Update wallet balance (single balance field as per your model)
    wallet.balance += amount;
    
    // Add transaction to wallet
    const transaction = {
      type: "credit" as const,
      amount,
      description: description || `Wallet funding via ${paymentMethod}`,
      reference,
      currency,
      paymentMethod,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    wallet.transactions.push(transaction);

    await wallet.save();

    console.log("Wallet balance after funding:", wallet.balance);

    res.status(200).json({
      success: true,
      message: "Wallet funded successfully",
      data: {
        wallet: {
          _id: wallet._id,
          user: wallet.user,
          balance: wallet.balance,
          updatedAt: wallet.updatedAt
        },
        transaction: {
          type: "credit",
          amount,
          currency,
          reference,
          paymentMethod,
          description: transaction.description,
          createdAt: transaction.createdAt
        }
      },
    });
  } catch (error: any) {
    console.error("Error funding wallet:", error);
    
    if (error.response) {
      res.status(400).json({
        success: false,
        message: `Payment API Error: ${
          error.response.data?.message || "Unknown error"
        }`,
      });
      return;
    }
    
    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: `Validation Error: ${error.message}`,
      });
      return;
    }
    
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: "Duplicate wallet entry",
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      message: `Server Error during funding: ${error.message}`,
    });
  }
};















// Debit wallet (for payments)
export const debitWallet = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { amount, description, reference, metadata } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
      return;
    }

    if (!description) {
      res.status(400).json({
        success: false,
        message: "Description is required",
      });
      return;
    }

    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
      return;
    }

    // Check sufficient balance
    if (!wallet.hasSufficientBalance(amount)) {
      res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
      return;
    }

    // Generate reference if not provided
    const txReference = reference || generateReference("DEBIT");

    // Check if transaction reference already exists
    const existingTransaction = wallet.transactions.find(
      (tx) => tx.reference === txReference
    );
    if (existingTransaction) {
      res.status(400).json({
        success: false,
        message: "Transaction reference already exists",
      });
      return;
    }

    // Update wallet balance
    wallet.balance -= amount;

    // Add transaction
    const transaction = {
      type: "debit" as const,
      amount,
      description,
      reference: txReference,
      status: "completed" as const,
      metadata: metadata || {},
    };

    wallet.transactions.push(transaction);
    await wallet.save();

    const response: any = {
      success: true,
      message: "Wallet debited successfully",
      data: {
        wallet: {
          balance: wallet.balance,
          formattedBalance: `₦${wallet.balance.toLocaleString("en-NG")}`,
        },
        transaction,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Debit wallet error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to debit wallet",
    });
  }
};

// Transfer to another user
export const transferToUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { recipientUserId, amount, description, reference } = req.body;

    // Validation
    if (!recipientUserId) {
      res.status(400).json({
        success: false,
        message: "Recipient user ID is required",
      });
      return;
    }

    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
      return;
    }

    if (recipientUserId === req.user._id.toString()) {
      res.status(400).json({
        success: false,
        message: "Cannot transfer to yourself",
      });
      return;
    }

    const senderWallet = await Wallet.findOne({ user: req.user._id });
    const recipientWallet = await Wallet.findOne({
      user: recipientUserId,
    }).populate("user", "firstName lastName email");

    if (!senderWallet) {
      res.status(404).json({
        success: false,
        message: "Sender wallet not found",
      });
      return;
    }

    if (!recipientWallet) {
      res.status(404).json({
        success: false,
        message: "Recipient wallet not found",
      });
      return;
    }

    // Check sufficient balance
    if (!senderWallet.hasSufficientBalance(amount)) {
      res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
      return;
    }

    // Generate reference if not provided
    const txReference = reference || generateReference("XFER");

    // Check if transaction reference already exists
    const existingTransaction = senderWallet.transactions.find(
      (tx) => tx.reference === txReference
    );
    if (existingTransaction) {
      res.status(400).json({
        success: false,
        message: "Transaction reference already exists",
      });
      return;
    }

    // Perform transfer (in a transaction in production)
    senderWallet.balance -= amount;
    recipientWallet.balance += amount;

    // Add transactions to both wallets
    const senderTransaction = {
      type: "debit" as const,
      amount,
      description:
        description ||
        `Transfer to ${recipientWallet.user.firstName} ${recipientWallet.user.lastName}`,
      reference: txReference,
      status: "completed" as const,
      metadata: {
        recipient: recipientUserId,
        transferType: "user_transfer",
      },
    };

    const recipientTransaction = {
      type: "credit" as const,
      amount,
      description:
        description ||
        `Transfer from ${req.user.firstName} ${req.user.lastName}`,
      reference: txReference,
      status: "completed" as const,
      metadata: {
        sender: req.user._id,
        transferType: "user_transfer",
      },
    };

    senderWallet.transactions.push(senderTransaction);
    recipientWallet.transactions.push(recipientTransaction);

    await senderWallet.save();
    await recipientWallet.save();

    const response: WalletResponse = {
      success: true,
      message: "Transfer completed successfully",
      data: {
        wallet: {
          balance: senderWallet.balance,
          formattedBalance: `₦${senderWallet.balance.toLocaleString("en-NG")}`,
        },
        transaction: senderTransaction,
        recipient: {
          name: `${recipientWallet.user.firstName} ${recipientWallet.user.lastName}`,
          newBalance: recipientWallet.balance,
        },
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Transfer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to complete transfer",
    });
  }
};

// Get wallet balance only
export const getBalance = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
      return;
    }

    const response: any = {
      success: true,
      message: "Balance retrieved successfully",
      data: {
        balance: wallet.balance,
        formattedBalance: `₦${wallet.balance.toLocaleString("en-NG")}`,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Get balance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve balance",
    });
  }
};

