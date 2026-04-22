import { Request, Response } from "express";
import { Delivery } from "../models/Delivery";
import Notification from "../models/notificationModel";
import userModel from "../models/user_model";
import mongoose, { Types } from "mongoose";
import { Wallet } from "../models/Wallet";
import axios from "axios";
import earningModel from "../models/earning.model";
import { autoAssignDeliveryx, sendPushNotification } from "../utils/autoAssignDelivery";
import { getIO, userSockets } from "../socket";
import { broadcastRideRequestToDrivers } from "../services/onesignalService";


export const createDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { pickup, delivery, ...rest } = req.body;

    // Generate a more robust unique reference
    const generateUniqueReference = (): string => {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const customerPrefix = req.user._id.toString().slice(-4);

      return `DEL-${year}${month}${day}-${timestamp}-${random}-${customerPrefix}`;
    };

    // Ensure location coordinates are properly formatted
    const deliveryData = {
      ...rest,
      reference: generateUniqueReference(),
      customer: req.user._id,
      pickup: {
        ...pickup,
        location: {
          type: "Point",
          coordinates: pickup.location?.coordinates || [0, 0],
        },
      },
      delivery: {
        ...delivery,
        location: {
          type: "Point",
          coordinates: delivery.location?.coordinates || [0, 0],
        },
      },
      timeline: [
        {
          status: "pending",
          timestamp: new Date(),
        },
      ],
    };

    // Check if reference already exists (unlikely but safe)
    const existingDelivery = await Delivery.findOne({ reference: deliveryData.reference });
    if (existingDelivery) {
      // Generate a new one if it somehow exists
      deliveryData.reference = `DEL-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    const deliveryx = new Delivery(deliveryData);
    await deliveryx.save();

    res.status(201).json({
      success: true,
      message: "Delivery created successfully",
      data: { deliveryx },
    });
  } catch (error: any) {
    console.error("Create delivery error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const editDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const userId = req.user._id; // Assuming you have authentication middleware
    const updateData = req.body;

    // Validate delivery ID
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
    }

    // Find the delivery
    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user is authorized (only customer who created it can edit)
    if (delivery.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to edit this delivery",
      });
    }

    // Check if delivery can be edited (status pending OR paymentStatus pending/failed)
    const isEditable =
      delivery.status === "pending" ||
      delivery.paymentStatus === "pending" ||
      delivery.paymentStatus === "failed";

    if (!isEditable) {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be edited when status is '${delivery.status}' and payment status is '${delivery.paymentStatus}'`,
      });
    }

    // Build update object with only allowed fields
    const allowedUpdates: any = {};

    // Package updates – only 'type' is kept; weight, dimensions, description, value are removed
    if (updateData.package) {
      allowedUpdates.package = {};

      if (updateData.package.type)
        allowedUpdates.package.type = updateData.package.type;
      // Note: images could be added later if needed, but for now we only update type
    }

    // Pickup updates
    if (updateData.pickup) {
      allowedUpdates.pickup = {};

      if (updateData.pickup.address)
        allowedUpdates.pickup.address = updateData.pickup.address;
      if (updateData.pickup.location)
        allowedUpdates.pickup.location = updateData.pickup.location;
      if (updateData.pickup.contactName)
        allowedUpdates.pickup.contactName = updateData.pickup.contactName;
      if (updateData.pickup.contactPhone)
        allowedUpdates.pickup.contactPhone = updateData.pickup.contactPhone;
      if (updateData.pickup.instructions !== undefined)
        allowedUpdates.pickup.instructions = updateData.pickup.instructions;
    }

    // Delivery updates
    if (updateData.delivery) {
      allowedUpdates.delivery = {};

      if (updateData.delivery.address)
        allowedUpdates.delivery.address = updateData.delivery.address;
      if (updateData.delivery.location)
        allowedUpdates.delivery.location = updateData.delivery.location;
      if (updateData.delivery.contactName)
        allowedUpdates.delivery.contactName = updateData.delivery.contactName;
      if (updateData.delivery.contactPhone)
        allowedUpdates.delivery.contactPhone = updateData.delivery.contactPhone;
      if (updateData.delivery.instructions !== undefined)
        allowedUpdates.delivery.instructions = updateData.delivery.instructions;
    }

    // Delivery type update
    if (updateData.deliveryType) {
      allowedUpdates.deliveryType = updateData.deliveryType;
    }

    // Recalculate distance if locations changed
    if (updateData.pickup?.location || updateData.delivery?.location) {
      // Get updated locations
      const pickupLocation =
        updateData.pickup?.location || delivery.pickup.location;
      const deliveryLocation =
        updateData.delivery?.location || delivery.delivery.location;

      // Calculate new distance using Haversine formula
      const toRadians = (degrees: number) => degrees * (Math.PI / 180);

      const lat1 = pickupLocation.coordinates[1];
      const lon1 = pickupLocation.coordinates[0];
      const lat2 = deliveryLocation.coordinates[1];
      const lon2 = deliveryLocation.coordinates[0];

      const R = 6371; // Earth's radius in kilometers

      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const calculatedDistance = parseFloat((R * c).toFixed(2));

      allowedUpdates.distance = calculatedDistance;
    }

    // Add timeline entry for edit
    allowedUpdates.$push = {
      timeline: {
        status: "edited",
        timestamp: new Date(),
        note: "Delivery details updated by customer",
      },
    };

    // Update the delivery
    const updatedDelivery = await Delivery.findByIdAndUpdate(
      deliveryId,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate("customer", "firstName lastName email phone");

    return res.status(200).json({
      success: true,
      message: "Delivery updated successfully",
      data: {
        delivery: updatedDelivery,
      },
    });
  } catch (error: any) {
    console.error("Edit delivery error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update delivery",
      error: error.message,
    });
  }
};


export const getDeliveryById = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const userId = req.user._id;

    // Validate delivery ID
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
    }

    // Find the delivery
    const delivery = await Delivery.findById(deliveryId).populate(
      "customer",
      "firstName lastName email phone"
    );

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user is authorized (only customer who created it can view)
    if (delivery.customer._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this delivery",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        delivery,
      },
    });
  } catch (error: any) {
    console.error("Get delivery error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch delivery",
      error: error.message,
    });
  }
};

