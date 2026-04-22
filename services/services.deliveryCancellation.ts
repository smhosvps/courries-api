// // cancelDeliveryCore.ts
// import { Types } from 'mongoose';
// import { sendPushNotification, validateUserPermission } from '../controlers/deliveryStatus.controller';
// import Notification from '../models/notificationModel';
// import userModel from '../models/user_model';

// interface CancelResult {
//   deliveryId: string;
//   success: boolean;
//   message: string;
//   data?: any;
// }

// /**
//  * Helper: Clear a partner's currentDelivery and set status to available
//  */
// async function clearPartnerCurrentDelivery(partnerId: Types.ObjectId) {
//   await userModel.findByIdAndUpdate(partnerId, {
//     $unset: { "deliveryPartnerInfo.currentDelivery": "" },
//     $set: { "deliveryPartnerInfo.status": "available" }
//   });
// }

// export const cancelDeliveryCore = async (
//   deliveryId: string,
//   userId: string,
//   userRole: string,
//   reason?: string
// ): Promise<CancelResult> => {
//   console.log(`[cancelDeliveryCore] Starting cancellation for delivery: ${deliveryId}, userId: ${userId}, userRole: ${userRole}, reason: ${reason || 'none'}`);

//   try {
//     const { delivery, isAuthorized, message }: any = await validateUserPermission(
//       deliveryId,
//       userId,
//       userRole
//     );

//     console.log(`[cancelDeliveryCore] Validation result - isAuthorized: ${isAuthorized}, message: ${message}, delivery exists: ${!!delivery}`);

//     if (!isAuthorized || !delivery) {
//       return {
//         deliveryId,
//         success: false,
//         message: message || "Unauthorized to cancel this delivery",
//       };
//     }

//     console.log(`[cancelDeliveryCore] Delivery details - status: ${delivery.status}, customer: ${delivery.customer}, deliveryPartner: ${delivery.deliveryPartner}`);

//     const isCustomer = delivery.customer?.toString() === userId;
//     const isAssignedPartner = delivery.deliveryPartner?.toString() === userId;
//     const isAdmin = userRole === "admin" || userRole === "super admin";
//     const cancellationReason = reason || "customer_request";

//     // ✅ Handle partner declining a pending (unassigned) delivery
//     if (userRole === "delivery_partner" && delivery.status === "pending" && !delivery.deliveryPartner) {
//       console.log(`[cancelDeliveryCore] Partner declining unassigned pending delivery - removing partner from offeredPartners`);

//       // Remove this partner from offeredPartners if present
//       if (delivery.offeredPartners && delivery.offeredPartners.includes(new Types.ObjectId(userId))) {
//         delivery.offeredPartners = delivery.offeredPartners.filter(
//           (partnerId: Types.ObjectId) => partnerId.toString() !== userId
//         );
//         await delivery.save();
//         console.log(`[cancelDeliveryCore] Partner ${userId} removed from offeredPartners`);
//       } else {
//         console.log(`[cancelDeliveryCore] Partner ${userId} not found in offeredPartners, nothing to remove`);
//       }

//       return {
//         deliveryId,
//         success: true,
//         message: "Offer declined",
//         data: { id: delivery._id, status: delivery.status }, // status remains "pending"
//       };
//     }

//     // ------------------- PARTNER ACTION -------------------
//     if (isAssignedPartner) {
//       console.log(`[cancelDeliveryCore] Partner action - status: ${delivery.status}`);

//       // Case 1: Partner rejects the offer BEFORE accepting (status = 'assigned')
//       if (delivery.status === "assigned") {
//         console.log(`[cancelDeliveryCore] Partner rejecting assigned delivery, calling unassignByPartner`);
//         await delivery.unassignByPartner(cancellationReason, new Types.ObjectId(userId));

//         // Clear partner's currentDelivery and set status to available
//         await clearPartnerCurrentDelivery(delivery.deliveryPartner);

//         // Notify customer that partner is unavailable and delivery is reassigned
//         if (delivery.customer) {
//           const notificationData = {
//             type: "delivery_partner_unavailable",
//             deliveryId: delivery._id.toString(),
//             trackingId: delivery.trackingId,
//             reason: cancellationReason,
//             timestamp: new Date().toISOString(),
//           };

