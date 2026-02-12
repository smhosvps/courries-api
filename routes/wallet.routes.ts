import express from "express";
import { fundWallet, getTransactions, getWallet } from "../controlers/wallet.controller";
import { authenticate } from "../middleware/auth";

const walletRouter = express.Router();

// check user api
walletRouter.get("/get-my-wallet", authenticate, getWallet);
walletRouter.get("/get-my-transaction", authenticate, getTransactions);
// login user
walletRouter.post("/fund-wallet", fundWallet);


export default walletRouter;