export const getUserDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const deliveries = await Delivery.find({ customer: req.user._id })
      .populate("deliveryPartner", "firstName lastName phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { deliveries },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 2. Choose Delivery Type
// router.put('/:deliveryId/choose-type', authMiddleware, async (req, res) => {

export const deliveryType = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { deliveryType, distance } = req.body;

    // Validate delivery type
    const validDeliveryTypes = ["bicycle", "bike", "car", "van"];
    if (!validDeliveryTypes.includes(deliveryType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery type",
      });
    }

    // Validate distance
    const distanceNum = parseFloat(distance);
    if (isNaN(distanceNum) || distanceNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid distance value",
      });
    }

    // Find delivery
    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user owns this delivery
    if (delivery.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this delivery",
      });
    }

    // Check if delivery can be updated
    if (delivery.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot update delivery type after assignment",
      });
    }

    // Calculate price based on delivery type
    const basePrices = {
      bicycle: { base: 800, perKm: 100 },
      bike: { base: 1800, perKm: 200 },
      car: { base: 3500, perKm: 300 },
      van: { base: 5000, perKm: 400 },
    };

    const pricing = basePrices[deliveryType] || basePrices.bike;

    // Use the validated distance
    const calculatedDistance = distanceNum;
    const newPrice = Math.round(
      pricing.base + calculatedDistance * pricing.perKm
    );

    // Calculate estimated duration with validation
    const estimatedDuration = calculateEstimatedDuration(
      calculatedDistance,
      deliveryType
    );


    // Update delivery
    delivery.deliveryType = deliveryType;
    delivery.price = newPrice;
    delivery.distance = calculatedDistance;
    delivery.estimatedDuration = estimatedDuration;

    // Add to timeline
    delivery.timeline.push({
      status: "delivery_type_selected",
      timestamp: new Date(),
      location: delivery.pickup.location,
    });

    await delivery.save();

    res.json({
      success: true,
      message: "Delivery type updated successfully",
      data: { delivery },
    });
  } catch (error: any) {
    console.error("Choose delivery type error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// get delivery
export const getDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Find deliveries where user is either customer or delivery partner
    const deliveries = await Delivery.find({
      $or: [
        { customer: userId },
        { deliveryPartner: userId }
      ]
    })
      .populate("customer", "firstName lastName phone email")
      .populate("deliveryPartner", "firstName lastName phone email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      deliveries: deliveries,
      count: deliveries.length,
    });
  } catch (error: any) {
    console.error("Error fetching my deliveries:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch deliveries",
    });
  }
}



export const updateDeliveryStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, location } = req.body;

    const delivery = await Delivery.findById(req.params.id)
      .populate("customer", "firstName lastName email phone")
      .populate("deliveryPartner", "firstName lastName phone");

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
      return;
    }

    // Add to timeline
    delivery.timeline.push({
      status,
      timestamp: new Date(),
      location,
    });

    delivery.status = status;
    await delivery.save();

    // console.log(delivery, "user details")

    let notificationMessage = "";
    const customerName = (delivery.customer as any).firstName || "Customer";

    switch (status) {
      case "assigned":
        notificationMessage = `Hello ${customerName}! A delivery partner has been assigned to your package and will pick it up soon.`;
        break;
      case "picked_up":
        notificationMessage = `Great news ${customerName}! Your package has been picked up and is on its way.`;
        break;
      case "in_transit":
        notificationMessage = `Great News ${customerName}: Your package is in transit and heading to the delivery location.`;
        break;
      case "delivered":
        notificationMessage = `Congratulations ${customerName}! Your package has been successfully delivered. Thank you for using our service!`;
        break;
      case "cancelled":
        notificationMessage = `Notice ${customerName}: Your delivery has been cancelled. Please contact support for more information.`;
        break;
      default:
        notificationMessage = `Update ${customerName}: Your delivery status has been updated to ${status}.`;
    }

    await Notification.create({
      recipient: delivery.customer._id,
      type: "delivery_status_update",
      title: `Delivery Status Updated`,
      content: notificationMessage,
    });

    res.status(200).json({
      success: true,
      message: "Delivery status updated",
      data: { delivery },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 1. Tracking API - Get real-time delivery tracking information
// Update the select method to include trackingId


export const trackDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { deliveryId } = req.params;

    const delivery: any = await Delivery.findById(deliveryId)
      .populate("customer", "firstName lastName phone avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "status timeline pickup delivery package distance deliveryType trackingId price estimatedDuration customer confirmation deliveryPartner deliveryCode"
      ); // Added trackingId here!

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
      return;
    }


    // Calculate estimated time of arrival (ETA) if in transit
    let eta: any = null;
    if (delivery.status === "in_transit" && delivery.estimatedDuration) {
      const pickedUpTime = delivery.timeline.find(
        (t: any) => t.status === "picked_up"
      )?.timestamp;
      if (pickedUpTime) {
        eta = new Date(
          pickedUpTime.getTime() + delivery.estimatedDuration * 60000
        );
      }
    }

    // Get current location safely
    const currentLocation = getCurrentLocation(delivery.timeline);

    const trackingInfo = {
      deliveryId: delivery._id,
      trackingId: delivery.trackingId, // Add this line
      status: delivery.status,
      statusDescription: getStatusDescription(delivery.status),
      currentLocation: currentLocation,
      timeline: delivery.timeline.map((entry) => ({
        status: entry.status,
        timestamp: entry.timestamp,
        location: entry.location || null,
        description: getStatusDescription(entry.status),
      })),
      pickup: delivery.pickup,
      delivery: delivery.delivery,
      package: delivery.package,
      estimatedArrival: eta,
      deliveryPartner: delivery.deliveryPartner || null,
      customer: delivery.customer
        ? {
          firstName: delivery.customer.firstName,
          lastName: delivery.customer.lastName,
          phone: delivery.customer.phone,
        }
        : null,
      price: delivery.price,
      distance: delivery.distance || 0,
      deliveryCode: delivery.deliveryCode, // Also include deliveryCode if needed
      deliveryType: delivery.deliveryType, // Also include deliveryCode if needed
    };

    res.status(200).json({
      success: true,
      data: { tracking: trackingInfo },
    });
  } catch (error: any) {
    console.error("Track delivery error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to track delivery",
    });
  }
};

