import { Router } from 'express';
import { getSettings, updateSettings } from '../controlers/settings.controller';
import { authenticate } from '../middleware/auth';

const keyRouter = Router();

keyRouter.get('/key-settings', getSettings);
keyRouter.put('/update-keys', authenticate, updateSettings);

export default keyRouter;