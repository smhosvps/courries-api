
import express from 'express';
import { createTransfer, getTransactions, handlePaystackWebhook } from '../controlers/transfer.controller';
import { authenticate } from '../middleware/auth';

const transferRoute = express.Router();

transferRoute.get('/get-all-transactions', authenticate, getTransactions);
transferRoute.post('/create-payment', authenticate, createTransfer);
transferRoute.post('/paystack', authenticate, handlePaystackWebhook);


export default transferRoute;

