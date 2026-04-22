// routes/withdrawalRoutes.js
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { getMyBalance, getMyWithdrawals, getWithdrawals, processWithdrawal, requestWithdrawal } from "../controlers/withdrawalController";



const withdrawRouter = Router();
// Delivery partner endpoints
withdrawRouter.post('/request-withdraw', authenticate, requestWithdrawal);
withdrawRouter.get('/my-withdrawals', authenticate, getMyWithdrawals);
withdrawRouter.get('/balance', authenticate, getMyBalance);

// Admin endpoints
withdrawRouter.get('/admin-get-all', authenticate, getWithdrawals);
withdrawRouter.put('/admin-process-withdraw/:id/userid/:adminId', authenticate, processWithdrawal);

export default withdrawRouter;