// Helper function to get current location from timeline
const getCurrentLocation = (timeline: any[]): any => {
  if (!timeline || !Array.isArray(timeline)) return null;

  const locationEntries = timeline
    .filter(
      (entry) => entry && entry.location && typeof entry.location === "object"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return locationEntries.length > 0 ? locationEntries[0].location : null;
};

// Helper function to get status description
const getStatusDescription = (status: string): string => {
  const statusDescriptions: { [key: string]: string } = {
    pending: "Waiting for delivery partner assignment",
    assigned: "Delivery partner assigned and on the way to pickup",
    picked_up: "Package picked up from sender",
    in_transit: "Package in transit to destination",
    delivered: "Package successfully delivered",
    cancelled: "Delivery cancelled",
  };

  return statusDescriptions[status] || "Status updated";
};

// 1. Customer Ongoing Deliveries API - Only pending status
export const getCustomerOngoingDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveries = await Delivery.find({
      customer: id,
      status: { $in: ["pending", "assigned", "picked_up", "in_transit", "request_accepted"] },
    })
      .populate("customer", "firstName lastName phone avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup paymentStatus trackingId delivery package price estimatedDuration createdAt updatedAt totalAmount basePrice pricePerKm distanceFee tax serviceFee paymentMethod"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        deliveries,
        total: deliveries.length,
      },
    });
  } catch (error: any) {
    console.error("Get customer ongoing deliveries error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ongoing deliveries",
    });
  }
};



export const getCustomerTrackingDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { deliveryId } = req.params;
    const userId = req.user?._id;
    const userType = req.user?.userType;

    if (!deliveryId) {
      res.status(400).json({
        success: false,
        message: "Delivery ID is required",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
      return;
    }

    const delivery = await Delivery.findById(deliveryId)
      .populate("customer", "firstName lastName email phone avatar.url")
      .populate("deliveryPartner", "firstName lastName email phone avatar.url deliveryPartnerInfo.vehicle deliveryPartnerInfo.rating deliveryPartnerInfo.totalDeliveries")
      .populate("offeredPartners", "firstName lastName email");

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
      return;
    }



    // Authorization checks
    const isCustomer = delivery.customer._id.toString() === userId.toString();
    const isAssignedPartner = delivery.deliveryPartner && delivery.deliveryPartner._id.toString() === userId.toString();
    const isAdmin = userType === "admin" || userType === "super admin";

    if (!isCustomer && !isAssignedPartner && !isAdmin) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to view this delivery",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: delivery,
    });
  } catch (error: any) {
    console.error("Error fetching delivery details:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch delivery details",
    });
  }
};














// 2. Customer Past Deliveries API - Cancelled or delivered status
export const getCustomerPastDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveries = await Delivery.find({
      customer: id,
      status: { $in: ["cancelled", "delivered"] },
    })
      .populate("customer", "firstName lastName phone avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline trackingId pickup delivery package price estimatedDuration actualDuration paymentStatus paymentMethod createdAt updatedAt"
      )
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        deliveries,
        total: deliveries.length,
      },
    });
  } catch (error: any) {
    console.error("Get customer past deliveries error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch past deliveries",
    });
  }
};


export const getPartnerOngoingDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveries = await Delivery.find({
      deliveryPartner: id,
      status: { $in: ["pending", "assigned", "picked_up", "in_transit", "request_accepted"] },
    })
      .populate("customer", "firstName lastName phone avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup paymentStatus trackingId delivery package price estimatedDuration createdAt updatedAt totalAmount basePrice pricePerKm distanceFee tax serviceFee paymentMethod"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        deliveries,
        total: deliveries.length,
      },
    });
  } catch (error: any) {
    console.error("Get customer ongoing deliveries error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ongoing deliveries",
    });
  }
};









export const getParnerPastDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveries = await Delivery.find({
      deliveryPartner: id,
      status: { $in: ["cancelled", "delivered"] },
    })
      .populate("customer", "firstName lastName phone avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup trackingId delivery package price estimatedDuration actualDuration paymentStatus paymentMethod createdAt updatedAt"
      )
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        deliveries,
        total: deliveries.length,
      },
    });
  } catch (error: any) {
    console.error("Past deliveries error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch past deliveries",
    });
  }
};

// 3. Admin All Deliveries API - All deliveries with filtering options
export const getAllDeliveries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, dateFrom, dateTo, deliveryPartner } = req.query;

    // Build filter for admin
    const filter: any = {};

    // Status filter
    if (
      status &&
      [
        "pending",
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
      ].includes(status as string)
    ) {
      filter.status = status;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Delivery partner filter
    if (deliveryPartner) {
      filter.deliveryPartner = deliveryPartner;
    }

    const deliveries = await Delivery.find(filter)
      .populate("customer", "firstName lastName phone email avatar")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup delivery package price estimatedDuration actualDuration paymentStatus paymentMethod createdAt updatedAt"
      )
      .sort({ createdAt: -1 });

    // Get statistics
    const totalDeliveries = await Delivery.countDocuments();
    const pendingCount = await Delivery.countDocuments({ status: "pending" });
    const inProgressCount = await Delivery.countDocuments({
      status: { $in: ["assigned", "picked_up", "in_transit"] },
    });
    const completedCount = await Delivery.countDocuments({
      status: "delivered",
    });
    const cancelledCount = await Delivery.countDocuments({
      status: "cancelled",
    });

    const stats = {
      total: totalDeliveries,
      pending: pendingCount,
      inProgress: inProgressCount,
      completed: completedCount,
      cancelled: cancelledCount,
    };

    res.status(200).json({
      success: true,
      data: {
        deliveries,
        total: deliveries.length,
        stats,
      },
    });
  } catch (error: any) {
    console.error("Get all deliveries error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch deliveries",
    });
  }
};

function calculateEstimatedDuration(
  calculatedDistance: any,
  deliveryType: string
): number {
  // Ensure calculatedDistance is a valid number
  const distance = Number(calculatedDistance);

  // If distance is not a valid number, default to 5
  const validDistance = isNaN(distance) || distance <= 0 ? 5 : distance;

  const speeds: { [key: string]: number } = {
    bicycle: 15, // km/h
    bike: 40, // km/h
    car: 60, // km/h
    van: 50, // km/h
  };

  const speed = speeds[deliveryType] || 30; // Default 30 km/h
  const duration = Math.round((validDistance / speed) * 60); // Convert to minutes

  // Ensure we return a valid number, minimum 5 minutes
  return Math.max(5, duration);
}

// 4. Assign Delivery Partner
// router.put('/:deliveryId/assign', authMiddleware, async (req, res) => {


