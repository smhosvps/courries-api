import { Request, Response } from "express";
import userModel from "../models/user_model";
import { Wallet } from "../models/Wallet";
import { Delivery } from "../models/Delivery";
import withdrawalModel from "../models/withdrawal.model";
import earningModel from '../models/earning.model';


export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ---------- 1. Today order counts ----------
    const todayOrders = await Delivery.aggregate([
      { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    const todayPending = await Delivery.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
      status: 'pending',
    });
    const todayInProgress = await Delivery.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
      status: { $in: ['assigned', 'picked_up', 'in_transit', 'request_accepted'] },
    });
    const todayCompleted = await Delivery.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
      status: 'delivered',
    });
    const todayCancelled = await Delivery.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
      status: 'cancelled',
    });

    const todayOrderStats = {
      totalOrder: todayOrders[0]?.count || 0,
      pendingOrder: todayPending,
      inProgressOrder: todayInProgress,
      completedOrder: todayCompleted,
      cancelledOrder: todayCancelled,
    };

    // ---------- 2. Order detail stats (all time) ----------
    const totalOrders = await Delivery.countDocuments();
    const createdOrders = totalOrders; // all orders are created
    const assignedOrders = await Delivery.countDocuments({ status: 'assigned' });
    const acceptedOrders = await Delivery.countDocuments({ status: 'request_accepted' });
    const arrivedOrders = 0; // no direct status – could be derived from timeline, skip for now
    const pulledOrders = 0;
    const departedOrders = 0;
    const deliveredOrders = await Delivery.countDocuments({ status: 'delivered' });
    const cancelledOrders = await Delivery.countDocuments({ status: 'cancelled' });
    const totalUsers = await userModel.countDocuments({ userType: 'customer' });
    const totalDeliveryPersons = await userModel.countDocuments({ userType: 'delivery_partner' });

    const orderDetailStats = {
      totalOrder: totalOrders,
      createdOrder: createdOrders,
      assignedOrder: assignedOrders,
      acceptedOrder: acceptedOrders,
      arrivedOrder: arrivedOrders,
      pulledOrder: pulledOrders,
      departedOrder: departedOrders,
      deliveredOrder: deliveredOrders,
      cancelledOrder: cancelledOrders,
      totalUser: totalUsers,
      totalDeliveryPerson: totalDeliveryPersons,
    };

    // ---------- 3. Financial stats ----------
    // Total collection from all deliveries (totalAmount sum)
    const totalCollectionAgg = await Delivery.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalCollection = totalCollectionAgg[0]?.total || 0;

    // Admin commission = sum of all earnings where type='admin'
    const adminCommissionAgg = await earningModel.aggregate([
      { $match: { type: 'admin' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const adminCommission = adminCommissionAgg[0]?.total || 0;

    // Delivery boy commission = sum of all earnings where type='delivery'
    const deliveryCommissionAgg = await earningModel.aggregate([
      { $match: { type: 'delivery' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const deliveryCommission = deliveryCommissionAgg[0]?.total || 0;

    // Total wallet balance (sum of all user wallets)
    const walletBalanceAgg = await Wallet.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    const totalWalletBalance = walletBalanceAgg[0]?.total || 0;

    // Monthly payment count (sum of all payments in current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyPaymentAgg = await Delivery.aggregate([
      { $match: { createdAt: { $gte: startOfMonth }, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const monthlyPaymentCount = monthlyPaymentAgg[0]?.total || 0;

    const financialStats = {
      totalCollection,
      adminCommission,
      deliveryCommission,
      totalWalletBalance,
      monthlyPaymentCount,
    };

    // ---------- 4. Recent orders (last 8) ----------
    const recentOrders = await Delivery.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('customer', 'firstName lastName')
      .populate('deliveryPartner', 'firstName lastName')
      .select('trackingId status totalAmount createdAt customer deliveryPartner');

    const formattedRecentOrders = recentOrders.map((order:any) => ({
      id: order.trackingId,
      name: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'N/A',
      deliveryMan: order.deliveryPartner ? `${order.deliveryPartner.firstName} ${order.deliveryPartner.lastName}` : 'Unassigned',
      pickupDate: order.createdAt.toLocaleString(),
      createdDate: order.createdAt.toLocaleString(),
      status: order.status === 'delivered' ? 'Completed' : (order.status === 'cancelled' ? 'Cancelled' : 'In Progress'),
    }));

    // ---------- 5. Recent withdrawal requests (last 8) ----------
    const recentWithdrawals = await withdrawalModel.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('deliveryPartner', 'firstName lastName');

    const formattedWithdrawals = recentWithdrawals.map((w:any, idx) => ({
      no: idx + 1,
      name: w.deliveryPartner ? `${w.deliveryPartner.firstName} ${w.deliveryPartner.lastName}` : 'Unknown',
      amount: `₦${w.amount.toLocaleString()}`,
      createdDate: w.createdAt.toLocaleString(),
      status: w.status === 'approved' ? 'Approved' : (w.status === 'rejected' ? 'Rejected' : 'Pending'),
    }));

    // ---------- 6. Charts data ----------
    // 6a. Withdrawal distribution (by status counts)
    const withdrawalStatusCounts = await withdrawalModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const withdrawalDistribution = withdrawalStatusCounts.map(item => ({
      name: item._id.charAt(0).toUpperCase() + item._id.slice(1),
      value: item.count,
      fill: item._id === 'approved' ? '#4F46E5' : (item._id === 'rejected' ? '#EF4444' : '#F59E0B'),
    }));

    // 6b. Weekly order count (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      last7Days.push(d);
    }
    const weeklyOrderData = [];
    for (let i = 0; i < last7Days.length; i++) {
      const dayStart = last7Days[i];
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = await Delivery.countDocuments({
        createdAt: { $gte: dayStart, $lt: dayEnd },
      });
      weeklyOrderData.push({
        name: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
        value: count,
        fill: '#4F46E5',
      });
    }

    // 6c. Monthly payment chart (last 12 months)
    const months = [];
    const monthlyPaymentData = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      const total = await Delivery.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, paymentStatus: 'paid' } },
        { $group: { _id: null, sum: { $sum: '$totalAmount' } } },
      ]);
      monthlyPaymentData.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        amount: total[0]?.sum || 0,
      });
    }

    // 6d. Monthly order count (last 12 months)
    const monthlyOrderData = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      const total = await Delivery.countDocuments({
        createdAt: { $gte: start, $lte: end },
      });
      monthlyOrderData.push({
        date: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        orders: total,
      });
    }

    // ---------- 7. Additional table data (All Recent Activities by city) ----------
    // Group deliveries by city (pickup address city) – simple extraction
    const cityStats = await Delivery.aggregate([
      {
        $group: {
          _id: { $substrCP: ['$pickup.address', 0, 20] }, // approximate
          total: { $sum: 1 },
          inProgress: {
            $sum: { $cond: [{ $in: ['$status', ['assigned', 'picked_up', 'in_transit', 'request_accepted']] }, 1, 0] },
          },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
      { $limit: 4 },
    ]);
    const packagesTableData = cityStats.map(city => ({
      city: city._id,
      total: city.total,
      inProgress: city.inProgress,
      delivered: city.delivered,
      cancelled: city.cancelled,
    }));

    // Final response
    res.status(200).json({
      success: true,
      data: {
        todayOrderStats,
        orderDetailStats,
        financialStats,
        recentOrders: formattedRecentOrders,
        recentWithdrawals: formattedWithdrawals,
        charts: {
          withdrawalDistribution,
          weeklyOrderData,
          monthlyPaymentData,
          monthlyOrderData,
        },
        packagesTableData,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};