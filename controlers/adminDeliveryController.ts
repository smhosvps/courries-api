// backend/controllers/adminDeliveryController.ts
import { Request, Response } from 'express';
import { Delivery } from "../models/Delivery";
import userModel from '../models/user_model';

// Get all pending deliveries with paid status
export const GetPendingPaidDeliveries = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build query
    const query: any = {
      status: "pending",
      paymentStatus: "paid"
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { deliveryCode: { $regex: search, $options: 'i' } },
        { trackingId: { $regex: search, $options: 'i' } },
        { 'pickup.address': { $regex: search, $options: 'i' } },
        { 'delivery.address': { $regex: search, $options: 'i' } }
      ];
    }

    // Get deliveries with customer population
    const deliveries = await Delivery.find(query)
      .populate({
        path: 'customer',
        select: 'firstName lastName email phone avatar'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Get total count
    const total = await Delivery.countDocuments(query);

    // Transform data for frontend
    const transformedDeliveries = deliveries.map(delivery => ({
      _id: delivery._id,
      deliveryCode: delivery.deliveryCode,
      trackingId: delivery.trackingId,
      customer: {
        _id: delivery.customer._id,
        name: `${delivery.customer.firstName} ${delivery.customer.lastName}`,
        email: delivery.customer.email,
        phone: delivery.customer.phone,
        avatar: delivery.customer.avatar.url
      },
      package: {
        type: delivery.package.type,
        weight: delivery.package.weight,
        description: delivery.package.description,
        value: delivery.package.value,
        images: delivery.package.images
      },
      pickup: {
        address: delivery.pickup.address,
        contactName: delivery.pickup.contactName,
        contactPhone: delivery.pickup.contactPhone
      },
      delivery: {
        address: delivery.delivery.address,
        contactName: delivery.delivery.contactName,
        contactPhone: delivery.delivery.contactPhone
      },
      deliveryType: delivery.deliveryType,
      distance: delivery.distance,
      estimatedDuration: delivery.estimatedDuration,
      price: delivery.price,
      totalAmount: delivery.totalAmount,
      paymentMethod: delivery.paymentMethod,
      paidAt: delivery.paidAt,
      createdAt: delivery.createdAt,
      timeline: delivery.timeline
    }));

    res.json({
      success: true,
      data: {
        deliveries: transformedDeliveries,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get pending paid deliveries error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get single delivery details with full customer info
export const GetDeliveryDetails = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;

    const delivery = await Delivery.findById(deliveryId)
      .populate({
        path: 'customer',
        select: 'firstName lastName email phone avatar createdAt'
      })
      .populate({
        path: 'deliveryPartner',
        select: 'firstName lastName email phone avatar deliveryPartnerInfo'
      })
      .lean();

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Check if delivery meets criteria
    if (delivery.status !== 'pending' || delivery.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Delivery is not in pending status with paid payment'
      });
    }

    // Transform data
    const transformedDelivery = {
      _id: delivery._id,
      deliveryCode: delivery.deliveryCode,
      trackingId: delivery.trackingId,
      customer: {
        _id: delivery.customer._id,
        fullName: `${delivery.customer.firstName} ${delivery.customer.lastName}`,
        firstName: delivery.customer.firstName,
        lastName: delivery.customer.lastName,
        email: delivery.customer.email,
        phone: delivery.customer.phone,
        avatar: delivery.customer.avatar.url,
        joinedAt: delivery.customer.createdAt
      },
      deliveryPartner: delivery.deliveryPartner ? {
        _id: delivery.deliveryPartner._id,
        fullName: `${delivery.deliveryPartner.firstName} ${delivery.deliveryPartner.lastName}`,
        phone: delivery.deliveryPartner.phone,
        avatar: delivery.deliveryPartner.avatar.url,
        online: delivery.deliveryPartner.deliveryPartnerInfo?.online,
        status: delivery.deliveryPartner.deliveryPartnerInfo?.status,
        vehicle: delivery.deliveryPartner.deliveryPartnerInfo?.vehicle,
        rating: delivery.deliveryPartner.deliveryPartnerInfo?.rating
      } : null,
      package: {
        type: delivery.package.type,
        weight: delivery.package.weight,
        dimensions: delivery.package.dimensions,
        description: delivery.package.description,
        value: delivery.package.value,
        images: delivery.package.images
      },
      pickup: {
        address: delivery.pickup.address,
        location: delivery.pickup.location,
        contactName: delivery.pickup.contactName,
        contactPhone: delivery.pickup.contactPhone,
        instructions: delivery.pickup.instructions,
        scheduledTime: delivery.pickup.scheduledTime
      },
      delivery: {
        address: delivery.delivery.address,
        location: delivery.delivery.location,
        contactName: delivery.delivery.contactName,
        contactPhone: delivery.delivery.contactPhone,
        instructions: delivery.delivery.instructions,
        scheduledTime: delivery.delivery.scheduledTime
      },
      deliveryType: delivery.deliveryType,
      deliveryOption: delivery.deliveryOption,
      distance: delivery.distance,
      estimatedDuration: delivery.estimatedDuration,
      price: delivery.price,
      basePrice: delivery.basePrice,
      distanceFee: delivery.distanceFee,
      tax: delivery.tax,
      serviceFee: delivery.serviceFee,
      totalAmount: delivery.totalAmount,
      paymentStatus: delivery.paymentStatus,
      paymentMethod: delivery.paymentMethod,
      reference: delivery.reference,
      paidAt: delivery.paidAt,
      status: delivery.status,
      timeline: delivery.timeline,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt
    };

    res.json({
      success: true,
      data: transformedDelivery
    });
  } catch (error) {
    console.error('Get delivery details error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Assign delivery to specific partner (admin version)
export const AssignDeliveryToPartner = async (req: Request, res: Response) => {
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

    // Check if delivery meets admin assignment criteria
    if (delivery.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Delivery is not in pending status",
      });
    }

    if (delivery.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment is not completed for this delivery",
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

    // Populate data for response
    const updatedDelivery = await Delivery.findById(deliveryId)
      .populate({
        path: 'customer',
        select: 'firstName lastName email phone'
      })
      .populate({
        path: 'deliveryPartner',
        select: 'firstName lastName email phone deliveryPartnerInfo'
      });

    res.json({
      success: true,
      message: "Delivery partner assigned successfully by admin",
      data: { delivery: updatedDelivery }
    });
  } catch (error) {
    console.error("Admin assign delivery partner error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get all available delivery partners
export const GetAllDeliveryPartners = async (req: Request, res: Response) => {
  try {
    const partners = await userModel.find({
      userType: "delivery_partner",
      'deliveryPartnerInfo.online': true,
      'deliveryPartnerInfo.status': 'available'
    })
    .select('firstName lastName email phone avatar deliveryPartnerInfo')
    .lean();

    const transformedPartners = partners.map(partner => ({
      _id: partner._id,
      name: `${partner.firstName} ${partner.lastName}`,
      firstName: partner.firstName,
      lastName: partner.lastName,
      email: partner.email,
      phone: partner.phone,
      avatar: partner.avatar.url,
      online: partner.deliveryPartnerInfo?.online,
      status: partner.deliveryPartnerInfo?.status,
      vehicle: partner.deliveryPartnerInfo?.vehicle,
      rating: partner.deliveryPartnerInfo?.rating,
      totalDeliveries: partner.deliveryPartnerInfo?.totalDeliveries,
      completedDeliveries: partner.deliveryPartnerInfo?.completedDeliveries,
      location: partner.deliveryPartnerInfo?.location
    }));

    res.json({
      success: true,
      data: transformedPartners
    });
  } catch (error) {
    console.error('Get delivery partners error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get delivery statistics
export const GetDeliveryStats = async (req: Request, res: Response) => {
  try {
    const pendingPaidCount = await Delivery.countDocuments({
      status: 'pending',
      paymentStatus: 'paid'
    });

    const totalDeliveriesToday = await Delivery.countDocuments({
      createdAt: {
        $gte: new Date().setHours(0, 0, 0, 0),
        $lt: new Date().setHours(23, 59, 59, 999)
      }
    });

    const averageDeliveryTime = await Delivery.aggregate([
      {
        $match: {
          status: 'delivered',
          actualDuration: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          average: { $avg: '$actualDuration' }
        }
      }
    ]);

    const revenueToday = await Delivery.aggregate([
      {
        $match: {
          paidAt: {
            $gte: new Date().setHours(0, 0, 0, 0),
            $lt: new Date().setHours(23, 59, 59, 999)
          },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        pendingPaidCount,
        totalDeliveriesToday,
        averageDeliveryTime: averageDeliveryTime[0]?.average || 0,
        revenueToday: revenueToday[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get delivery stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};




// Helper for pagination
const paginate = (page = 1, limit = 10) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;
  return { skip, limit: limitNum, page: pageNum };
};

// GET /admin/deliveries/pending
// Condition: status = "pending" AND paymentStatus = "paid"
export const getPendingDeliveries = async (req: Request, res: Response) => {
  try {
    const { page, limit: limitParam } = req.query;
    const { skip, limit, page: currentPage } = paginate(page, limitParam);

    const query = {
      status: 'pending',
      paymentStatus: 'paid'
    };

    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('customer', 'name email phone')
        .populate('deliveryPartner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Delivery.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: deliveries,
      pagination: {
        page: currentPage,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error:any) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /admin/deliveries/picked-up
export const getPickedUpDeliveries = async (req: Request, res: Response) => {
  try {
    const { page, limit: limitParam }:any = req.query;
    const { skip, limit, page: currentPage }:any = paginate(page, limitParam);

    const query = { status: 'picked_up' };

    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('customer', 'name email phone')
        .populate('deliveryPartner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Delivery.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: deliveries,
      pagination: {
        page: currentPage,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error:any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /admin/deliveries/in-transit
export const getInTransitDeliveries = async (req: Request, res: Response) => {
  try {
    const { page, limit: limitParam }:any = req.query;
    const { skip, limit, page: currentPage } = paginate(page, limitParam);

    const query = { status: 'in_transit' };

    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('customer', 'name email phone')
        .populate('deliveryPartner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Delivery.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: deliveries,
      pagination: { page: currentPage, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error:any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /admin/deliveries/delivered
export const getDeliveredDeliveries = async (req: Request, res: Response) => {
  try {
    const { page, limit: limitParam }:any = req.query;
    const { skip, limit, page: currentPage } = paginate(page, limitParam);

    const query = { status: 'delivered' };

    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('customer', 'name email phone')
        .populate('deliveryPartner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Delivery.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: deliveries,
      pagination: { page: currentPage, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error:any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /admin/deliveries/cancelled
export const getCancelledDeliveries = async (req: Request, res: Response) => {
  try {
    const { page, limit: limitParam }:any = req.query;
    const { skip, limit, page: currentPage } = paginate(page, limitParam);

    const query = { status: 'cancelled' };

    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('customer', 'name email phone')
        .populate('deliveryPartner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Delivery.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: deliveries,
      pagination: { page: currentPage, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error:any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};