export const getDeliveryDeliverid = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;



    // Validate and convert to ObjectId
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(deliveryId);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
    }


    const delivery = await Delivery.findById(objectId)
      .populate("customer", "firstName lastName phone email")
      .populate("deliveryPartner", "firstName lastName phone avatar");

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check authorization
    // Ensure delivery.customer exists; if not, treat as not authorized for non-admin
    if (!delivery.customer) {
      // The customer reference is missing (maybe user deleted). Only admin can view.
      if (req.user.userType !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view this delivery",
        });
      }
    } else {
      const isCustomer = delivery?.customer?._id.toString() === req.user._id.toString();
      const isDeliveryPartner = delivery.deliveryPartner?._id.toString() === req.user?._id.toString();

      if (!isCustomer && !isDeliveryPartner && req?.user?.userType !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view this delivery",
        });
      }
    }

    res.json({
      success: true,
      data: { delivery },
    });
  } catch (error) {
    console.error("Get delivery error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};



// available partners 
export const AvailablePartners = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { radius = 10 } = req.query; // radius in kilometers
    console.log("Available User:", req.user);

    // Check authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user._id;



    // Find delivery
    const delivery = await Delivery.findById(deliveryId);


    // Check if delivery exists
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user owns this delivery (compare as strings)
    if (delivery.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this delivery",
      });
    }

    const pickupLocation = delivery.pickup.location;
    const customer = await userModel.findById(userId);

    // Extract coordinates from GeoJSON format
    // pickupLocation.coordinates is [lng, lat] as per GeoJSON
    const pickupCoordinates = pickupLocation.coordinates;
    const pickupLat = pickupCoordinates[1]; // latitude is at index 1
    const pickupLng = pickupCoordinates[0]; // longitude is at index 0

    // Using MongoDB's $geoNear for efficient geospatial queries
    const partners = await userModel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [pickupLng, pickupLat],
          },
          distanceField: "distanceInMeters",
          maxDistance: parseFloat(radius as string) * 1000, // Convert km to meters
          query: {
            userType: "delivery_partner",
            "deliveryPartnerInfo.online": true,
            "deliveryPartnerInfo.status": "available",
            "deliveryPartnerInfo.location.coordinates": { $exists: true },
            // REMOVED verification requirement for now
            // "deliveryPartnerInfo.verificationStatus.verified": true,
          },
          spherical: true,
          key: "deliveryPartnerInfo.location.coordinates",
        },
      },
      {
        $addFields: {
          distance: { $divide: ["$distanceInMeters", 1000] }, // Convert to km
        },
      },
      {
        $sort: { distance: 1 },
      },
      {
        $limit: 20,
      },
      {
        $project: {
          _id: 1,
          name: { $concat: ["$firstName", " ", "$lastName"] },
          phone: 1,
          avatar: 1,
          rating: "$deliveryPartnerInfo.averageRating",
          vehicle: "$deliveryPartnerInfo.vehicle",
          location: {
            coordinates: "$deliveryPartnerInfo.location.coordinates.coordinates", // ✅ fixed
            lat: { $arrayElemAt: ["$deliveryPartnerInfo.location.coordinates.coordinates", 1] },
            lng: { $arrayElemAt: ["$deliveryPartnerInfo.location.coordinates.coordinates", 0] },
          },
          distance: { $round: ["$distance", 2] },
          estimatedArrival: {
            $round: [
              {
                $divide: [
                  { $multiply: ["$distance", 60] }, // Convert km to minutes
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "bicycle"] },
                          then: 15, // km/h for bicycle
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "bike"] },
                          then: 40, // km/h for bike
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "car"] },
                          then: 60, // km/h for car
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "van"] },
                          then: 50, // km/h for van
                        },
                      ],
                      default: 30, // default km/h
                    },
                  },
                ],
              },
              0,
            ],
          },
          totalDeliveries: "$deliveryPartnerInfo.totalDeliveries",
          completedDeliveries: "$deliveryPartnerInfo.completedDeliveries",
          verificationStatus: "$deliveryPartnerInfo.verificationStatus",
          earnings: "$deliveryPartnerInfo.earnings",
        },
      },
    ]);

    console.log("Found partners:", partners.length);

    // If no partners found with geospatial query, try a simpler query without verification requirement
    let finalPartners = partners;
    if (partners.length === 0) {
      console.log("No partners found with geospatial query, trying fallback...");

      // Fallback: Get online delivery partners without distance calculation
      const fallbackPartners = await userModel
        .find({
          userType: "delivery_partner",
          "deliveryPartnerInfo.online": true,
          "deliveryPartnerInfo.status": "available",
          // REMOVED verification requirement for fallback too
          // "deliveryPartnerInfo.verificationStatus.verified": true,
        })
        .limit(10)
        .select("firstName lastName phone avatar deliveryPartnerInfo")
        .lean();

      console.log("Fallback partners found:", fallbackPartners.length);

      finalPartners = fallbackPartners.map((partner) => {
        let coordinates = [0, 0];
        let lat = 0;
        let lng = 0;

        // Handle GeoJSON format
        if (partner.deliveryPartnerInfo?.location?.coordinates) {
          if (Array.isArray(partner.deliveryPartnerInfo.location.coordinates)) {
            coordinates = partner.deliveryPartnerInfo.location.coordinates;
            lng = coordinates[0] || 0;
            lat = coordinates[1] || 0;
          } else {
            // Fallback for old format
            lng = partner.deliveryPartnerInfo.location.coordinates.lng || 0;
            lat = partner.deliveryPartnerInfo.location.coordinates.lat || 0;
            coordinates = [lng, lat];
          }
        }

        // Calculate approximate distance from pickup location
        let distance = 5; // Default distance
        if (lat !== 0 && lng !== 0) {
          // Simple distance calculation using Haversine formula
          const R = 6371; // Earth's radius in km
          const dLat = (lat - pickupLat) * Math.PI / 180;
          const dLng = (lng - pickupLng) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pickupLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = R * c;
        }

        return {
          _id: partner._id,
          name: `${partner.firstName} ${partner.lastName}`,
          phone: partner.phone,
          avatar: partner.avatar,
          rating: partner.deliveryPartnerInfo?.averageRating || 0,
          vehicle: partner.deliveryPartnerInfo?.vehicle || { type: "bike" },
          location: {
            coordinates: coordinates,
            lat: lat,
            lng: lng,
          },
          distance: Math.round(distance * 10) / 10, // Round to 1 decimal
          estimatedArrival: 15, // Default ETA
          totalDeliveries: partner.deliveryPartnerInfo?.totalDeliveries || 0,
          completedDeliveries: partner.deliveryPartnerInfo?.completedDeliveries || 0,
        };
      });
    }

    console.log("Final partners to return:", finalPartners.length);

    console.log("Available patners", finalPartners);

    res.json({
      success: true,
      data: {
        partners: finalPartners,
        pickupLocation: {
          coordinates: pickupCoordinates,
          lat: pickupLat,
          lng: pickupLng,
        },
        totalPartners: finalPartners.length,
        radius: parseFloat(radius as string),
      },
    });
  } catch (error: any) {
    console.error("Get available partners error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};










export const autoAssignDeliveryController = async (req: Request, res: Response) => {

  try {
    const { deliveryId } = req.params;
    if (!deliveryId) {
      return res.status(400).json({ success: false, message: "Delivery ID required" });
    }


    // Start the batch assignment process (asynchronous, non‑blocking)
    autoAssignDeliveryx(deliveryId).catch(err => {
      console.error("Auto-assign background error:", err);
    });

    res.status(200).json({
      success: true,
      message: "Delivery broadcast started (batches of up to 3 partners)."
    });
  } catch (error: any) {
    console.error("🔥 BACKEND: Error", error);
    res.status(500).json({ success: false, message: error.message });
  }
};




const OFFER_TIMEOUT_SECONDS = 30;

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






// ---------- Main Controller (fully corrected) ----------
export const adminAssignDeliveryController = async (req: Request, res: Response) => {
  try {
    // 1. Admin authorization
    const adminUser = (req as any).user;
    if (!adminUser || (adminUser.userType !== 'admin' && adminUser.userType !== 'super admin')) {
      return res.status(403).json({ success: false, message: "Only admin or super admin can assign deliveries" });
    }

    const { deliveryId, riderId } = req.body;
    if (!deliveryId || !riderId) {
      return res.status(400).json({ success: false, message: "Delivery ID and Rider ID are required" });
    }

    // 2. Fetch delivery – must be in 'failed_to_assign' or 'pending'
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found" });
    }
    if (delivery.status !== 'failed_to_assign' && delivery.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be manually assigned in its current status: ${delivery.status}`
      });
    }

    // 3. Fetch rider and validate availability
    const rider = await userModel.findById(riderId);
    if (!rider || rider.userType !== 'delivery_partner') {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const partnerInfo = rider.deliveryPartnerInfo;
    if (!partnerInfo) {
      return res.status(400).json({ success: false, message: "Rider profile incomplete" });
    }

    if (!partnerInfo.online) {
      return res.status(400).json({ success: false, message: "Rider is offline" });
    }
    if (partnerInfo.status !== 'available') {
      return res.status(400).json({ success: false, message: `Rider is ${partnerInfo.status}, not available` });
    }
    if (partnerInfo.vehicle?.type !== delivery.deliveryType) {
      return res.status(400).json({
        success: false,
        message: `Rider's vehicle type (${partnerInfo.vehicle?.type}) does not match delivery type (${delivery.deliveryType})`
      });
    }

    // 4. Prepare the offer data
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);
    const customer = await userModel.findById(delivery.customer).select('firstName lastName avatar');
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : "Customer";

    const offerData = {
      type: "delivery_offer",
      deliveryId: delivery._id.toString(),
      pickupAddress: delivery.pickup.address,
      deliveryAddress: delivery.delivery.address,
      expiresAt: expiresAt.toISOString(),
      price: delivery.totalAmount,
      package: delivery.package?.type,
      phone: delivery.pickup.contactPhone,
      avatar: customer?.avatar?.url || "",
      customerName,
      manualAssign: true,
      assignedBy: adminUser._id,
    };

    // After fetching rider
    console.log("Rider object:", {
      id: rider._id,
      userType: rider.userType,
      hasOnesignalPlayerId: !!rider.onesignalPlayerId,
      onesignalPlayerId: rider.onesignalPlayerId
    });

    // Then safely extract playerId
    const riderPlayerId = rider?.onesignalPlayerId?.playerId;
    console.log("Extracted riderPlayerId:", riderPlayerId);


    if (riderPlayerId) {
      const rideData = {
        pickupAddress: delivery.pickup.address,
        riderName: customerName,
        dropoffAddress: delivery.delivery.address,
        fare: delivery.totalAmount,
      };

      const rideId = delivery._id.toString()
      const user = rider

      console.log(rideData, "rider data")


      try {
        const result = await broadcastRideRequestToDrivers(user, rideData, rideId);
        console.log("broadcastRideRequestToDrivers result:", result);
      } catch (err) {
        console.error("broadcastRideRequestToDrivers threw error:", err);
      }

      console.log(`[Push] Interactive notification sent to rider ${rider._id} (playerId: ${riderPlayerId})`);

    } else {
      console.warn(`Rider ${rider._id} has no OneSignal player ID – cannot send interactive notification`);
    }

    // 6. Create database notification and socket event (in‑app fallback)
    await createNotificationRecord(
      rider._id.toString(),
      "delivery_offer",
      "pending",
      `Manual delivery assignment: ${delivery.pickup.address.slice(0, 50)}`,
      offerData
    );
    emitToUser(rider._id.toString(), "new_delivery_offer", offerData);

    // 7. Update delivery with manual assignment metadata
    await Delivery.findByIdAndUpdate(deliveryId, {
      $addToSet: { offeredPartners: rider._id },
      $set: {
        status: "pending",
        manualAssignmentExpiry: expiresAt,
        assignedByAdmin: adminUser._id,
      }
    });

    // 8. Start background watcher for acceptance / timeout
    waitForManualAcceptance(deliveryId, rider._id.toString(), adminUser._id.toString())
      .catch(err => console.error("Manual assignment acceptance watcher error:", err));

    res.status(200).json({
      success: true,
      message: `Delivery offered to rider ${rider.firstName} ${rider.lastName}. Waiting for acceptance.`
    });

  } catch (error: any) {
    console.error("Admin assign error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};



/**
 * Background watcher: waits for the rider to accept the manual offer or timeout.
 */
async function waitForManualAcceptance(deliveryId: string, riderId: string, adminId: string) {
  const endTime = Date.now() + OFFER_TIMEOUT_SECONDS * 1000;
  let accepted = false;

  while (Date.now() < endTime) {
    const delivery = await Delivery.findById(deliveryId).select("status deliveryPartner");
    if (!delivery) break;

    // If status changed to "request_accepted" and deliveryPartner matches this rider -> accepted
    if (delivery.status === "request_accepted" && delivery.deliveryPartner?.toString() === riderId) {
      accepted = true;
      break;
    }
    // Also check if delivery was assigned to another rider (should not happen, but safety)
    if (delivery.deliveryPartner && delivery.deliveryPartner.toString() !== riderId) {
      console.log(`[ManualAssign] Delivery ${deliveryId} assigned to different rider. Aborting.`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (accepted) {
    // Rider accepted – finalise
    console.log(`[ManualAssign] Rider ${riderId} accepted delivery ${deliveryId}`);
    await finalizeManualAssignment(deliveryId, riderId, adminId);
  } else {
    // Timeout or rejection – revert delivery to failed_to_assign
    console.log(`[ManualAssign] Rider ${riderId} did not accept delivery ${deliveryId} in time. Reverting.`);
    await revertManualAssignment(deliveryId, riderId, adminId);
  }
}

async function finalizeManualAssignment(deliveryId: string, riderId: string, adminId: string) {
  const delivery = await Delivery.findById(deliveryId)
    .populate("customer", "firstName lastName")
    .populate("deliveryPartner", "firstName lastName");
  if (!delivery) return;

  // Notify customer
  const partnerName = delivery.deliveryPartner
    ? `${delivery.deliveryPartner.firstName} ${delivery.deliveryPartner.lastName}`
    : "Dispatcher";
  const assignData = {
    type: "partner_assigned",
    deliveryId: delivery._id.toString(),
    trackingId: delivery.trackingId,
    partnerName,
    partnerId: riderId,
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

  // Notify admin (optional)
  const adminNotifData = {
    type: "manual_assign_success",
    deliveryId: delivery._id.toString(),
    riderId,
    trackingId: delivery.trackingId,
  };
  await createNotificationRecord(
    adminId,
    "manual_assign_success",
    "success",
    `Rider accepted delivery #${delivery.trackingId}`,
    adminNotifData
  );
  await sendPushNotification(adminId, "✅ Assignment Successful", `Rider accepted delivery #${delivery.trackingId}`, adminNotifData);
}

async function revertManualAssignment(deliveryId: string, riderId: string, adminId: string) {
  // Set delivery status back to failed_to_assign and clear any manual assignment flags
  await Delivery.findByIdAndUpdate(deliveryId, {
    status: "pending",
    $unset: { manualAssignmentExpiry: "", assignedByAdmin: "" }
  });

  // Notify admin that assignment failed
  const failData = {
    type: "manual_assign_failed",
    deliveryId,
    riderId,
  };
  await createNotificationRecord(
    adminId,
    "manual_assign_failed",
    "error",
    `Rider did not accept the manual assignment. You can try another rider.`,
    failData
  );
  await sendPushNotification(
    adminId,
    "❌ Manual Assignment Failed",
    `Rider did not accept delivery. Please assign another rider.`,
    failData
  );
}

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






















export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;

    const wallet = await Wallet.findOne({ user: userId })
      .select("balance transactions")
      .sort({ "transactions.createdAt": -1 })
      .limit(10); // Get last 10 transactions

    if (!wallet) {
      // Create wallet if doesn't exist
      const newWallet = await Wallet.create({
        user: userId,
        balance: 0,
        transactions: [],
      });

      return res.status(200).json({
        success: true,
        data: {
          balance: 0,
          formattedBalance: "₦0.00",
          transactions: [],
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        formattedBalance: `₦${wallet.balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`,
        transactions: wallet.transactions.slice(0, 10), // Last 10 transactions
      },
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get wallet balance",
      error: error.message,
    });
  }
};

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const deleteDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const userId = req.user._id; // Assuming you have authentication middleware

    // Validate delivery ID
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
    }

    // Find the delivery
    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user is authorized (only customer who created it can delete)
    if (delivery.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this delivery",
      });
    }

    // Check if delivery can be deleted (status pending or cancelled, paymentStatus pending or failed)
    const deletableStatuses = ["pending", "cancelled"];
    const deletablePaymentStatuses = ["pending", "failed"];

    if (!deletableStatuses.includes(delivery.status)) {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be deleted when status is '${delivery.status}'. Only 'pending' or 'cancelled' deliveries can be deleted.`,
      });
    }

    if (!deletablePaymentStatuses.includes(delivery.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Delivery cannot be deleted when payment status is '${delivery.paymentStatus}'. Only 'pending' or 'failed' payments can be deleted.`,
      });
    }

    // Perform soft delete or hard delete based on your requirements
    // Option 1: Hard delete (permanently remove from database)
    await Delivery.findByIdAndDelete(deliveryId);

    // Option 2: Soft delete (mark as deleted)
    // await Delivery.findByIdAndUpdate(deliveryId, { isDeleted: true, deletedAt: new Date() });

    return res.status(200).json({
      success: true,
      message: "Delivery deleted successfully",
      data: {
        deliveryId,
      },
    });
  } catch (error: any) {
    console.error("Delete delivery error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete delivery",
      error: error.message,
    });
  }
};

