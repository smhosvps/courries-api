import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getEarningSettings, updateEarningSettings } from '../controlers/earningSetting.controller';


const earningxRouter = express.Router();

// Only super admins can view/update earning settings
earningxRouter.get('/earning-settings', authenticate, getEarningSettings);
earningxRouter.put('/earning-settings', authenticate, updateEarningSettings);

export default earningxRouter;