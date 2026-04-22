// backend/routes/adminDeliveryRoutes.ts
import express from 'express';
import { authenticate } from '../middleware/auth';
import { AssignDeliveryToPartner, GetAllDeliveryPartners, getCancelledDeliveries, getDeliveredDeliveries, GetDeliveryDetails, GetDeliveryStats, getInTransitDeliveries, getPendingDeliveries, GetPendingPaidDeliveries, getPickedUpDeliveries } from '../controlers/adminDeliveryController';

const adminDeliveryRouter = express.Router();


// Get all pending deliveries with paid status
adminDeliveryRouter.get('/admin-pending-paid-deliveries', authenticate, GetPendingPaidDeliveries);

// Get single delivery details with customer info
adminDeliveryRouter.get('/admin-delivery/:deliveryId', authenticate, GetDeliveryDetails);

// Assign delivery to specific partner
adminDeliveryRouter.post('/admin-assign-delivery/:deliveryId', authenticate, AssignDeliveryToPartner);

// Get all available delivery partners
adminDeliveryRouter.get('/admin-delivery-partners', authenticate, GetAllDeliveryPartners);

// Get delivery statistics
adminDeliveryRouter.get('/admin-delivery-stats', authenticate, GetDeliveryStats);


adminDeliveryRouter.get('/pending', authenticate, getPendingDeliveries);
adminDeliveryRouter.get('/picked-up', authenticate, getPickedUpDeliveries);
adminDeliveryRouter.get('/in-transit', authenticate, getInTransitDeliveries);
adminDeliveryRouter.get('/delivered', authenticate, getDeliveredDeliveries);
adminDeliveryRouter.get('/cancelled', authenticate, getCancelledDeliveries);

export default adminDeliveryRouter;