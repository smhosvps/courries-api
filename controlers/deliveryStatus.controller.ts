
import { Request, Response } from "express";
import { Delivery, DeliveryDocument } from "../models/Delivery";
import Notification from "../models/notificationModel";
import userModel from "../models/user_model";
import {
  sendPushToUser,
} from "../services/onesignalService";
import earningModel from "../models/earning.model";
import { cancelDeliveryCore } from "../services/services.deliveryCancellation";
import { Types } from "mongoose";




export const validateUserPermission = async (
  deliveryId: string,
  userId: string,
  userRole: string
): Promise<{ delivery: DeliveryDocument | null; isAuthorized: boolean; message?: string }> => {
  try {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return { delivery: null, isAuthorized: false, message: "Delivery not found" };
    }

    const isCustomer = delivery.customer.toString() === userId;
    const isAssignedPartner = delivery.deliveryPartner?.toString() === userId;
    const isOfferedPartner = delivery.offeredPartners?.some(id => id.toString() === userId) ?? false;
    const isAdmin = userRole === "admin" || userRole === "super admin";

    // ✅ Authorize if customer, assigned partner, offered partner, or admin
    const isAuthorized = isCustomer || isAssignedPartner || isOfferedPartner || isAdmin;

    if (!isAuthorized) {
      return { delivery, isAuthorized: false, message: "Unauthorized access" };
    }

    (delivery as any)._userActualRole = isCustomer ? "customer" : isAssignedPartner ? "delivery_partner" : isOfferedPartner ? "offered_partner" : "admin";
    return { delivery, isAuthorized: true };
  } catch (error) {
    console.error("Error validating user permission:", error);
    return { delivery: null, isAuthorized: false, message: "Server error" };
  }
};


// Helper to send push notification
export const sendPushNotification = async (
  userId: string,
  title: string,
  message: string,
  data: any
) => {
  try {
    const user = await userModel.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found for push notification`);
      return;
    }

    if (!user.onesignalPlayerId) {
      console.log(`User ${userId} has no OneSignal player ID registered`);
      return;
    }

    const result = await sendPushToUser(user, title, message, data);

    if (result) {
      console.log(`Push notification sent successfully to user ${userId}:`, result);
    } else {
      console.log(`Push notification failed for user ${userId} but continuing flow`);
    }
  } catch (error) {
    // Log but don't throw - we don't want to break the main flow
    console.error(`Error in sendPushNotification for user ${userId}:`, error);
  }
}



export const acceptDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId, userId } = req.params;
    const userRole = (req as any).user.userType;

    const { delivery, isAuthorized, message } = await validateUserPermission(
      deliveryId,
      userId,
      userRole
    );

    if (!isAuthorized || !delivery) {
      return res.status(403).json({ success: false, message: message || "Unauthorized" });
    }

    // Only delivery partners can accept
    if (userRole !== "delivery_partner") {
      return res.status(403).json({ success: false, message: "Only delivery dispatcher can accept deliveries" });
    }

    // Check if delivery is already accepted
    if (delivery.status === "request_accepted" && delivery.deliveryPartner) {
      return res.status(409).json({ success: false, message: "Delivery has already been accepted by another dispatcher" });
    }

    // Allow acceptance when status is "pending" and user is in offeredPartners, or status is "assigned" (but no partner yet)
    const isOfferedPartner = delivery.offeredPartners?.some(id => id.toString() === userId) ?? false;
    const canAccept = (delivery.status === "pending" && isOfferedPartner) || (delivery.status === "assigned" && !delivery.deliveryPartner);

    if (!canAccept) {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be accepted in ${delivery.status} status. Only pending (with offer) or assigned (without partner) deliveries can be accepted.`
      });
    }

    // Atomic update: only if status hasn't changed
    const updatedDelivery = await Delivery.findOneAndUpdate(
      { _id: deliveryId, status: { $in: ["pending", "assigned"] } },
      {
        $set: {
          deliveryPartner: new Types.ObjectId(userId),
          status: "request_accepted",
        },
        $push: {
          timeline: {
            status: "request_accepted",
            timestamp: new Date(),
            note: `Delivery accepted by dispatcher ${userId}`
          }
        }
      },
      { new: true }
    );

    if (!updatedDelivery) {
      return res.status(409).json({ success: false, message: "Delivery was already accepted by another partner" });
    }

    // Update partner status (busy and set current delivery)
    await userModel.findByIdAndUpdate(userId, {
      "deliveryPartnerInfo.status": "busy",
      "deliveryPartnerInfo.currentDelivery": updatedDelivery._id,
    });




    // Get partner details for notifications
    const partner = await userModel.findById(userId);
    const partnerName = partner ? `${partner.firstName} ${partner.lastName}` : "Your rider";

    const notificationData = {
      type: "delivery_accepted",
      deliveryId: updatedDelivery._id.toString(),
      trackingId: updatedDelivery.trackingId,
      partnerName,
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await Notification.create({
      recipient: updatedDelivery.customer,
      type: "delivery_accepted",
      status: "info",
      content: `${partnerName} has accepted your delivery and is heading towards you for pickup.`,
      data: notificationData,
      read: false
    });

    await sendPushNotification(
      updatedDelivery.customer.toString(),
      "🚚 Delivery Accepted",
      `${partnerName} has accepted your delivery and is on their way to pick it up!`,
      notificationData
    );

    // Notify partner (self)
    await Notification.create({
      recipient: userId,
      type: "delivery_accepted_partner",
      status: "info",
      content: `You have accepted delivery #${updatedDelivery.trackingId}. Head to the pickup location.`,
      data: notificationData,
      read: false
    });

    // Emit socket event to customer (real-time)
    const { getIO, userSockets } = await import('../socket');
    const customerSocketId = userSockets.get(updatedDelivery.customer.toString());
    if (customerSocketId) {
      getIO().to(customerSocketId).emit("delivery_assigned", {
        deliveryId: updatedDelivery._id.toString(),
        trackingId: updatedDelivery.trackingId,
        partnerName,
        assignedAt: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Delivery accepted successfully",
      data: { delivery: updatedDelivery }
    });
  } catch (error: any) {
    console.error("Accept delivery error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to accept delivery" });
  }
};


