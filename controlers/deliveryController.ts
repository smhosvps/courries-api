
import { Request, Response } from "express";
import { Delivery } from "../models/Delivery";
import Notification from "../models/notificationModel";
import userModel from "../models/user_model";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet";
import axios from "axios"



export const createDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { pickup, delivery, ...rest } = req.body;

    // Ensure location coordinates are properly formatted
    const deliveryData = {
      ...rest,
      customer: req.user._id,
      pickup: {
        ...pickup,
        location: {
          type: "Point",
          coordinates: pickup.location?.coordinates || [0, 0] // Default coordinates
        }
      },
      delivery: {
        ...delivery,
        location: {
          type: "Point",
          coordinates: delivery.location?.coordinates || [0, 0] // Default coordinates
        }
      },
      timeline: [
        {
          status: "pending",
          timestamp: new Date(),
        },
      ],
    };

    console.log(deliveryData, "create delivery data");

    const deliveryx = new Delivery(deliveryData);

    console.log(deliveryx, "delivery x")
    await deliveryx.save();

    res.status(201).json({
      success: true,
      message: "Delivery created successfully",
      data: { deliveryx },
    });
  } catch (error: any) {
    console.log(error)
    res.status(500).json({
      success: false,
      message: error.message,
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

    console.log(deliveryId, "deliveryId");
    console.log(deliveryType, distance, "deliveryId");

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

    console.log(
      `Calculated duration: ${estimatedDuration} minutes for ${calculatedDistance}km at ${deliveryType}`
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
    const delivery = await Delivery.findById(req.params.id)
      .populate("customer", "firstName lastName phone email")
      .populate("deliveryPartner", "firstName lastName phone");

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
      return;
    }

    // Check if user has access to this delivery
    if (
      delivery.customer._id.toString() !== req.user._id.toString() &&
      delivery.deliveryPartner?._id.toString() !== req.user._id.toString() &&
      req.user.userType !== "admin"
    ) {
      res.status(403).json({
        success: false,
        message: "Access denied",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { delivery },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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
export const trackDelivery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { deliveryId } = req.params;

    console.log(deliveryId, "delivery id");

    const delivery: any = await Delivery.findById(deliveryId)
      .populate("customer", "firstName lastName phone")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "status timeline pickup delivery package price estimatedDuration customer deliveryPartner"
      );

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
      return;
    }

    console.log(delivery, "delivery object");

    // Safely check if user has access to track this delivery
    const customerId = delivery.customer?._id?.toString();
    const deliveryPartnerId = delivery.deliveryPartner?._id?.toString();
    const userId = req.user?._id?.toString();
    const userType = req.user?.userType;

    console.log(
      {
        customerId,
        deliveryPartnerId,
        userId,
        userType,
      },
      "access check values"
    );

    // Calculate estimated time of arrival (ETA) if in transit
    let eta: any = null;
    if (delivery.status === "in_transit" && delivery.estimatedDuration) {
      const pickedUpTime = delivery.timeline.find(
        (t) => t.status === "picked_up"
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
      status: "pending",
    })
      .populate("customer", "firstName lastName phone")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup delivery package price estimatedDuration createdAt updatedAt"
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
      .populate("customer", "firstName lastName phone")
      .populate(
        "deliveryPartner",
        "firstName lastName phone avatar vehicleType"
      )
      .select(
        "deliveryCode status timeline pickup delivery package price estimatedDuration actualDuration paymentStatus paymentMethod createdAt updatedAt"
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
      .populate("customer", "firstName lastName phone email")
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

export const AssignDeliveryPartner = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { partnerId } = req.body;

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

    // Check if delivery is still pending
    if (delivery.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Delivery is already assigned or in progress",
      });
    }

    // Find delivery partner
    const partner = await userModel.findById(partnerId);

    if (!partner || partner.userType !== "delivery_partner") {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Check if partner is available
    if (
      !partner.deliveryPartnerInfo?.online ||
      partner.deliveryPartnerInfo?.status !== "available"
    ) {
      return res.status(400).json({
        success: false,
        message: "Delivery partner is not available",
      });
    }

    // Update delivery
    delivery.deliveryPartner = partnerId;
    delivery.status = "assigned";

    delivery.timeline.push({
      status: "assigned",
      timestamp: new Date(),
      location: partner.deliveryPartnerInfo?.location?.coordinates,
    });

    // Update partner status
    partner.deliveryPartnerInfo.status = "busy";
    partner.deliveryPartnerInfo.currentDelivery = deliveryId;

    // Save both documents
    await Promise.all([delivery.save(), partner.save()]);

    res.json({
      success: true,
      message: "Delivery partner assigned successfully",
      data: { delivery },
    });
  } catch (error) {
    console.error("Assign delivery partner error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getDeliveryDeliverid = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;

    const delivery = await Delivery.findById(deliveryId)
      .populate("customer", "firstName lastName phone email")
      .populate("deliveryPartner", "firstName lastName phone avatar");

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check authorization
    const isCustomer =
      delivery.customer._id.toString() === req.user._id.toString();
    const isDeliveryPartner =
      delivery.deliveryPartner?._id.toString() === req.user._id.toString();

    if (!isCustomer && !isDeliveryPartner && req.user.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this delivery",
      });
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



export const AvailablePartners = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params; // Only deliveryId from params
    const { radius = 3 } = req.query; // radius in kilometers

    console.log("Available Partners - Delivery ID:", deliveryId);
    console.log("Available Partners - User:", req.user); // Debug log

    // FIX: Check authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user._id; // Get from authenticated user

    // Find delivery
    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    // Check if user owns this delivery
    if (delivery.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this delivery"
      });
    }

    const pickupLocation = delivery.pickup.location;

    // Find available delivery partners near pickup location
    const partners = await userModel.aggregate([
      {
        $match: {
          userType: "delivery_partner",
          "deliveryPartnerInfo.online": true,
          "deliveryPartnerInfo.status": "available",
          "deliveryPartnerInfo.location.coordinates": {
            $exists: true,
          },
          "deliveryPartnerInfo.verificationStatus.verified": true,
        },
      },
      {
        $addFields: {
          distance: {
            $let: {
              vars: {
                lat1: { $degreesToRadians: pickupLocation.lat },
                lng1: { $degreesToRadians: pickupLocation.lng },
                lat2: {
                  $degreesToRadians: "$deliveryPartnerInfo.location.coordinates.lat",
                },
                lng2: {
                  $degreesToRadians: "$deliveryPartnerInfo.location.coordinates.lng",
                },
              },
              in: {
                $multiply: [
                  6378.1,
                  {
                    $acos: {
                      $add: [
                        { $multiply: [{ $sin: "$$lat1" }, { $sin: "$$lat2" }] },
                        {
                          $multiply: [
                            { $cos: "$$lat1" },
                            { $cos: "$$lat2" },
                            { $cos: { $subtract: ["$$lng1", "$$lng2"] } },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $match: {
          distance: { $lte: parseFloat(radius.toString()) },
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
          "location.coordinates": "$deliveryPartnerInfo.location.coordinates",
          distance: { $round: ["$distance", 2] },
          estimatedArrival: {
            $round: [
              {
                $divide: [
                  { $multiply: ["$distance", 60] },
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "bicycle"] },
                          then: 15,
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "bike"] },
                          then: 37.5, // 5km in 8 minutes = 37.5 km/h
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "car"] },
                          then: 60,
                        },
                        {
                          case: { $eq: ["$deliveryPartnerInfo.vehicle.type", "van"] },
                          then: 50,
                        },
                      ],
                      default: 30,
                    },
                  },
                ],
              },
              0,
            ],
          },
          totalDeliveries: "$deliveryPartnerInfo.totalDeliveries",
          completedDeliveries: "$deliveryPartnerInfo.completedDeliveries",
          successRate: {
            $cond: {
              if: { $gt: ["$deliveryPartnerInfo.totalDeliveries", 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      "$deliveryPartnerInfo.completedDeliveries",
                      "$deliveryPartnerInfo.totalDeliveries"
                    ]
                  },
                  100
                ]
              },
              else: 0
            }
          }
        },
      },
    ]);

    // If no partners found with geospatial query, try a simpler query
    let finalPartners = partners;
    if (partners.length === 0) {
      const fallbackPartners = await userModel
        .find({
          userType: "delivery_partner",
          "deliveryPartnerInfo.online": true,
          "deliveryPartnerInfo.status": "available",
          "deliveryPartnerInfo.verificationStatus.verified": true,
        })
        .limit(10)
        .select("firstName lastName phone avatar deliveryPartnerInfo")
        .lean();

      finalPartners = fallbackPartners.map((partner) => {
        const total = partner.deliveryPartnerInfo?.totalDeliveries || 0;
        const completed = partner.deliveryPartnerInfo?.completedDeliveries || 0;

        return {
          _id: partner._id,
          name: `${partner.firstName} ${partner.lastName}`,
          phone: partner.phone,
          avatar: partner.avatar,
          rating: partner.deliveryPartnerInfo?.averageRating || 0,
          vehicle: partner.deliveryPartnerInfo?.vehicle || { type: "bike" },
          distance: 5,
          estimatedArrival: 8, // 5km at 37.5 km/h = 8 minutes
          totalDeliveries: total,
          completedDeliveries: completed,
          successRate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
      });
    }

    res.json({
      success: true,
      data: {
        partners: finalPartners,
        pickupLocation,
        totalPartners: finalPartners.length,
        radius: parseFloat(radius.toString()),
      },
    });
  } catch (error) {
    console.error("Get available partners error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};


// Paystack configuration
const PAYSTACK_SECRET_KEY = 'sk_test_10625280b82af7e2c39fecbc6f8361249eab2610'
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Generate unique reference for wallet transactions
const generateWalletReference = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `WALLET_${timestamp}_${random}`;
};

export const payDelivery = async (req:Request, res:Response) => {
  try {
    const { deliveryId } = req.params;
    const { reference, paymentMethod, amount } = req.body;
    const userId = req.user._id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery ID format',
      });
    }

    // Validate payment method
    const validPaymentMethods = ['paystack', 'wallet', 'cash'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method',
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
        message: 'Delivery not found or unauthorized',
      });
    }

    // Check if delivery is already paid
    if (delivery.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Delivery already paid',
      });
    }

    // Check if delivery has a price set
    if (!delivery.price || delivery.price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Delivery price not set. Please select delivery type first.',
      });
    }

    // Verify payment amount matches delivery price
    if (amount !== delivery.price) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₦${amount}) does not match delivery price (₦${delivery.price})`,
      });
    }

    let paymentReference = reference;
    let paymentData = null;

    // Process payment based on payment method
    if (paymentMethod === 'paystack') {
      try {
        const response = await axios.get(
          `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
          }
        );

        paymentData= response.data;

        if (!paymentData.status || paymentData.data.status !== 'success') {
          return res.status(400).json({
            success: false,
            message: 'Payment verification failed',
            paymentData,
          });
        }

        // Verify amount matches (Paystack returns amount in kobo)
        const paidAmount = paymentData.data.amount / 100; // Convert from kobo to Naira
        
        if (paidAmount !== amount) {
          return res.status(400).json({
            success: false,
            message: `Payment amount mismatch. Expected: ₦${amount}, Paid: ₦${paidAmount}`,
          });
        }

        // Check if reference was already used
        const existingDelivery = await Delivery.findOne({
          reference,
          _id: { $ne: deliveryId }
        });
        
        if (existingDelivery) {
          return res.status(400).json({
            success: false,
            message: 'Payment reference already used',
          });
        }

      } catch (error) {
        console.error('Paystack verification error:', error.response?.data || error.message);
        
        // Check if it's a 404 (reference not found)
        if (error.response?.status === 404) {
          return res.status(400).json({
            success: false,
            message: 'Invalid payment reference',
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed. Please try again or contact support.',
          error: error.response?.data?.message || error.message,
        });
      }
    }
    
    // Process wallet payment
    else if (paymentMethod === 'wallet') {
      try {
        // Find user's wallet
        const wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
          return res.status(404).json({
            success: false,
            message: 'Wallet not found. Please create a wallet first.',
          });
        }

        // Check if wallet has sufficient balance
        if (wallet.balance < amount) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient wallet balance',
            data: {
              currentBalance: wallet.balance,
              requiredAmount: amount,
              deficit: amount - wallet.balance,
            },
          });
        }

        // Generate reference if not provided
        paymentReference = reference || generateWalletReference();

        // Check if transaction reference already exists
        const existingTransaction = wallet.transactions.find(
          tx => tx.reference === paymentReference
        );
        
        if (existingTransaction) {
          return res.status(400).json({
            success: false,
            message: 'Transaction reference already exists',
          });
        }

        // Check if reference was already used in another delivery
        const existingDeliveryWithReference = await Delivery.findOne({
          reference: paymentReference,
          _id: { $ne: deliveryId }
        });
        
        if (existingDeliveryWithReference) {
          return res.status(400).json({
            success: false,
            message: 'Transaction reference already used for another delivery',
          });
        }

        // Start transaction session for atomic operations
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          // Deduct amount from wallet
          wallet.balance -= amount;
          
          // Add debit transaction to wallet
          wallet.transactions.push({
            type: 'debit',
            amount: amount,
            description: `Delivery payment - ${delivery.deliveryCode}`,
            reference: paymentReference,
            paymentMethod: 'wallet',
            metadata: {
              deliveryId: delivery._id,
              deliveryCode: delivery.deliveryCode,
              service: 'delivery_payment',
            },
          });

          await wallet.save({ session });

          // Update delivery payment status
          delivery.paymentStatus = 'paid';
          delivery.paymentMethod = 'wallet';
          delivery.reference = paymentReference;
          delivery.paidAt = new Date();
          
          // Add to timeline
          delivery.timeline.push({
            status: 'payment_completed',
            timestamp: new Date(),
            details: {
              paymentMethod: 'wallet',
              amount: amount,
              reference: paymentReference,
              walletBalanceBefore: wallet.balance + amount,
              walletBalanceAfter: wallet.balance,
            },
          });

          await delivery.save({ session });

          // Commit transaction
          await session.commitTransaction();
          session.endSession();

          // Send payment confirmation
          // TODO: Send email/SMS notification

          res.status(200).json({
            success: true,
            message: 'Wallet payment completed successfully',
            data: {
              delivery: {
                id: delivery._id,
                deliveryCode: delivery.deliveryCode,
                status: delivery.status,
                paymentStatus: delivery.paymentStatus,
                paymentMethod: delivery.paymentMethod,
                price: delivery.price,
                paidAt: delivery.paidAt,
                reference: delivery.reference,
              },
              wallet: {
                balance: wallet.balance,
                transactionReference: paymentReference,
              },
            },
          });
          return;

        } catch (transactionError) {
          await session.abortTransaction();
          session.endSession();
          throw transactionError;
        }

      } catch (walletError) {
        console.error('Wallet payment error:', walletError);
        return res.status(500).json({
          success: false,
          message: 'Wallet payment failed. Please try again.',
          error: walletError.message,
        });
      }
    }
    
    // Process cash payment
    else if (paymentMethod === 'cash') {
      if (!reference) {
        paymentReference = `CASH_${delivery.deliveryCode}_${Date.now()}`;
      }

      // For cash payments, we mark as paid immediately
      // In production, you might want additional verification
      delivery.paymentStatus = 'paid';
      delivery.paymentMethod = 'cash';
      delivery.reference = paymentReference;
      delivery.paidAt = new Date();
      
      // Add to timeline
      delivery.timeline.push({
        status: 'payment_completed',
        timestamp: new Date(),
        details: {
          paymentMethod: 'cash',
          amount: amount,
          reference: paymentReference,
          note: 'Cash payment - to be collected from customer',
        },
      });
    }

    // For paystack payments (already verified above)
    if (paymentMethod === 'paystack') {
      delivery.paymentStatus = 'paid';
      delivery.paymentMethod = 'paystack';
      delivery.reference = paymentReference;
      delivery.paidAt = new Date();
      
      // Add to timeline
      delivery.timeline.push({
        status: 'payment_completed',
        timestamp: new Date(),
        details: {
          paymentMethod: 'paystack',
          amount: amount,
          reference: paymentReference,
          paystackData: {
            transactionId: paymentData?.data?.id,
            authorizationCode: paymentData?.data?.authorization?.authorization_code,
            channel: paymentData?.data?.channel,
          },
        },
      });
    }

    await delivery.save();

    // Trigger post-payment actions
    // TODO: Implement these in production
    // 1. Send payment confirmation email/SMS
    // 2. Notify available delivery partners
    // 3. Update analytics
    // 4. Create notification for user

    res.status(200).json({
      success: true,
      message: 'Payment completed successfully',
      data: {
        delivery: {
          id: delivery._id,
          deliveryCode: delivery.deliveryCode,
          status: delivery.status,
          paymentStatus: delivery.paymentStatus,
          paymentMethod: delivery.paymentMethod,
          price: delivery.price,
          paidAt: delivery.paidAt,
          reference: delivery.reference,
        },
        ...(paymentMethod === 'wallet' ? {
          wallet: {
            newBalance: null, // Would be available if we did wallet transaction
          }
        } : {}),
      },
    });
  } catch (error) {
    console.error('Payment error:', error);
    
    // Handle duplicate reference error
    if (error.code === 11000 && error.keyPattern?.reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference already used for another delivery',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};


export const getWalletBalance = async (req:Request, res:Response) => {
  try {
    const userId = req.user._id;
    
    const wallet = await Wallet.findOne({ user: userId })
      .select('balance transactions')
      .sort({ 'transactions.createdAt': -1 })
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
          formattedBalance: '₦0.00',
          transactions: [],
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        formattedBalance: `₦${wallet.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
        transactions: wallet.transactions.slice(0, 10), // Last 10 transactions
      },
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      error: error.message,
    });
  }
};


