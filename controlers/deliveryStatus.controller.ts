import { Request, Response } from "express";
import { Delivery, DeliveryDocument } from "../models/Delivery";
import { Types } from "mongoose";

// Helper to validate user permissions
const validateUserPermission = async (
  deliveryId: string,
  userId: string,
  userRole: string
): Promise<{ delivery: DeliveryDocument | null; isAuthorized: boolean; message?: string }> => {
  try {
    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return { delivery: null, isAuthorized: false, message: "Delivery not found" };
    }

    // Check if user is the customer
    const isCustomer = delivery.customer.toString() === userId;
    
    // Check if user is the assigned delivery partner
    const isDeliveryPartner = delivery.deliveryPartner?.toString() === userId;

    let isAuthorized = false;

    switch (userRole) {
      case "customer":
        isAuthorized = isCustomer;
        break;
      case "delivery_partner":
        isAuthorized = isDeliveryPartner;
        break;
      case "admin":
        isAuthorized = true;
        break;
      default:
        isAuthorized = false;
    }

    if (!isAuthorized) {
      return { delivery, isAuthorized: false, message: "Unauthorized access" };
    }

    return { delivery, isAuthorized: true };
  } catch (error) {
    console.error("Error validating user permission:", error);
    return { delivery: null, isAuthorized: false, message: "Server error" };
  }
};

// Mark as Picked Up
export const markAsPickedUp = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { location } = req.body;
    const userId = (req as any).user._id;
    const userRole = (req as any).user.role;

    // Validate user permission
    const { delivery, isAuthorized, message } = await validateUserPermission(
      deliveryId,
      userId,
      userRole
    );

    if (!isAuthorized || !delivery) {
      return res.status(403).json({
        success: false,
        message: message || "Unauthorized",
      });
    }

    // Only delivery partner can mark as picked up
    if (userRole !== "delivery_partner") {
      return res.status(403).json({
        success: false,
        message: "Only delivery partners can mark deliveries as picked up",
      });
    }

    // Mark as picked up
    await delivery.markAsPickedUp(location);

    // Send notification to customer (you can implement this separately)
    // await sendNotification(delivery.customer, "delivery_picked_up", { deliveryId });

    res.status(200).json({
      success: true,
      message: "Delivery marked as picked up successfully",
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          deliveryCode: delivery.deliveryCode,
          timeline: delivery.timeline,
        },
      },
    });
  } catch (error: any) {
    console.error("Mark as picked up error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to mark delivery as picked up",
    });
  }
};

// Mark as In Transit
export const markAsInTransit = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { location } = req.body;
    const userId = (req as any).user._id;
    const userRole = (req as any).user.role;

    // Validate user permission
    const { delivery, isAuthorized, message } = await validateUserPermission(
      deliveryId,
      userId,
      userRole
    );

    if (!isAuthorized || !delivery) {
      return res.status(403).json({
        success: false,
        message: message || "Unauthorized",
      });
    }

    // Only delivery partner can mark as in transit
    if (userRole !== "delivery_partner") {
      return res.status(403).json({
        success: false,
        message: "Only delivery partners can mark deliveries as in transit",
      });
    }

    // Mark as in transit
    await delivery.markAsInTransit(location);

    // Send notification to customer
    // await sendNotification(delivery.customer, "delivery_in_transit", { deliveryId });

    res.status(200).json({
      success: true,
      message: "Delivery marked as in transit successfully",
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          timeline: delivery.timeline,
        },
      },
    });
  } catch (error: any) {
    console.error("Mark as in transit error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to mark delivery as in transit",
    });
  }
};

