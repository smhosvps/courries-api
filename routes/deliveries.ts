import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  AssignDeliveryPartner,
  AvailablePartners,
  createDelivery,
  deliveryType,
  getAllDeliveries,
  getCustomerOngoingDeliveries,
  getCustomerPastDeliveries,
  getDelivery,
  getDeliveryDeliverid,
  getUserDeliveries,
  getWalletBalance,
  payDelivery,
  trackDelivery,
  updateDeliveryStatus,
} from "../controlers/deliveryController.js";

const deliveryRouter = Router();

deliveryRouter.post("/deliveries", authenticate, createDelivery);
deliveryRouter.get("/my-deliveries", authenticate, getUserDeliveries);
deliveryRouter.get("/get-delivery:id", authenticate, getDelivery);
deliveryRouter.put("/update/:id/status", authenticate, updateDeliveryStatus);
deliveryRouter.get("/deliveries/:deliveryId/track", authenticate, trackDelivery);


deliveryRouter.get("/customer-ongoing-deliveries/:id", getCustomerOngoingDeliveries);
deliveryRouter.get("/customer-past-deliveries/:id", getCustomerPastDeliveries);


deliveryRouter.get("/admin-delievery/all", authenticate, getAllDeliveries);
deliveryRouter.get("/deliveries/:deliveryId/available-partners", authenticate, AvailablePartners)

deliveryRouter.put(
  "/deliveries/:deliveryId/choose-type",
  authenticate,
  deliveryType
);
deliveryRouter.put(
  "/deliveries/:deliveryId/available-partners",
  authenticate,
  deliveryType
);
deliveryRouter.put(
  "/deliveries/:deliveryId/assign",
  authenticate,
  AssignDeliveryPartner
);
deliveryRouter.get("/deliveries/:deliveryId", getDeliveryDeliverid);
deliveryRouter.get('/get-wallet-balance-customer', authenticate, getWalletBalance);
deliveryRouter.post(
  '/deliveries/:deliveryId/pay', authenticate, payDelivery
);

export default deliveryRouter;