// Mark as Picked Up
export const markAsPickedUp = async (req: Request, res: Response) => {
  try {
    const { deliveryId, userId } = req.params;
    const { location } = req.body;
    const userRole = (req as any).user.userType;

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

    // Get delivery partner details for notification
    const deliveryPartner = await userModel.findById(userId);

    // Send notification to customer
    const notificationData = {
      type: "delivery_picked_up",
      deliveryId: delivery._id.toString(),
      deliveryCode: delivery.trackingId,
      partnerName: deliveryPartner ? `${deliveryPartner.firstName} ${deliveryPartner.lastName}` : "Delivery Rider",
      timestamp: new Date().toISOString()
    };

    // Create in-app notification
    await Notification.create({
      recipient: delivery.customer,
      type: "delivery_picked_up",
      status: "info",
      content: `Your package has been picked up by ${notificationData.partnerName} and is on its way!`,
      data: notificationData,
      read: false
    });

    // Send push notification
    await sendPushNotification(
      delivery.customer.toString(),
      "📦 Package Picked Up",
      `Your package has been picked up by ${notificationData.partnerName}`,
      notificationData
    );

    res.status(200).json({
      success: true,
      message: "Delivery marked as picked up successfully",
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          deliveryCode: delivery.trackingId,
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
    const { deliveryId, userId } = req.params;
    const { location } = req.body;
    const userRole = (req as any).user.userType;

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
    const notificationData = {
      type: "delivery_in_transit",
      deliveryId: delivery._id.toString(),
      deliveryCode: delivery.trackingId,
      timestamp: new Date().toISOString()
    };

    // Create in-app notification
    await Notification.create({
      recipient: delivery.customer,
      type: "delivery_in_transit",
      status: "info",
      content: "Your package is now in transit and on its way to you!",
      data: notificationData,
      read: false
    });

    // Send push notification
    await sendPushNotification(
      delivery.customer.toString(),
      "🚚 Package In Transit",
      "Your package is now in transit and on its way to you!",
      notificationData
    );

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


export const cancelDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId, userId } = req.params;
    const { reason } = req.body;
    const userRole = (req as any).user.userType;
    const result = await cancelDeliveryCore(deliveryId, userId, userRole, reason);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    console.error('Cancel delivery error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to cancel delivery',
    });
  }
};