// Cancel Delivery
export const cancelDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user._id;
    const userRole = (req as any).user.role;

    // Validate user permission
    const { delivery, isAuthorized, message } = await validateUserPermission(
      deliveryId,
      userId,
      userRole
    );

    if (!isAuthorized || !delivery) {
      return res.status(403).json({
        success: false,
        message: message || "Unauthorized",
      });
    }

    // Check if delivery can be cancelled
    if (!delivery.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be cancelled in ${delivery.status} status`,
      });
    }

    // Cancel delivery
    await delivery.cancelDelivery(reason, new Types.ObjectId(userId));

    // Send notifications
    if (userRole === "customer") {
      // Notify delivery partner
      if (delivery.deliveryPartner) {
        // await sendNotification(delivery.deliveryPartner, "delivery_cancelled_by_customer", { deliveryId });
      }
    } else if (userRole === "delivery_partner") {
      // Notify customer
      // await sendNotification(delivery.customer, "delivery_cancelled_by_partner", { deliveryId });
    }

    // Initiate refund if payment was made
    if (delivery.paymentStatus === "paid" && delivery.paymentMethod !== "cash") {
      // Call refund API here
      // await processRefund(delivery);
    }

    res.status(200).json({
      success: true,
      message: "Delivery cancelled successfully",
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          cancellationReason: delivery.cancellationReason,
          timeline: delivery.timeline,
        },
      },
    });
  } catch (error: any) {
    console.error("Cancel delivery error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel delivery",
    });
  }
};

// Confirm Delivery (Customer)
export const confirmDeliveryByCustomer = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { code } = req.body;
    const userId = (req as any).user._id;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Confirmation code is required",
      });
    }

    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user is the customer
    if (delivery.customer.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the customer can confirm delivery",
      });
    }

    // Check if customer has already confirmed
    if (delivery.confirmation.customerConfirmed) {
      return res.status(400).json({
        success: false,
        message: "Customer has already confirmed this delivery",
      });
    }

    // Confirm by customer
    const result = await delivery.confirmByCustomer(code);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        attempts: delivery.confirmation.confirmationAttempts,
        maxAttempts: 5,
      });
    }

    const response: any = {
      success: true,
      message: result.message,
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          customerConfirmed: delivery.confirmation.customerConfirmed,
          partnerConfirmed: delivery.confirmation.partnerConfirmed,
          deliveryCode: delivery.deliveryCode,
        },
      },
    };

    // If delivery is now marked as delivered
    if (delivery.status === "delivered") {
      // Send notifications
      // await sendNotification(delivery.deliveryPartner, "delivery_completed", { deliveryId });
      
      // Update earnings for delivery partner
      // await updatePartnerEarnings(delivery.deliveryPartner, delivery.price);
      
      response.message = "Delivery completed successfully!";
      response.data.delivery.completedAt = new Date();
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Customer confirmation error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to confirm delivery",
    });
  }
};

// Confirm Delivery (Partner)
export const confirmDeliveryByPartner = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { code } = req.body;
    const userId = (req as any).user._id;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Confirmation code is required",
      });
    }

    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user is the delivery partner
    if (!delivery.deliveryPartner || delivery.deliveryPartner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned delivery partner can confirm delivery",
      });
    }

    // Check if partner has already confirmed
    if (delivery.confirmation.partnerConfirmed) {
      return res.status(400).json({
        success: false,
        message: "Delivery partner has already confirmed this delivery",
      });
    }

    // Confirm by partner
    const result = await delivery.confirmByPartner(code);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        attempts: delivery.confirmation.confirmationAttempts,
        maxAttempts: 5,
      });
    }

    const response: any = {
      success: true,
      message: result.message,
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          customerConfirmed: delivery.confirmation.customerConfirmed,
          partnerConfirmed: delivery.confirmation.partnerConfirmed,
          deliveryCode: delivery.deliveryCode,
        },
      },
    };

    // If delivery is now marked as delivered
    if (delivery.status === "delivered") {
      // Send notification to customer
      // await sendNotification(delivery.customer, "delivery_completed", { deliveryId });
      
      // Update earnings for delivery partner
      // await updatePartnerEarnings(delivery.deliveryPartner, delivery.price);
      
      response.message = "Delivery completed successfully!";
      response.data.delivery.completedAt = new Date();
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Partner confirmation error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to confirm delivery",
    });
  }
};

// Get delivery confirmation status
export const getDeliveryConfirmationStatus = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const userId = (req as any).user._id;

    const delivery = await Delivery.findById(deliveryId)
      .select("status deliveryCode confirmation customer deliveryPartner timeline")
      .populate("customer", "name phone")
      .populate("deliveryPartner", "name phone");

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user has access
    const isCustomer = delivery.customer._id.toString() === userId;
    const isDeliveryPartner = delivery.deliveryPartner?._id.toString() === userId;
    const isAdmin = (req as any).user.role === "admin";

    if (!isCustomer && !isDeliveryPartner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          deliveryCode: delivery.deliveryCode,
          confirmation: {
            customerConfirmed: delivery.confirmation.customerConfirmed,
            partnerConfirmed: delivery.confirmation.partnerConfirmed,
            customerConfirmationTime: delivery.confirmation.customerConfirmationTime,
            partnerConfirmationTime: delivery.confirmation.partnerConfirmationTime,
            confirmationAttempts: delivery.confirmation.confirmationAttempts,
            remainingAttempts: 5 - delivery.confirmation.confirmationAttempts,
          },
          customer: {
            id: delivery.customer._id,
            name: delivery.customer.name,
            phone: delivery.customer.phone,
          },
          deliveryPartner: delivery.deliveryPartner ? {
            id: delivery.deliveryPartner._id,
            name: delivery.deliveryPartner.name,
            phone: delivery.deliveryPartner.phone,
          } : null,
          timeline: delivery.timeline,
        },
      },
    });
  } catch (error: any) {
    console.error("Get confirmation status error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get confirmation status",
    });
  }
};