//           await Notification.create({
//             recipient: delivery.customer,
//             type: "delivery_partner_unavailable",
//             status: "pending",
//             content: `Delivery #${delivery.trackingId} is no longer assigned. A new partner will be assigned shortly.`,
//             data: notificationData,
//             read: false,
//           });

//           await sendPushNotification(
//             delivery.customer.toString(),
//             "⚠️ Dispatcher Unavailable",
//             `Your delivery #${delivery.trackingId} is being reassigned to another partner.`,
//             notificationData
//           );
//         }

//         console.log(`[cancelDeliveryCore] Dispatcher unassigned successfully, returning success`);
//         return {
//           deliveryId,
//           success: true,
//           message: "Delivery unassigned and moved back to pending queue",
//           data: { id: delivery._id, status: delivery.status },
//         };
//       }

//       // Case 2: Partner cancels AFTER acceptance (status = 'request_accepted', 'picked_up', 'in_transit')
//       if (["request_accepted", "picked_up", "in_transit"].includes(delivery.status)) {
//         console.log(`[cancelDeliveryCore] Dispatcher cancelling after acceptance, calling unassignPartnerAndReset`);
//         await delivery.unassignPartnerAndReset(cancellationReason, new Types.ObjectId(userId));

//         // Clear partner's currentDelivery and set status to available
//         await clearPartnerCurrentDelivery(delivery.deliveryPartner);

//         // Notify customer that partner is unavailable and delivery is reassigned
//         if (delivery.customer) {
//           const notificationData = {
//             type: "delivery_partner_unavailable",
//             deliveryId: delivery._id.toString(),
//             trackingId: delivery.trackingId,
//             reason: cancellationReason,
//             timestamp: new Date().toISOString(),
//           };

//           await Notification.create({
//             recipient: delivery.customer,
//             type: "delivery_partner_unavailable",
//             status: "pending",
//             content: `Delivery #${delivery.trackingId} is being reassigned to another dispatcher because the current dispatcher cancelled.`,
//             data: notificationData,
//             read: false,
//           });

//           await sendPushNotification(
//             delivery.customer.toString(),
//             "⚠️ Dispatcher Unavailable",
//             `Your delivery #${delivery.trackingId} is being reassigned to another dispatcher.`,
//             notificationData
//           );
//         }

//         console.log(`[cancelDeliveryCore] Partner cancellation after acceptance completed, delivery moved to pending`);
//         return {
//           deliveryId,
//           success: true,
//           message: "Dispatcher cancelled – delivery moved back to pending queue",
//           data: { id: delivery._id, status: delivery.status },
//         };
//       }

//       // Any other status – not allowed
//       console.log(`[cancelDeliveryCore] Partner cannot cancel in status '${delivery.status}'`);
//       return {
//         deliveryId,
//         success: false,
//         message: `Partner cannot cancel delivery in '${delivery.status}' status.`,
//       };
//     }

//     // ------------------- CUSTOMER CANCELLATION -------------------
//     if (isCustomer) {
//       console.log(`[cancelDeliveryCore] Customer action - status: ${delivery.status}, canBeCancelled: ${delivery.canBeCancelled()}`);
//       if (!delivery.canBeCancelled()) {
//         console.log(`[cancelDeliveryCore] Delivery cannot be cancelled in status ${delivery.status}`);
//         return {
//           deliveryId,
//           success: false,
//           message: `Delivery cannot be cancelled in ${delivery.status} status`,
//         };
//       }

//       const assignedPartnerId = delivery.deliveryPartner;
//       console.log(`[cancelDeliveryCore] Customer cancelling delivery, assignedPartnerId: ${assignedPartnerId}`);
//       await delivery.cancelDelivery(cancellationReason, new Types.ObjectId(userId));

//       if (assignedPartnerId) {
//         console.log(`[cancelDeliveryCore] Clearing partner ${assignedPartnerId} currentDelivery`);
//         await clearPartnerCurrentDelivery(assignedPartnerId);
//       }

