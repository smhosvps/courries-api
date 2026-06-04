import express from "express";
import { adminGetAllWallets, adminGetUserWallet, adminManualDebitWallet, adminManualFundWallet, fundWallet, getTransactions, getWallet } from "../controlers/wallet.controller";
import { authenticate } from "../middleware/auth";

const walletRouter = express.Router();

// check user api
walletRouter.get("/get-my-wallet", authenticate, getWallet);
walletRouter.get("/get-my-transaction", authenticate, getTransactions);
// login user
walletRouter.post("/fund-wallet", fundWallet); 

walletRouter.get("/admin-wallets", authenticate, adminGetAllWallets);
walletRouter.get("/admin-wallets/:userId", authenticate, adminGetUserWallet);
walletRouter.post("/admin-wallets/:userId/fund", authenticate, adminManualFundWallet);
walletRouter.post("/admin-wallets/:userId/debit", authenticate, adminManualDebitWallet); // new route


export default walletRouter;
