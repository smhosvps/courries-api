// src/services/paystack.service.ts

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const SECRET_KEY = 'pk_test_e6cc577914dad17f263f0931a46d69479f303c26';

const paystack = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

// Create a transfer recipient
export const createTransferRecipient = async (
  name: string,
  accountNumber: string,
  bankCode: string
) => {
  try {
    const response = await paystack.post("/transferrecipient", {
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    });
    return response.data.data;
  } catch (error: any) {
    console.error("Paystack create recipient error:", error.response?.data);
    throw new Error(error.response?.data?.message || "Failed to create transfer recipient");
  }
};

// Initiate a transfer
export const initiateTransfer = async (
  amount: number,
  recipientCode: string,
  reference: string
) => {
  try {
    const response = await paystack.post("/transfer", {
      source: "balance", // or "balance" if you have funds in your Paystack balance
      amount: amount * 100, // Paystack uses kobo
      recipient: recipientCode,
      reference,
      reason: "Admin payout",
    });
    return response.data.data;
  } catch (error: any) {
    console.error("Paystack transfer error:", error.response?.data);
    throw new Error(error.response?.data?.message || "Failed to initiate transfer");
  }
};

// Optional: verify transfer (can be used after webhook)
export const verifyTransfer = async (reference: string) => {
  try {
    const response = await paystack.get(`/transfer/verify/${reference}`);
    return response.data.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || "Transfer verification failed");
  }
};