//       if (assignedPartnerId) {
//         const notificationData = {
//           type: "delivery_cancelled_by_customer",
//           deliveryId: delivery._id.toString(),
//           trackingId: delivery.trackingId,
//           reason: cancellationReason,
//           timestamp: new Date().toISOString(),
//         };

//         await Notification.create({
//           recipient: assignedPartnerId,
//           type: "delivery_cancelled",
//           status: "cancelled",
//           content: `Delivery #${delivery.trackingId} has been cancelled by the user. Reason: ${cancellationReason}`,
//           data: notificationData,
//           read: false,
//         });

//         await sendPushNotification(
//           assignedPartnerId.toString(),
//           "❌ Delivery Cancelled",
//           `Delivery #${delivery.trackingId} was cancelled by the user`,
//           notificationData
//         );
//       }

//       if (delivery.paymentStatus === "paid" && delivery.paymentMethod !== "cash") {
//         console.log(`[cancelDeliveryCore] Initiating refund for customer ${delivery.customer}`);
//         const refundNotificationData = {
//           type: "refund_initiated",
//           deliveryId: delivery._id.toString(),
//           trackingId: delivery.trackingId,
//           amount: delivery.totalAmount || delivery.price,
//           timestamp: new Date().toISOString(),
//         };

//         await Notification.create({
//           recipient: delivery.customer,
//           type: "refund_initiated",
//           status: "processing",
//           content: `Refund of ₦${(delivery.totalAmount || delivery.price).toLocaleString()} for delivery #${delivery.trackingId} has been initiated. It may take 3–5 business days to reflect in your account.`,
//           data: refundNotificationData,
//           read: false,
//         });

//         await sendPushNotification(
//           delivery.customer.toString(),
//           "💰 Refund Initiated",
//           `Your refund of ₦${(delivery.totalAmount || delivery.price).toLocaleString()} for delivery #${delivery.trackingId} has been initiated.`,
//           refundNotificationData
//         );
//       }

//       console.log(`[cancelDeliveryCore] Customer cancellation completed successfully`);
//       return {
//         deliveryId,
//         success: true,
//         message: "Delivery cancelled successfully",
//         data: { id: delivery._id, status: delivery.status },
//       };
//     }

//     // ------------------- ADMIN CANCELLATION -------------------
//     if (isAdmin) {
//       console.log(`[cancelDeliveryCore] Admin cancellation - status: ${delivery.status}`);
//       const assignedPartnerId = delivery.deliveryPartner;
//       await delivery.cancelDelivery(cancellationReason, new Types.ObjectId(userId));
//       if (assignedPartnerId) {
//         console.log(`[cancelDeliveryCore] Clearing partner ${assignedPartnerId} currentDelivery`);
//         await clearPartnerCurrentDelivery(assignedPartnerId);
//       }
//       console.log(`[cancelDeliveryCore] Admin cancellation completed`);
//       return {
//         deliveryId,
//         success: true,
//         message: "Delivery cancelled by admin",
//         data: { id: delivery._id, status: delivery.status },
//       };
//     }

//     // If we reach here, none of the roles matched
//     console.log(`[cancelDeliveryCore] Unable to determine cancellation action - no matching role. isCustomer=${isCustomer}, isAssignedPartner=${isAssignedPartner}, isAdmin=${isAdmin}`);
//     return {
//       deliveryId,
//       success: false,
//       message: "Unable to determine cancellation action",
//     };
//   } catch (error: any) {
//     console.error(`[cancelDeliveryCore] Exception for delivery ${deliveryId}:`, error);
//     return {
//       deliveryId,
//       success: false,
//       message: error.message || "Failed to cancel delivery",
//     };
//   }
// };





// cancelDeliveryCore.ts
import { Types } from 'mongoose';
import { sendPushNotification, validateUserPermission } from '../controlers/deliveryStatus.controller';
import Notification from '../models/notificationModel';
import userModel from '../models/user_model';

