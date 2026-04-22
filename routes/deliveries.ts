import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  adminAssignDeliveryController,
  autoAssignDeliveryController,
  AvailablePartners,
  createDelivery,
  deleteDelivery,
  deliveryType,
  editDelivery,
  getAllDeliveries,
  getCustomerOngoingDeliveries,
  getCustomerPastDeliveries,
  getCustomerTrackingDelivery,
  getDelivery,
  getDeliveryById,
  getDeliveryDeliverid,
  getDeliveryPartnerStats,
  getParnerPastDeliveries,
  getPartnerOngoingDeliveries,
  getUserDeliveries,
  getWalletBalance,
  payDelivery,
  trackDelivery,
  updateDeliveryStatus,
} from "../controlers/deliveryController.js";

const deliveryRouter = Router();

deliveryRouter.post("/deliveries", authenticate, createDelivery);
deliveryRouter.get("/my-deliveries", authenticate, getUserDeliveries);
deliveryRouter.get("/get-delivery", authenticate, getDelivery);
deliveryRouter.put("/update/:id/status", authenticate, updateDeliveryStatus);
deliveryRouter.get("/deliveries/:deliveryId/track", authenticate, trackDelivery);

// query: (deliveryId) => `deliveries/${deliveryId}/track`,

deliveryRouter.get("/customer-ongoing-deliveries/:id", getCustomerOngoingDeliveries);
deliveryRouter.get("/customer-past-deliveries/:id", getCustomerPastDeliveries);

deliveryRouter.get("/partner-ongoing-deliveries/:id", getPartnerOngoingDeliveries);
deliveryRouter.get("/partner-past-deliveries/:id", getParnerPastDeliveries);

deliveryRouter.get("/admin-delievery/all", authenticate, getAllDeliveries);

deliveryRouter.get("/deliveries/:deliveryId/available-partners", authenticate, AvailablePartners)

deliveryRouter.put(
  "/deliveries/:deliveryId/choose-type",
  authenticate,
  deliveryType
);



deliveryRouter.get("/deliveries/:deliveryId", authenticate, getDeliveryDeliverid);

deliveryRouter.get('/get-wallet-balance-customer', authenticate, getWalletBalance);
deliveryRouter.post(
  '/deliveries/:deliveryId/pay', authenticate, payDelivery
);
deliveryRouter.delete("/delivery-delete/:deliveryId/delete", authenticate, deleteDelivery);
deliveryRouter.get("/delivery-detail-single/:deliveryId", authenticate, getDeliveryById);

// Edit delivery
deliveryRouter.put("/delivery-detail-edit/:deliveryId", authenticate, editDelivery);

deliveryRouter.get('/stats/:partnerId', authenticate, getDeliveryPartnerStats);








deliveryRouter.get("/delivery-tracking/:deliveryId", authenticate, getCustomerTrackingDelivery);


deliveryRouter.post(
  "/deliveries/:deliveryId/auto-assign",
  authenticate,        // ensure user is authenticated (if needed) 
  autoAssignDeliveryController
);



deliveryRouter.post('/admin-assign', authenticate, authorize('admin', 'super admin'), adminAssignDeliveryController);



export default deliveryRouter;