export const payDelivery = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const {
      reference,
      paymentMethod,
      amount,
      deliveryType,
      distance,
      subtotal,
      tax,
    } = req.body;
    const userId = req.user._id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID format",
      });
    }

    // Validate payment method
    const validPaymentMethods = ["paystack", "wallet"];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // Validate required fields
    if (!distance || distance <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid delivery distance is required",
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid payment amount is required",
      });
    }

    // Find delivery
    const delivery = await Delivery.findOne({
      _id: deliveryId,
      customer: userId,
    });

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found or unauthorized",
      });
    }

    // Check if delivery is already paid
    if (delivery.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Delivery already paid",
      });
    }

    // Generate delivery code if not exists
    let deliveryCode = delivery.deliveryCode;
    if (!deliveryCode) {
      // Generate a 5-digit delivery code
      const generateCode = () => {
        return Math.floor(10000 + Math.random() * 90000).toString();
      };

      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!isUnique && attempts < maxAttempts) {
        deliveryCode = generateCode();
        const existingDelivery = await Delivery.findOne({ deliveryCode });
        if (!existingDelivery) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate unique delivery code",
        });
      }
    }

    // Process payment based on payment method
    if (paymentMethod === "paystack") {
      try {
        // Skip verification if in development mode
        if (process.env.NODE_ENV === "development") {
          console.log("Development mode: Skipping Paystack verification");
        } else {
          const response = await axios.get(
            `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
            {
              headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              },
            }
          );

          const paymentData = response.data;

          if (!paymentData.status || paymentData.data.status !== "success") {
            return res.status(400).json({
              success: false,
              message: "Payment verification failed",
            });
          }

          // Verify amount matches (Paystack returns amount in kobo)
          const paidAmount = paymentData.data.amount / 100;

          if (Math.abs(paidAmount - amount) > 1) {
            return res.status(400).json({
              success: false,
              message: `Payment amount mismatch. Expected: ₦${amount}, Paid: ₦${paidAmount}`,
            });
          }
        }

        // Check if reference was already used
        const existingDelivery = await Delivery.findOne({
          reference: reference,
          _id: { $ne: deliveryId },
        });

        if (existingDelivery) {
          return res.status(400).json({
            success: false,
            message: "Payment reference already used",
          });
        }
      } catch (error) {
        console.error("Paystack verification error:", error);

        // In development, allow payment without verification
        if (process.env.NODE_ENV === "development") {
          console.log("Development mode: Proceeding without verification");
        } else {
          return res.status(400).json({
            success: false,
            message:
              "Payment verification failed. Please try again or contact support.",
          });
        }
      }

      // Update delivery with frontend values (no recalculation)
      delivery.deliveryType = deliveryType;
      delivery.distance = distance;
      delivery.paymentStatus = "paid";
      delivery.paymentMethod = "paystack";
      delivery.reference = reference;
      delivery.paidAt = new Date();
      delivery.deliveryCode = deliveryCode;

      // Use frontend calculated values
      delivery.totalAmount = amount;
      delivery.price = subtotal; // price field for backward compatibility
      delivery.tax = tax;

      // Add to timeline
      delivery.timeline.push({
        status: "payment_completed",
        timestamp: new Date(),
      });

      await delivery.save();

      return res.status(200).json({
        success: true,
        message: "Payment completed successfully",
        data: {
          delivery: {
            _id: delivery._id,
            deliveryCode: delivery.deliveryCode,
            deliveryType: delivery.deliveryType,
            distance: delivery.distance,
            status: delivery.status,
            paymentStatus: delivery.paymentStatus,
            paymentMethod: delivery.paymentMethod,
            totalAmount: delivery.totalAmount,
            paidAt: delivery.paidAt,
            reference: delivery.reference,
          },
        },
      });
    }

    // Process wallet payment
    else if (paymentMethod === "wallet") {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Find user's wallet
        const wallet = await Wallet.findOne({ user: userId }).session(session);

        if (!wallet) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: "Wallet not found. Please create a wallet first.",
          });
        }

        // Check if wallet has sufficient balance
        if (wallet.balance < amount) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: "Insufficient wallet balance",
            data: {
              currentBalance: wallet.balance,
              requiredAmount: amount,
              deficit: amount - wallet.balance,
            },
          });
        }

        // Generate reference if not provided
        const walletReference = reference || `WALLET_${userId}_${Date.now()}`;

        // Deduct amount from wallet
        wallet.balance -= amount;

        // Add debit transaction to wallet
        wallet.transactions.push({
          type: "debit",
          amount: amount,
          description: `Delivery payment - ${deliveryCode}`,
          reference: walletReference,
          paymentMethod: "wallet",
          metadata: {
            deliveryId: delivery._id,
            deliveryCode: deliveryCode,
            service: "delivery_payment",
            deliveryType,
            distance,
          },
        });

        await wallet.save({ session });

        // Update delivery with frontend values
        delivery.deliveryType = deliveryType;
        delivery.distance = distance;
        delivery.paymentStatus = "paid";
        delivery.paymentMethod = "wallet";
        delivery.reference = walletReference;
        delivery.paidAt = new Date();
        delivery.deliveryCode = deliveryCode;

        // Use frontend calculated values
        delivery.totalAmount = amount;
        delivery.price = subtotal;
        delivery.tax = tax;

        // Add to timeline
        delivery.timeline.push({
          status: "payment_completed",
          timestamp: new Date(),
        });

        await delivery.save({ session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          message: "Wallet payment completed successfully",
          data: {
            delivery: {
              _id: delivery._id,
              deliveryCode: delivery.deliveryCode,
              deliveryType: delivery.deliveryType,
              distance: delivery.distance,
              status: delivery.status,
              paymentStatus: delivery.paymentStatus,
              paymentMethod: delivery.paymentMethod,
              totalAmount: delivery.totalAmount,
              paidAt: delivery.paidAt,
              reference: delivery.reference,
            },
            wallet: {
              balance: wallet.balance,
              transactionReference: walletReference,
            },
          },
        });
      } catch (transactionError) {
        await session.abortTransaction();
        session.endSession();
        throw transactionError;
      }
    }
  } catch (error) {
    console.error("Payment error:", error);

    // Handle duplicate reference error
    if (error.code === 11000 && error.keyPattern?.reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference already used for another delivery",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getDeliveryPartnerStats = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({ message: 'Invalid partner ID' });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(partnerId);

    // Get delivery partner info from User model
    const deliveryPartner = await userModel.findById(partnerObjectId)
      .select('deliveryPartnerInfo')
      .lean();

    if (!deliveryPartner) {
      return res.status(404).json({ message: 'Delivery partner not found' });
    }

    // 1. Total earnings from Earning model (delivery partner share)
    const earningsAgg = await earningModel.aggregate([
      {
        $match: {
          recipient: partnerObjectId,
          type: 'delivery'
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' }
        }
      }
    ]);


    const totalEarnings = earningsAgg.length > 0 ? earningsAgg[0].totalEarnings : 0;

    // 2. Delivery stats (counts only, not earnings)
    const deliveryStats = await Delivery.aggregate([
      {
        $match: {
          deliveryPartner: partnerObjectId,
          status: { $in: ['delivered', 'in_transit', 'picked_up', 'assigned'] }
        }
      },
      {
        $group: {
          _id: null,
          completedDeliveries: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'delivered'] },
                1,
                0
              ]
            }
          },
          ongoingDeliveries: {
            $sum: {
              $cond: [
                { $in: ['$status', ['assigned', 'picked_up', 'in_transit']] },
                1,
                0
              ]
            }
          },
          totalDeliveries: { $sum: 1 }
        }
      }
    ]);

    // 3. Get current active delivery (if any)
    const currentDelivery = await Delivery.findOne({
      deliveryPartner: partnerId,
      status: { $in: ['assigned', 'picked_up', 'in_transit'] }
    })
      .sort({ updatedAt: -1 })
      .select('status deliveryCode updatedAt _id')
      .lean();

    // 4. Get delivery type distribution using partner's vehicle type
    const deliveryTypeStats = await Delivery.aggregate([
      {
        $match: {
          deliveryPartner: partnerObjectId,
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: '$deliveryType',
          count: { $sum: 1 }
        }
      }
    ]);

    // 5. Get ALL notifications (both read and unread) for recent activities
    const recentNotifications = await Notification.find({
      recipient: partnerId
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('content type read createdAt _id')
      .lean();

    // 6. Get ALL recent deliveries (both ongoing AND completed) for activities
    const recentDeliveries = await Delivery.find({
      deliveryPartner: partnerId,
      status: { $nin: ['cancelled'] }
    })
      .populate('customer', 'name email')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean();

    // 7. Combine and format recent activities
    const deliveryActivities = recentDeliveries.map(delivery => ({
      id: delivery._id.toString(),
      type: 'delivery' as const,
      title: `Delivery #${delivery.deliveryCode}`,
      description: getDeliveryDescription(delivery),
      timestamp: delivery.updatedAt || delivery.createdAt,
      status: delivery.status,
      deliveryType: delivery.deliveryType,
      amount: delivery.totalAmount,
      pickup: delivery.pickup?.address,
      delivery: delivery.delivery?.address,
      customerName: (delivery.customer as any)?.name,
      isCompleted: delivery.status === 'delivered'
    }));

    const notificationActivities = recentNotifications.map(notification => ({
      id: notification._id.toString(),
      type: 'notification' as const,
      title: notification.type,
      description: notification.content,
      timestamp: notification.createdAt,
      read: notification.read,
      isUnread: !notification.read
    }));

    // Combine and sort all activities by timestamp (most recent first)
    const allActivities = [...deliveryActivities, ...notificationActivities]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    // Format delivery types - NOW USING PARTNER'S VEHICLE TYPE
    const deliveryTypes = {
      bicycle: 0,
      bike: 0,
      car: 0,
      van: 0
    };

    // If partner has a vehicle type, increment that specific type
    // This shows how many deliveries they've done with their primary vehicle
    const partnerVehicleType = deliveryPartner.deliveryPartnerInfo?.vehicle?.type;
    if (partnerVehicleType && partnerVehicleType in deliveryTypes) {
      // Count all completed deliveries as using their primary vehicle
      deliveryTypes[partnerVehicleType as keyof typeof deliveryTypes] =
        deliveryStats[0]?.completedDeliveries || 0;
    }

    // Also include distribution from actual deliveries if you want to show
    // that they've used different vehicle types for different deliveries
    deliveryTypeStats.forEach(stat => {
      if (stat._id in deliveryTypes) {
        // This overrides the above if there are actual delivery records
        deliveryTypes[stat._id as keyof typeof deliveryTypes] = stat.count;
      }
    });

    const stats = {
      earnings: {
        totalAmount: totalEarnings, // Use earnings from Earning model
        completedDeliveries: deliveryStats[0]?.completedDeliveries || 0,
        ongoingDeliveries: deliveryStats[0]?.ongoingDeliveries || 0,
        totalDeliveries: deliveryStats[0]?.totalDeliveries || 0
      },
      // CURRENT STATUS NOW COMES FROM DELIVERY PARTNER INFO
      currentStatus: {
        status: deliveryPartner.deliveryPartnerInfo?.status || 'offline',
        deliveryId: currentDelivery?._id,
        deliveryCode: currentDelivery?.deliveryCode,
        lastUpdated: currentDelivery?.updatedAt ||
          deliveryPartner.deliveryPartnerInfo?.location?.lastUpdated ||
          new Date().toISOString(),
        online: deliveryPartner.deliveryPartnerInfo?.online || false,
        rating: deliveryPartner.deliveryPartnerInfo?.rating || 0,
        averageRating: deliveryPartner.deliveryPartnerInfo?.averageRating || 0,
        vehicleType: deliveryPartner.deliveryPartnerInfo?.vehicle?.type
      },
      // DELIVERY TYPES NOW INCLUDES PARTNER'S VEHICLE INFO
      deliveryTypes: {
        ...deliveryTypes,
        total: Object.values(deliveryTypes).reduce((a, b) => a + b, 0),
        primaryVehicle: deliveryPartner.deliveryPartnerInfo?.vehicle?.type || null,
        vehicleDetails: {
          model: deliveryPartner.deliveryPartnerInfo?.vehicle?.model,
          plateNumber: deliveryPartner.deliveryPartnerInfo?.vehicle?.plateNumber,
          color: deliveryPartner.deliveryPartnerInfo?.vehicle?.color
        }
      },
      partnerInfo: {
        totalDeliveries: deliveryPartner.deliveryPartnerInfo?.totalDeliveries || 0,
        completedDeliveries: deliveryPartner.deliveryPartnerInfo?.completedDeliveries || 0,
        cancelledDeliveries: deliveryPartner.deliveryPartnerInfo?.cancelledDeliveries || 0,
        earnings: deliveryPartner.deliveryPartnerInfo?.earnings || {
          total: 0,
          pending: 0,
          available: 0
        },
        verificationStatus: deliveryPartner.deliveryPartnerInfo?.verificationStatus || {
          identity: false,
          vehicle: false,
          backgroundCheck: false,
          submitted: false,
          verified: false
        }
      },
      recentActivities: allActivities,
      unreadCount: recentNotifications.filter(n => !n.read).length,
      summary: {
        totalActivities: allActivities.length,
        deliveriesCount: deliveryActivities.length,
        notificationsCount: notificationActivities.length
      }
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching delivery partner stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching delivery partner stats',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};



// Helper function to generate meaningful delivery descriptions
function getDeliveryDescription(delivery: any): string {
  const statusDescriptions: Record<string, string> = {
    'pending': 'Waiting for assignment',
    'assigned': 'Delivery assigned - heading to pickup',
    'picked_up': 'Package picked up',
    'in_transit': 'On the way to delivery',
    'delivered': 'Successfully delivered',
    'cancelled': 'Cancelled'
  };

  const baseDescription = statusDescriptions[delivery.status] || `Status: ${delivery.status}`;

  if (delivery.status === 'delivered' && delivery.delivery?.address) {
    return `${baseDescription} to ${delivery.delivery.address}`;
  }

  if (delivery.status === 'assigned' && delivery.pickup?.address) {
    return `${baseDescription} at ${delivery.pickup.address}`;
  }

  return baseDescription;
}