interface CancelResult {
  deliveryId: string;
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Helper: Clear a partner's currentDelivery and set status to available
 * Returns true if successful, false otherwise
 */
async function clearPartnerCurrentDelivery(partnerId: Types.ObjectId): Promise<boolean> {
  if (!partnerId) {
    console.error(`[clearPartnerCurrentDelivery] ❌ Called with invalid partnerId: ${partnerId}`);
    return false;
  }

  console.log(`[clearPartnerCurrentDelivery] 🔄 Clearing partner ${partnerId} - setting status to available and unsetting currentDelivery`);

  const result = await userModel.findByIdAndUpdate(
    partnerId,
    {
      $unset: { "deliveryPartnerInfo.currentDelivery": "" },
      $set: { "deliveryPartnerInfo.status": "available" },
      $inc: {
        "deliveryPartnerInfo.cancelledDeliveries": 1,
        "deliveryPartnerInfo.totalDeliveries": 1
      }
    },
    { new: true }
  );

  const success = !!result;
  console.log(`[clearPartnerCurrentDelivery] 📊 Update result for partner ${partnerId}:`, {
    success,
    newStatus: result?.deliveryPartnerInfo?.status,
    currentDeliveryRemoved: result?.deliveryPartnerInfo?.currentDelivery === undefined,
    partnerFound: !!result
  });

  if (success) {
    console.log(`[clearPartnerCurrentDelivery] ✅ Partner ${partnerId} status is now "${result?.deliveryPartnerInfo?.status}"`);
  } else {
    console.error(`[clearPartnerCurrentDelivery] ❌ Failed to update partner ${partnerId} - user not found or update failed`);
  }

  return success;
}

export const cancelDeliveryCore = async (
  deliveryId: string,
  userId: string,
  userRole: string,
  reason?: string
): Promise<CancelResult> => {
  console.log(`[cancelDeliveryCore] 🚀 Starting cancellation for delivery: ${deliveryId}, userId: ${userId}, userRole: ${userRole}, reason: ${reason || 'none'}`);

  try {
    const { delivery, isAuthorized, message }: any = await validateUserPermission(
      deliveryId,
      userId,
      userRole
    );

    console.log(`[cancelDeliveryCore] Validation result - isAuthorized: ${isAuthorized}, message: ${message}, delivery exists: ${!!delivery}`);

    if (!isAuthorized || !delivery) {
      return {
        deliveryId,
        success: false,
        message: message || "Unauthorized to cancel this delivery",
      };
    }

    console.log(`[cancelDeliveryCore] Delivery details - status: ${delivery.status}, customer: ${delivery.customer}, deliveryPartner: ${delivery.deliveryPartner}`);

    const isCustomer = delivery.customer?.toString() === userId;
    const isAssignedPartner = delivery.deliveryPartner?.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "super admin";
    const cancellationReason = reason || "customer_request";

    // ✅ Handle partner declining a pending (unassigned) delivery
    if (userRole === "delivery_partner" && delivery.status === "pending" && !delivery.deliveryPartner) {
      console.log(`[cancelDeliveryCore] Partner declining unassigned pending delivery - removing partner from offeredPartners`);

      if (delivery.offeredPartners && delivery.offeredPartners.includes(new Types.ObjectId(userId))) {
        delivery.offeredPartners = delivery.offeredPartners.filter(
          (partnerId: Types.ObjectId) => partnerId.toString() !== userId
        );
        await delivery.save();
        console.log(`[cancelDeliveryCore] Partner ${userId} removed from offeredPartners`);
      } else {
        console.log(`[cancelDeliveryCore] Partner ${userId} not found in offeredPartners, nothing to remove`);
      }

      return {
        deliveryId,
        success: true,
        message: "Offer declined",
        data: { id: delivery._id, status: delivery.status },
      };
    }

    // ------------------- PARTNER ACTION -------------------
    if (isAssignedPartner) {
      console.log(`[cancelDeliveryCore] 👤 Partner action - status: ${delivery.status}`);

      // Capture partner ID BEFORE any mutations that might nullify it
      const partnerId = delivery.deliveryPartner;
      console.log(`[cancelDeliveryCore] Stored partner ID before mutation: ${partnerId}`);

      // Case 1: Partner rejects the offer BEFORE accepting (status = 'assigned')
      if (delivery.status === "assigned") {
        console.log(`[cancelDeliveryCore] Partner rejecting assigned delivery, calling unassignByPartner`);

        await delivery.unassignByPartner(cancellationReason, new Types.ObjectId(userId));

        // Clear partner's currentDelivery and set status to available
        console.log(`[cancelDeliveryCore] Calling clearPartnerCurrentDelivery with stored partnerId: ${partnerId}`);
        const clearSuccess = await clearPartnerCurrentDelivery(partnerId);
        console.log(`[cancelDeliveryCore] clearPartnerCurrentDelivery result: ${clearSuccess}`);

        // Notify customer
        if (delivery.customer) {
          const notificationData = {
            type: "delivery_partner_unavailable",
            deliveryId: delivery._id.toString(),
            trackingId: delivery.trackingId,
            reason: cancellationReason,
            timestamp: new Date().toISOString(),
          };
          await Notification.create({
            recipient: delivery.customer,
            type: "delivery_partner_unavailable",
            status: "pending",
            content: `Delivery #${delivery.trackingId} is no longer assigned. A new partner will be assigned shortly.`,
            data: notificationData,
            read: false,
          });
          await sendPushNotification(
            delivery.customer.toString(),
            "⚠️ Dispatcher Unavailable",
            `Your delivery #${delivery.trackingId} is being reassigned to another partner.`,
            notificationData
          );
        }

        console.log(`[cancelDeliveryCore] ✅ Dispatcher unassigned successfully, returning success`);
        return {
          deliveryId,
          success: true,
          message: "Delivery unassigned and moved back to pending queue",
          data: { id: delivery._id, status: delivery.status },
        };
      }

      // Case 2: Partner cancels AFTER acceptance (status = 'request_accepted', 'picked_up', 'in_transit')
      if (["request_accepted", "picked_up", "in_transit"].includes(delivery.status)) {
        console.log(`[cancelDeliveryCore] Dispatcher cancelling after acceptance, calling unassignPartnerAndReset`);

        await delivery.unassignPartnerAndReset(cancellationReason, new Types.ObjectId(userId));

        // Clear partner's currentDelivery and set status to available using stored partnerId
        console.log(`[cancelDeliveryCore] Calling clearPartnerCurrentDelivery with stored partnerId: ${partnerId}`);
        const clearSuccess = await clearPartnerCurrentDelivery(partnerId);
        console.log(`[cancelDeliveryCore] clearPartnerCurrentDelivery result: ${clearSuccess}`);

        // Notify customer
        if (delivery.customer) {
          const notificationData = {
            type: "delivery_partner_unavailable",
            deliveryId: delivery._id.toString(),
            trackingId: delivery.trackingId,
            reason: cancellationReason,
            timestamp: new Date().toISOString(),
          };
          await Notification.create({
            recipient: delivery.customer,
            type: "delivery_partner_unavailable",
            status: "pending",
            content: `Delivery #${delivery.trackingId} is being reassigned to another dispatcher because the current dispatcher cancelled.`,
            data: notificationData,
            read: false,
          });
          await sendPushNotification(
            delivery.customer.toString(),
            "⚠️ Dispatcher Unavailable",
            `Your delivery #${delivery.trackingId} is being reassigned to another dispatcher.`,
            notificationData
          );
        }

        console.log(`[cancelDeliveryCore] ✅ Partner cancellation after acceptance completed, delivery moved to pending`);
        return {
          deliveryId,
          success: true,
          message: "Dispatcher cancelled – delivery moved back to pending queue",
          data: { id: delivery._id, status: delivery.status },
        };
      }

      console.log(`[cancelDeliveryCore] ❌ Partner cannot cancel in status '${delivery.status}'`);
      return {
        deliveryId,
        success: false,
        message: `Partner cannot cancel delivery in '${delivery.status}' status.`,
      };
    }

    // ------------------- CUSTOMER CANCELLATION -------------------
    if (isCustomer) {
      console.log(`[cancelDeliveryCore] 🧑 Customer action - status: ${delivery.status}, canBeCancelled: ${delivery.canBeCancelled()}`);
      if (!delivery.canBeCancelled()) {
        console.log(`[cancelDeliveryCore] Delivery cannot be cancelled in status ${delivery.status}`);
        return {
          deliveryId,
          success: false,
          message: `Delivery cannot be cancelled in ${delivery.status} status`,
        };
      }

      const assignedPartnerId = delivery.deliveryPartner;
      console.log(`[cancelDeliveryCore] Customer cancelling delivery, assignedPartnerId: ${assignedPartnerId}`);
      await delivery.cancelDelivery(cancellationReason, new Types.ObjectId(userId));

      if (assignedPartnerId) {
        console.log(`[cancelDeliveryCore] Clearing partner ${assignedPartnerId} currentDelivery via customer cancellation`);
        await clearPartnerCurrentDelivery(assignedPartnerId);
        console.log(`[cancelDeliveryCore] Finished clearing partner status for ${assignedPartnerId}`);
      }

      if (assignedPartnerId) {
        const notificationData = {
          type: "delivery_cancelled_by_customer",
          deliveryId: delivery._id.toString(),
          trackingId: delivery.trackingId,
          reason: cancellationReason,
          timestamp: new Date().toISOString(),
        };
        await Notification.create({
          recipient: assignedPartnerId,
          type: "delivery_cancelled",
          status: "cancelled",
          content: `Delivery #${delivery.trackingId} has been cancelled by the user. Reason: ${cancellationReason}`,
          data: notificationData,
          read: false,
        });
        await sendPushNotification(
          assignedPartnerId.toString(),
          "❌ Delivery Cancelled",
          `Delivery #${delivery.trackingId} was cancelled by the user`,
          notificationData
        );
      }

      if (delivery.paymentStatus === "paid" && delivery.paymentMethod !== "cash") {
        console.log(`[cancelDeliveryCore] Initiating refund for customer ${delivery.customer}`);
        const refundNotificationData = {
          type: "refund_initiated",
          deliveryId: delivery._id.toString(),
          trackingId: delivery.trackingId,
          amount: delivery.totalAmount || delivery.price,
          timestamp: new Date().toISOString(),
        };
        await Notification.create({
          recipient: delivery.customer,
          type: "refund_initiated",
          status: "processing",
          content: `Refund of ₦${(delivery.totalAmount || delivery.price).toLocaleString()} for delivery #${delivery.trackingId} has been initiated. It may take 3–5 business days to reflect in your account.`,
          data: refundNotificationData,
          read: false,
        });
        await sendPushNotification(
          delivery.customer.toString(),
          "💰 Refund Initiated",
          `Your refund of ₦${(delivery.totalAmount || delivery.price).toLocaleString()} for delivery #${delivery.trackingId} has been initiated.`,
          refundNotificationData
        );
      }

      console.log(`[cancelDeliveryCore] ✅ Customer cancellation completed successfully`);
      return {
        deliveryId,
        success: true,
        message: "Delivery cancelled successfully",
        data: { id: delivery._id, status: delivery.status },
      };
    }

    // ------------------- ADMIN CANCELLATION -------------------
    if (isAdmin) {
      console.log(`[cancelDeliveryCore] 👑 Admin cancellation - status: ${delivery.status}`);
      const assignedPartnerId = delivery.deliveryPartner;
      await delivery.cancelDelivery(cancellationReason, new Types.ObjectId(userId));
      if (assignedPartnerId) {
        console.log(`[cancelDeliveryCore] Clearing partner ${assignedPartnerId} currentDelivery via admin cancellation`);
        await clearPartnerCurrentDelivery(assignedPartnerId);
        console.log(`[cancelDeliveryCore] Finished clearing partner status for ${assignedPartnerId}`);
      }
      console.log(`[cancelDeliveryCore] ✅ Admin cancellation completed`);
      return {
        deliveryId,
        success: true,
        message: "Delivery cancelled by admin",
        data: { id: delivery._id, status: delivery.status },
      };
    }

    console.log(`[cancelDeliveryCore] ❌ Unable to determine cancellation action - no matching role. isCustomer=${isCustomer}, isAssignedPartner=${isAssignedPartner}, isAdmin=${isAdmin}`);
    return {
      deliveryId,
      success: false,
      message: "Unable to determine cancellation action",
    };
  } catch (error: any) {
    console.error(`[cancelDeliveryCore] ❌ Exception for delivery ${deliveryId}:`, error);
    return {
      deliveryId,
      success: false,
      message: error.message || "Failed to cancel delivery",
    };
  }
};