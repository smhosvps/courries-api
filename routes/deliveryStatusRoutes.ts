import express from "express";
import { authenticate } from "../middleware/auth";
import { cancelDelivery, confirmDeliveryByCustomer, confirmDeliveryByPartner, getDeliveryConfirmationStatus, markAsInTransit, markAsPickedUp } from "../controlers/deliveryStatus.controller";

const deliveryStatusRouter = express.Router(); 

// All routes require authentication
deliveryStatusRouter.use(authenticate);

// Mark as picked up (Delivery Partner only)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/picked-up", authenticate, markAsPickedUp);   

// Mark as in transit (Delivery Partner only)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/in-transit", authenticate, markAsInTransit); 

// Cancel delivery (Customer or Delivery Partner)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/cancel", authenticate, cancelDelivery); 

// Confirm delivery by customer
deliveryStatusRouter.post("/delivery-status/:deliveryId/confirm/customer", authenticate, confirmDeliveryByCustomer); 

// Confirm delivery by delivery partner
deliveryStatusRouter.post("/delivery-status/:deliveryId/confirm/partner", authenticate, confirmDeliveryByPartner); 

// Get delivery confirmation status
deliveryStatusRouter.get("/delivery-status/:deliveryId/confirmation-status", authenticate, getDeliveryConfirmationStatus); 

export default deliveryStatusRouter;