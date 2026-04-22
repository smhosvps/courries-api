import express from "express";
import { authenticate } from "../middleware/auth";
import { acceptDelivery, cancelDelivery, cancelMultipleDeliveries, confirmDeliveryByPartner, getDeliveryConfirmationStatus, markAsInTransit, markAsPickedUp } from "../controlers/deliveryStatus.controller";

const deliveryStatusRouter = express.Router(); 

deliveryStatusRouter.patch("/delivery-status/:deliveryId/accepted/:userId", authenticate, acceptDelivery);   
// Mark as picked up (Delivery Partner only)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/picked-up/:userId", authenticate, markAsPickedUp);   

// Mark as in transit (Delivery Partner only)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/in-transit/:userId", authenticate, markAsInTransit); 

// Cancel delivery (Customer or Delivery Partner)
deliveryStatusRouter.patch("/delivery-status/:deliveryId/cancel/:userId", authenticate, cancelDelivery); 

// Confirm delivery by delivery partner
deliveryStatusRouter.post("/delivery-status/:deliveryId/confirm/partner/:userId", authenticate, confirmDeliveryByPartner); 

// Get delivery confirmation status
deliveryStatusRouter.get("/delivery-status/:deliveryId/confirmation-status", authenticate, getDeliveryConfirmationStatus); 

deliveryStatusRouter.post('/cancel-multiple', authenticate, cancelMultipleDeliveries);


export default deliveryStatusRouter;  