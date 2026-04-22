// src/controllers/transferController.ts

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import userModel from "../models/user_model";
import transactionModel from "../models/transaction.model";
import { initiateTransfer, createTransferRecipient } from "../services/paystack.service";
import { IUser } from "../models/user_model"; // if exported
import crypto from 'crypto';

// Extend Express Request to include authenticated user
interface AuthRequest extends Request {
    user: IUser; // or a custom type with _id, role, etc.
}

// Helper: map bank name to Paystack bank code (official Paystack bank codes)
function getBankCode(bankName: string): string {
    const bankCodes: Record<string, string> = {
        "Access Bank": "044",
        "Citibank": "023",
        "Ecobank Nigeria": "050",
        "Fidelity Bank": "070",
        "First Bank of Nigeria": "011",
        "First City Monument Bank": "214",
        "Guaranty Trust Bank": "058",
        "Heritage Bank": "030",
        "Keystone Bank": "082",
        "Polaris Bank": "076",
        "Providus Bank": "101",
        "Stanbic IBTC Bank": "221",
        "Sterling Bank": "232",
        "Suntrust Bank": "100",
        "Union Bank of Nigeria": "032",
        "United Bank for Africa": "033",
        "Unity Bank": "215",
        "Wema Bank": "035",
        "Zenith Bank": "057",
    };
    // Normalize input: trim, title case etc. (simple example)
    const normalized = bankName.trim();
    return bankCodes[normalized] || "058"; // fallback to GTBank code
}

// @desc    Admin initiates a transfer to a user
// @route   POST /api/transfers
export const createTransfer = async (req: AuthRequest, res: Response) => {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid data: userId and positive amount required" });
    }

    try {
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const activeBank = user.bank?.find((b) => b.isActive) || user.bank?.[0];
        if (!activeBank || !activeBank.account_number || !activeBank.bank_name) {
            return res.status(400).json({ message: "User has no complete bank details" });
        }

        // Use stored recipient code if available, otherwise create a new one
        let recipientCode = activeBank.paystackRecipientCode;
        if (!recipientCode) {
            const recipient = await createTransferRecipient(
                `${user.firstName} ${user.lastName}`,
                activeBank.account_number,
                getBankCode(activeBank.bank_name)
            );
            recipientCode = recipient.recipient_code;

            // Save the recipient code for future transfers
            activeBank.paystackRecipientCode = recipientCode;
            await user.save();
        }

        const reference = `TRF-${uuidv4()}`;
        const transfer = await initiateTransfer(amount, recipientCode, reference);

        const transaction = await transactionModel.create({
            amount,
            recipient: userId,
            reference,
            paystackTransferReference: transfer.reference,
            status: "pending",
            initiatedBy: req.user._id,
        });

        res.status(201).json({
            message: "Transfer initiated successfully",
            transaction,
        });
    } catch (error: any) {
        console.error("Transfer error:", error);
        if (error.response?.data?.message) {
            return res.status(500).json({ message: error.response.data.message });
        }
        res.status(500).json({ message: error.message || "Transfer failed" });
    }
};

// @desc    Get all transactions (admin: all, user: own)
// @route   GET /api/transfers
export const getTransactions = async (req: AuthRequest, res: Response) => {
    try {
        let query;
        if (req.user.userType === "super admin") {
            query = transactionModel.find({}).populate("recipient", "firstName lastName email");
        } else {
            query = transactionModel.find({ recipient: req.user._id });
        }
        const transactions = await query.sort("-createdAt");
        res.json(transactions);
    } catch (error: any) {
        console.error("Get transactions error:", error);
        res.status(500).json({ message: error.message });
    }
};



const PAYSTACK_SECRET_KEY = 'pk_test_e6cc577914dad17f263f0931a46d69479f303c26';

export const handlePaystackWebhook = async (req: Request, res: Response) => {
    // 1. Verify signature
    const signature = req.headers['x-paystack-signature'] as string;
    const payload = JSON.stringify(req.body);

    const expectedSignature = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        console.error('Invalid Paystack signature');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // 2. Process event
    const event = req.body;

    // We're interested only in transfer events
    if (event.event === 'transfer.success' || event.event === 'transfer.failed') {
        const transferReference = event.data.reference; // Paystack transfer reference
        const status = event.event === 'transfer.success' ? 'success' : 'failed';

        try {
            // Find transaction by paystackTransferReference
            const transaction = await transactionModel.findOne({
                paystackTransferReference: transferReference,
            });

            if (!transaction) {
                console.error(`Transaction not found for reference: ${transferReference}`);
                return res.status(404).json({ message: 'Transaction not found' });
            }

            // Update status
            transaction.status = status;
            await transaction.save();

            console.log(`Transaction ${transaction.reference} updated to ${status}`);
        } catch (error) {
            console.error('Error updating transaction:', error);
            // Return 200 to Paystack anyway to avoid retries, but log the error
        }
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
};