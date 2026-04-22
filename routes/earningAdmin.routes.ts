import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getAdminEarnings, getDeliveryEarnings, getDeliveryStatsAndRevenue } from '../controlers/earningsControllerAdm.js';

const earningRouter = express.Router();

// All earnings routes require admin authentication
earningRouter.use(authenticate);

earningRouter.get('/earnings-admin', authenticate, getAdminEarnings);
earningRouter.get('/earnings-delivery', authenticate, getDeliveryEarnings);
earningRouter.get('/stats-revenue', authenticate, getDeliveryStatsAndRevenue);

export default earningRouter;