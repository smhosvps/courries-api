import { Request, Response } from 'express';
import { Delivery } from "../models/Delivery";
import Notification from "../models/notificationModel";
import userModel from "../models/user_model";
import { sendPushToUser } from "../services/onesignalService";
import { getIO, userSockets } from '../socket';

// Configuration
const BATCH_SIZE = 3;
const OFFER_TIMEOUT_SECONDS = 30;
const SEARCH_RADIUS_KM = 10;
const POLL_INTERVAL_MS = 3000; 

// Helper: emit event to a specific user via Socket.IO
function emitToUser(userId: string, event: string, data: any) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    getIO().to(socketId).emit(event, data);
    console.log(`[Socket] Emitted ${event} to user ${userId}`);
  } else {
    console.log(`[Socket] User ${userId} offline, skipping ${event}`);
  }
}

// ----------------------------------------------------------------------
// Helper: Send push notification
// ----------------------------------------------------------------------
export const sendPushNotification = async (
  userId: string,
  title: string,
  message: string,
  data: any
) => {
  console.log(`[sendPushNotification] Starting for userId: ${userId}`);
  try {
    const user = await userModel.findById(userId);
    if (!user || !user.onesignalPlayerId) return;
    await sendPushToUser(user, title, message, data);
  } catch (error) {
    console.error(`[sendPushNotification] Error for user ${userId}:`, error);
  }
};

// ----------------------------------------------------------------------
// Helper: Save notification in database
// ----------------------------------------------------------------------
const createNotificationRecord = async (
  recipientId: string,
  type: string,
  status: string,
  content: string,
  data: any
) => {
  try {
    await Notification.create({
      recipient: recipientId,
      type,
      status,
      content,
      data,
      read: false,
    });
  } catch (error) {
    console.error(`[createNotificationRecord] Failed for ${recipientId}:`, error);
  }
};

// ----------------------------------------------------------------------
// Notify customer that a dispatcher has been assigned (only via manual accept)
// ----------------------------------------------------------------------
async function notifyCustomerAssignment(deliveryId: string, partnerName: string, partnerId: string) {
  const delivery = await Delivery.findById(deliveryId)
    .populate("customer", "firstName lastName")
    .populate("deliveryPartner", "firstName lastName avatar phone");

  if (!delivery) return;

  const assignData = {
    type: "partner_assigned",
    deliveryId: delivery._id.toString(),
    trackingId: delivery.trackingId,
    partnerName,
    partnerId,
    assignedAt: new Date().toISOString(),
  };

  await createNotificationRecord(
    delivery.customer._id.toString(),
    "partner_assigned",
    "success",
    `A dispatcher has been assigned to your delivery #${delivery.trackingId}`,
    assignData
  );
  await sendPushNotification(
    delivery.customer._id.toString(),
    "✅ Dispatcher Assigned",
    `Your delivery #${delivery.trackingId} has been assigned to a dispatcher.`,
    assignData
  );
  emitToUser(delivery.customer._id.toString(), "delivery_assigned", assignData);
}

// ----------------------------------------------------------------------
// Send offers to a batch of partners
// ----------------------------------------------------------------------
async function sendOffersToBatch(deliveryId: string, partners: any[]) {
  const delivery = await Delivery.findById(deliveryId)
    .populate("customer", "firstName lastName avatar phone");
  if (!delivery) throw new Error("Delivery not found");

  const customerName = delivery.customer
    ? `${delivery.customer.firstName} ${delivery.customer.lastName}`
    : "Customer";
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);

  const offeredIds = partners.map(p => p._id);
  await Delivery.findByIdAndUpdate(deliveryId, {
    $addToSet: { offeredPartners: { $each: offeredIds } },
  });

  for (const partner of partners) {
    const notificationData = {
      type: "delivery_offer",
      deliveryId: delivery._id.toString(),
      pickupAddress: delivery.pickup.address,
      deliveryAddress: delivery.delivery.address,
      expiresAt: expiresAt.toISOString(),
      price: delivery.totalAmount,
      package: delivery.package?.type,
      phone: delivery.pickup.contactPhone,
      avatar: delivery.customer?.avatar?.url || "",
      customerName,
    };

    await createNotificationRecord(
      partner._id.toString(),
      "delivery_offer",
      "pending",
      `New delivery request: ${delivery.pickup.address.slice(0, 50)}`,
      notificationData
    );
    await sendPushNotification(
      partner._id.toString(),
      "🛵 New Delivery Request",
      `Pickup: ${delivery.pickup.address.slice(0, 50)}`,
      notificationData
    );
    emitToUser(partner._id.toString(), "new_delivery_offer", notificationData);
  }
}

