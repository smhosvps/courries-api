// controllers/earningController.js
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import earningModel from '../models/earning.model';
import userModel from '../models/user_model';
import { Delivery } from '../models/Delivery';

// Get all admin earnings (type: 'admin')
export const getAdminEarnings = async (req:Request, res:Response) => {
  try {
    const { page = 1, limit = 20, startDate, endDate }:any = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build date filter
    let dateFilter:any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const filter = { type: 'admin', ...dateFilter };

    const [earnings, total] = await Promise.all([
      earningModel
        .find(filter)
        .populate('delivery', 'trackingId totalAmount status createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      earningModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: earnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all delivery man earnings (type: 'delivery')
// backend/controlers/earningsControllerAdm.ts


export const getDeliveryEarnings = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      recipientId,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const limitNum = Number(limit);

    // Date filter
    let dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
    }

    // Recipient filter – safe handling
    let recipientFilter: any = {};

    if (recipientId) {
      const recipientIdStr = recipientId as string;

      // Only treat as ObjectId if it's a valid 24‑hex string
      if (Types.ObjectId.isValid(recipientIdStr)) {
        recipientFilter.recipient = new Types.ObjectId(recipientIdStr);
      } else {
        // Search by name/email (optional – remove if you only want exact ID)
        const users = await userModel.find({
          $or: [
            { firstName: { $regex: recipientIdStr, $options: 'i' } },
            { lastName: { $regex: recipientIdStr, $options: 'i' } },
            { email: { $regex: recipientIdStr, $options: 'i' } },
          ],
        }).select('_id');

        const userIds = users.map(u => u._id);
        if (userIds.length) {
          recipientFilter.recipient = { $in: userIds };
        } else {
          // No matching user → return empty result
          return res.status(200).json({
            success: true,
            data: [],
            pagination: {
              page: Number(page),
              limit: limitNum,
              total: 0,
              pages: 0,
            },
          });
        }
      }
    }

    const filter = {
      type: 'delivery',
      ...dateFilter,
      ...recipientFilter,
    };

    const [earnings, total] = await Promise.all([
      earningModel
        .find(filter)
        .populate('delivery', 'trackingId totalAmount status createdAt')
        .populate('recipient', 'firstName lastName email phone avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      earningModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: earnings,
      pagination: {
        page: Number(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error in getDeliveryEarnings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


export const getDeliveryStatsAndRevenue = async (req:Request, res:Response) => {
  try {
    const { status } = req.query; // optional filter for monthly trend

    // 1. Count per status (overall, unfiltered)
    const statusCounts:any = await Delivery.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const countsMap:any = {};
    statusCounts.forEach(item => { countsMap[item._id] = item.count; });
    const statuses = ["pending", "assigned", "picked_up", "in_transit", "delivered", "request_accepted", "cancelled"];
    const totalDeliveriesByStatus = statuses.map(s => ({
      status: s,
      count: countsMap[s] || 0
    }));

    // 2. Monthly trend for last 12 months (optionally filtered by status)
    const today = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(today.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    let matchStage = { createdAt: { $gte: twelveMonthsAgo } };
    if (status && statuses.includes(status)) {
      matchStage.status = status;
    }

    const monthlyData = await Delivery.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalDeliveries: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      last12Months.push({ year, month, label: `${monthNames[month]} ${year}` });
    }

    const monthlyTrend = last12Months.map(({ year, month, label }) => {
      const found = monthlyData.find(item => item._id.year === year && item._id.month === month + 1);
      return {
        month: label,
        deliveries: found ? found.totalDeliveries : 0,
        revenue: found ? found.totalRevenue : 0
      };
    });

    // 3. Recent deliveries (last 10, unfiltered)
    const recentDeliveries = await Delivery.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customer', 'firstName lastName email')
      .populate('deliveryPartner', 'firstName lastName email')
      .select('trackingId status totalAmount createdAt customer deliveryPartner');

    res.status(200).json({
      success: true,
      data: {
        totalDeliveriesByStatus,
        monthlyTrend,
        recentDeliveries
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};