export const cancelMultipleDeliveries = async (req: Request, res: Response) => {
  try {
    const { deliveryIds } = req.body;
    const userId = (req as any).user.id;        // adjust based on your auth middleware
    const userRole = (req as any).user.userType;

    // Input validation
    if (!deliveryIds || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of delivery IDs',
      });
    }

    // Process each cancellation
    const results = await Promise.allSettled(
      deliveryIds.map((id: string) =>
        cancelDeliveryCore(id, userId, userRole, 'partner_unavailable') // default reason
      )
    );

    // Extract successful and failed ones
    const successful: any[] = [];
    const failed: { deliveryId: string; message: string }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const cancelResult = result.value;
        if (cancelResult.success) {
          successful.push(cancelResult.data);
        } else {
          failed.push({
            deliveryId: deliveryIds[index],
            message: cancelResult.message,
          });
        }
      } else {
        failed.push({
          deliveryId: deliveryIds[index],
          message: result.reason?.message || 'Unknown error',
        });
      }
    });

    // Prepare response
    const response: any = {
      success: failed.length === 0,
      message: `Processed ${deliveryIds.length} deliveries: ${successful.length} succeeded, ${failed.length} failed`,
    };

    if (successful.length > 0) {
      response.data = {
        successful,
        failed,
      };
    } else {
      response.data = { failed };
    }

    // If all failed, return 400; else 200 (partial success)
    if (failed.length === deliveryIds.length) {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Multiple cancel error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process multiple cancellations',
    });
  }
};









// Helper to calculate splits (new percentages)
const calculateSplits = (price: any) => {
  return {
    admin: (price * 22.5) / 100,   // 22.5% admin (includes service fee and tax)
    rider: (price * 77.5) / 100    // 77.5% to rider
  };
};

// Helper to create earnings for a delivery (no separate tax)
const createEarnings = async (delivery: any) => {
  if (delivery.earningsProcessed) {
    return; // Already processed
  }

  const splits = calculateSplits(delivery.price);
  const earningsToCreate = [];

  // Find admin user (system admin)
  const admins = await userModel.find({ userType: 'super admin' });
  if (admins.length === 0) {
    throw new Error('No admin user found to assign earnings');
  }
  const adminUser = admins[0];

  if (!delivery.deliveryPartner) {
    throw new Error('Delivery partner not assigned');
  }

  // Create earning records
  earningsToCreate.push({
    delivery: delivery._id,
    recipient: adminUser._id,
    type: 'admin',
    amount: splits.admin,
    percentage: 22.5
  });
  earningsToCreate.push({
    delivery: delivery._id,
    recipient: delivery.deliveryPartner,
    type: 'delivery',
    amount: splits.rider,
    percentage: 77.5
  });

  await earningModel.insertMany(earningsToCreate);

  // ** NEW: Update delivery partner's earnings totals **
  await userModel.findByIdAndUpdate(
    delivery.deliveryPartner,
    {
      $inc: {
        'deliveryPartnerInfo.earnings.total': splits.rider,
        'deliveryPartnerInfo.earnings.pending': splits.rider
      }
    },
    { new: true }
  );

  delivery.earningsProcessed = true;
  await delivery.save();

  return {
    adminAmount: splits.admin,
    riderAmount: splits.rider
  };
};