// ----------------------------------------------------------------------
// Find next batch of partners (excluding already offered ones)
// ----------------------------------------------------------------------
async function findNextBatch(deliveryId: string): Promise<any[]> {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return [];

  const pickupCoordinates = delivery.pickup.location.coordinates;
  if (!Array.isArray(pickupCoordinates) || pickupCoordinates.length !== 2) {
    console.error(`[findNextBatch] Invalid pickup coordinates`);
    return [];
  }

  const geoNearStage = {
    $geoNear: {
      near: { type: "Point", coordinates: pickupCoordinates },
      distanceField: "distanceInMeters",
      maxDistance: SEARCH_RADIUS_KM * 1000,
      query: {
        userType: "delivery_partner",
        "deliveryPartnerInfo.online": true,
        "deliveryPartnerInfo.status": "available",
        "deliveryPartnerInfo.vehicle.type": delivery.deliveryType,
        _id: { $nin: delivery.offeredPartners || [] },
      },
      spherical: true,
      key: "deliveryPartnerInfo.location.coordinates",
    },
  };

  try {
    const partners = await userModel.aggregate([geoNearStage, { $limit: BATCH_SIZE }]);
    return partners;
  } catch (err: any) {
    console.error(`[findNextBatch] Aggregation failed:`, err.message);
    return [];
  }
}

// ----------------------------------------------------------------------
// Poll delivery status until timeout or acceptance
// ----------------------------------------------------------------------
async function waitForAcceptance(deliveryId: string, timeoutSeconds: number): Promise<boolean> {
  const endTime = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < endTime) {
    const delivery = await Delivery.findById(deliveryId).select("status");
    if (!delivery) return false;
    if (delivery.status === "request_accepted" || delivery.status === "assigned") {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

// ----------------------------------------------------------------------
// Notify customer when no partners remain (failure)
// ----------------------------------------------------------------------
async function failDelivery(deliveryId: string) {
  const delivery = await Delivery.findById(deliveryId).populate("customer", "firstName lastName");
  if (!delivery) return;
  if (delivery.status !== "pending") return;

  delivery.status = "pending";
  await delivery.save();

  const failData = {
    type: "delivery_failed",
    deliveryId: delivery._id.toString(),
    trackingId: delivery.trackingId,
  };

  await createNotificationRecord(
    delivery.customer._id.toString(),
    "delivery_failed",
    "error",
    `We couldn't find a dispatcher for delivery #${delivery.trackingId}. Please try again later.`,
    failData
  );
  await sendPushNotification(
    delivery.customer._id.toString(),
    "❌ No Dispatcher Available",
    `No dispatcher found for #${delivery.trackingId}.`,
    failData
  );
}

// ----------------------------------------------------------------------
// Main broadcast logic: offer to a batch, then recursively try next batch if no acceptance
// ----------------------------------------------------------------------
async function broadcastAndAssign(deliveryId: string): Promise<void> {
  console.log(`[broadcastAndAssign] Starting for delivery ${deliveryId}`);

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery || delivery.status !== "pending") {
    console.log(`[broadcastAndAssign] Delivery not pending (status: ${delivery?.status}), exiting.`);
    return;
  }

  const partners = await findNextBatch(deliveryId);
  if (partners.length === 0) {
    console.log(`[broadcastAndAssign] No more partners found. Failing delivery.`);
    await failDelivery(deliveryId);
    return;
  }

  await sendOffersToBatch(deliveryId, partners);
  console.log(`[broadcastAndAssign] Sent offers to ${partners.length} partners. Waiting ${OFFER_TIMEOUT_SECONDS}s for acceptance.`);

  const accepted = await waitForAcceptance(deliveryId, OFFER_TIMEOUT_SECONDS);
  if (accepted) {
    console.log(`[broadcastAndAssign] Delivery accepted by a partner. Stopping broadcast.`);
    const updatedDelivery:any = await Delivery.findById(deliveryId).populate("deliveryPartner", "firstName lastName");
    if (updatedDelivery?.deliveryPartner) {
      const partnerName = `${updatedDelivery.deliveryPartner.firstName} ${updatedDelivery.deliveryPartner.lastName}`;
      const partnerId = updatedDelivery.deliveryPartner._id.toString();
      await notifyCustomerAssignment(deliveryId, partnerName, partnerId);
    }
    return;
  }

  // No acceptance → try the next batch (recursively)
  console.log(`[broadcastAndAssign] No acceptance from this batch. Trying next batch...`);
  await broadcastAndAssign(deliveryId);
}

// ----------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------
export async function autoAssignDeliveryx(deliveryId: string): Promise<void> {
  await broadcastAndAssign(deliveryId);
}

// ----------------------------------------------------------------------
// Express Controller
// ----------------------------------------------------------------------
export const autoAssignDeliveryController = async (req: Request, res: Response) => {
  console.log("🔥 BACKEND: autoAssignDeliveryController ENTERED", req.params);
  try {
    const { deliveryId } = req.params;
    if (!deliveryId) {
      return res.status(400).json({ success: false, message: "Delivery ID required" });
    }
    autoAssignDeliveryx(deliveryId).catch(err => console.error("Auto-assign error:", err));
    res.status(200).json({ success: true, message: "Delivery broadcast started (batches of 3, no auto-assign)." });
  } catch (error: any) {
    console.error("🔥 BACKEND: Error", error);
    res.status(500).json({ success: false, message: error.message });
  }
};