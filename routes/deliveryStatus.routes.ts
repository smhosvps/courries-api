import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth'; // your existing auth middleware
import { getAllOrders, getAssignedDeliveries, getCanceledDeliveries, getDeliveredDeliveries, getDeliveryById, getPendingDeliveries, getPickedUpAndInTransitDeliveries, getTodayOrders } from '../controlers/deliveryOrderController';

const deliverOrderRoutes = Router();

// All routes require authentication; adjust roles as needed.
// Example: Admin, Partner and Customer can access their own filtered deliveries.
deliverOrderRoutes.use(authenticate);

// GET /api/deliveries/pending
deliverOrderRoutes.get('/deliveries-pending', getPendingDeliveries);
deliverOrderRoutes.get('/deliveries-assigned', getAssignedDeliveries);
deliverOrderRoutes.get('/deliveries-picked-up-in-transit', getPickedUpAndInTransitDeliveries);
deliverOrderRoutes.get('/deliveries-delivered', getDeliveredDeliveries);
deliverOrderRoutes.get('/deliveries-canceled', getCanceledDeliveries);
deliverOrderRoutes.get('/deliveries-today', getTodayOrders);
deliverOrderRoutes.get('/deliveries-all', getAllOrders);
deliverOrderRoutes.get('/deliveries-order-detail/:id', getDeliveryById);

export default deliverOrderRoutes;