export const confirmDeliveryByPartner = async (req: Request, res: Response) => {
  try {
    const { deliveryId, userId } = req.params;
    const { code } = req.body;

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

    // Confirm by partner (now marks as delivered immediately)
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
          status: delivery.status, // now "delivered"
          partnerConfirmed: delivery.confirmation.partnerConfirmed,
          deliveryCode: delivery.trackingId,
        },
      },
    };

    // Since delivery is now marked as delivered
    if (delivery.status === "delivered") {

      await userModel.findByIdAndUpdate(userId, {
        $set: {
          "deliveryPartnerInfo.status": "available",
          "deliveryPartnerInfo.currentDelivery": null   // ✅ null is better than ""
        },
        $inc: {
          "deliveryPartnerInfo.completedDeliveries": 1,
          "deliveryPartnerInfo.totalDeliveries": 1
        }
      });
      // Create earnings records
      let earnings;
      try {
        earnings = await createEarnings(delivery);
      } catch (err) {
        console.error('Error creating earnings:', err);
      }

      // Get partner details
      const partner = await userModel.findById(userId);
      const customerName = delivery?.customer ? `${delivery?.customer?.firstName} ${delivery?.customer?.lastName}` : "Customer";

      // Notify delivery partner (rider)
      if (delivery.deliveryPartner) {
        const riderEarnings = earnings ? earnings.riderAmount : delivery.price;
        const completionDataCustomer = {
          type: "delivery_completed",
          deliveryId: delivery._id.toString(),
          trackingId: delivery.trackingId,
          customerName,
          completedAt: new Date().toISOString(),
          earnings: riderEarnings
        };

        await Notification.create({
          recipient: delivery.deliveryPartner,
          type: "delivery_completed",
          status: "success",
          content: `Delivery #${delivery.trackingId} completed! You earned ₦${riderEarnings?.toFixed(2)}`,
          data: completionDataCustomer,
          read: false
        });

        await sendPushNotification(
          delivery.deliveryPartner.toString(),
          "✅ Delivery Completed!",
          `You've successfully completed delivery #${delivery.trackingId} and earned ₦${riderEarnings?.toFixed(2)}`,
          completionDataCustomer
        );
      }

      if (delivery.customer) {
        const completionData = {
          type: "delivery_completed",
          deliveryId: delivery._id.toString(),
          deliveryCode: delivery.trackingId,
          partnerName: partner ? `${partner.firstName} ${partner.lastName}` : "Delivery dispatcher",
          completedAt: new Date().toISOString()
        };

        await Notification.create({
          recipient: delivery.customer,
          type: "delivery_completed",
          status: "success",
          content: `Your delivery #${delivery.trackingId} has been marked as delivered by your dispatcher!`,
          data: completionData,
          read: false
        });

        await sendPushNotification(
          delivery.customer.toString(),
          "✅ Delivery Completed",
          `Your delivery #${delivery.trackingId} has been delivered successfully!`,
          completionData
        );
      }

      // Notify partner of earnings
      const partnerCompletionData = {
        type: "earnings_updated",
        deliveryId: delivery._id.toString(),
        deliveryCode: delivery.trackingId,
        earnings: delivery.price,
        completedAt: new Date().toISOString()
      };

      await Notification.create({
        recipient: delivery.deliveryPartner,
        type: "delivery_completed",
        status: "success",
        content: `You've earned ₦${delivery.price} for delivery #${delivery.trackingId}`,
        data: partnerCompletionData,
        read: false
      });

      await sendPushNotification(
        delivery.deliveryPartner.toString(),
        "💰 Earnings Updated",
        `You earned ₦${delivery.price} for delivery #${delivery.trackingId}`,
        partnerCompletionData
      );

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
      .select("status deliveryCode confirmation customer deliveryPartner timeline price")
      .populate("customer", "firstName lastName email phone")
      .populate("deliveryPartner", "firstName lastName email phone");

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
          deliveryCode: delivery.trackingId,
          price: delivery.price,
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
            name: `${delivery.customer.firstName} ${delivery.customer.lastName}`,
            email: delivery.customer.email,
            phone: delivery.customer.phone,
          },
          deliveryPartner: delivery.deliveryPartner ? {
            id: delivery.deliveryPartner._id,
            name: `${delivery.deliveryPartner.firstName} ${delivery.deliveryPartner.lastName}`,
            email: delivery.deliveryPartner.email,
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