import express from 'express';
import { authenticate } from '../middleware/auth';
import { createPrivacy, deletePrivacy, getAllPrivacy, getAllPrivacyAdmin, getPrivacyById, updatePrivacy } from '../controlers/privacy.controller';

const privacyRouter = express.Router();

privacyRouter.post('/create-privacy', authenticate, createPrivacy);
privacyRouter.put('/update-privacy/:id', authenticate, updatePrivacy);
privacyRouter.get('/get-privacy/:id', authenticate, getPrivacyById);
privacyRouter.get('/get-privacy', getAllPrivacy);
privacyRouter.get('/get-admin-all-privacy', authenticate, getAllPrivacyAdmin);
privacyRouter.delete('/delete-privacy/:id', authenticate, deletePrivacy);

export default privacyRouter;