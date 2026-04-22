import { Request, Response } from "express";
import earningModel from "../models/earning.model";
import withdrawalModel from "../models/withdrawal.model";
import userModel from "../models/user_model";
import mongoose from "mongoose";
import { sendPushToUser } from "../services/onesignalService";
import Notification from "../models/notificationModel";


const getPartnerEarnings = async (partnerId: any) => {
  const objectId = new mongoose.Types.ObjectId(partnerId);
  const earnings = await earningModel.aggregate([
    { $match: { recipient: objectId, type: 'delivery' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return earnings.length > 0 ? earnings[0].total : 0;
};

const getWithdrawnAmount = async (partnerId: any) => {
  const objectId = new mongoose.Types.ObjectId(partnerId);
  const withdrawals = await withdrawalModel.aggregate([
    { $match: { deliveryPartner: objectId, status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return withdrawals.length > 0 ? withdrawals[0].total : 0;
};

// Delivery partner requests withdrawal
export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const partnerId = req.user.id; // Assuming auth middleware sets req.user

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Check available balance
    const totalEarned = await getPartnerEarnings(partnerId);
    const totalWithdrawn = await getWithdrawnAmount(partnerId);
    const availableBalance = totalEarned - totalWithdrawn;

    if (amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ₦${availableBalance.toFixed(2)}`
      });
    }

    // Create withdrawal request
    const withdrawal = await withdrawalModel.create({
      deliveryPartner: partnerId,
      amount,
      status: 'pending'
    });

    // Notify admins (optional)
    const admins = await userModel.find({ userType: 'super admin' });
    // You can create notifications here if needed

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: withdrawal
    });
  } catch (error: any) {
    console.error('Withdrawal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to request withdrawal'
    });
  }
};





// Admin gets all withdrawal requests (with filters)
export const getWithdrawals = async (req: Request, res: Response) => {
  try {
    const { status, deliveryPartner } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (deliveryPartner) filter.deliveryPartner = deliveryPartner;

    const withdrawals = await withdrawalModel.find(filter)
      .populate('deliveryPartner', 'firstName lastName phone email avatar')
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: withdrawals
    });
  } catch (error: any) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch withdrawals'
    });
  }
};


// Helper to send push notification
const sendPushNotification = async (
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

    console.log(`Attempting to send push to user ${userId}:`, {
      playerId: user.onesignalPlayerId.playerId,
      deviceType: user.onesignalPlayerId.deviceType,
      title,
      message
    });

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



// Admin approves/rejects withdrawal
// Admin approves/rejects withdrawal
export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id, adminId }:any = req.params;
    const { action, remarks } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be approve or reject'
      });
    }

    const withdrawal = await withdrawalModel.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Withdrawal already ${withdrawal.status}`
      });
    }

    if (action === 'approve') {
      // Ensure the partner still has sufficient balance
      const totalEarned = await getPartnerEarnings(withdrawal.deliveryPartner);
      const totalWithdrawn = await getWithdrawnAmount(withdrawal.deliveryPartner);
      const availableBalance = totalEarned - totalWithdrawn;

      if (withdrawal.amount > availableBalance) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance to approve this withdrawal'
        });
      }

      withdrawal.status = 'approved';
    } else {
      withdrawal.status = 'rejected';
    }

    withdrawal.remarks = remarks || '';
    withdrawal.processedBy = adminId;
    withdrawal.processedAt = new Date();

    await withdrawal.save();

    // Notify the delivery partner about the withdrawal status
    const partner = await userModel.findById(withdrawal.deliveryPartner);
    if (partner) {
      const notificationData = {
        type: 'withdrawal',
        withdrawalId: withdrawal._id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        remarks: withdrawal.remarks,
        processedAt: withdrawal.processedAt,
      };

      let content = '';
      if (withdrawal.status === 'approved') {
        content = `Your withdrawal request of ₦${withdrawal.amount.toLocaleString()} has been approved. The funds will be transferred to your bank account shortly.`;
      } else {
        content = `Your withdrawal request of ₦${withdrawal.amount.toLocaleString()} has been rejected. ${withdrawal.remarks ? `Reason: ${withdrawal.remarks}` : ''
          }`;
      }

      await Notification.create({
        recipient: withdrawal.deliveryPartner,
        type: 'withdrawal',
        status: withdrawal.status === 'approved' ? 'success' : 'failed',
        content,
        data: notificationData,
        read: false,
      });

      await sendPushNotification(
        withdrawal.deliveryPartner.toString(),
        withdrawal.status === 'approved' ? '✅ Withdrawal Approved' : '❌ Withdrawal Rejected',
        content,
        notificationData
      );
    }

    // Optionally notify the admin who processed it (or all admins)
    const admin = await userModel.findById(adminId);
    if (admin) {
      await Notification.create({
        recipient: adminId,
        type: 'withdrawal_processed',
        status: 'info',
        content: `You have ${withdrawal.status} a withdrawal request of ₦${withdrawal.amount.toLocaleString()} for partner ${partner?.firstName} ${partner?.lastName}`,
        data: {
          withdrawalId: withdrawal._id,
          action: withdrawal.status,
          partner: withdrawal.deliveryPartner,
          amount: withdrawal.amount,
        },
        read: false,
      });
      // Optional push notification to admin (if needed)
    }

    res.status(200).json({
      success: true,
      message: `Withdrawal ${action}d successfully`,
      data: withdrawal,
    });
  } catch (error: any) {
    console.error('Process withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process withdrawal',
    });
  }
};
// Get delivery partner's withdrawal history
export const getMyWithdrawals = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const withdrawals = await withdrawalModel.find({ deliveryPartner: partnerId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: withdrawals
    });
  } catch (error: any) {
    console.error('Get my withdrawals error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch withdrawals'
    });
  }
};

// Get partner's balance
// Get partner's balance with recent transactions
export const getMyBalance = async (req: Request, res: Response) => {
  try {


    const partnerId = req.user.id;

    // Get totals
    const totalEarned = await getPartnerEarnings(partnerId);
    const totalWithdrawn = await getWithdrawnAmount(partnerId);
    const available = totalEarned - totalWithdrawn;

    // Get recent earnings (up to 10)
    const recentEarnings = await earningModel
      .find({ recipient: partnerId, type: 'delivery' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('delivery', 'trackingId deliveryCode status')
      .lean();

    // Get recent withdrawals (up to 10)
    const recentWithdrawals = await withdrawalModel
      .find({ deliveryPartner: partnerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Combine and format transactions
    const earningsTransactions = recentEarnings.map(earning => ({
      id: earning._id,
      type: 'earning' as const,
      amount: earning.amount,
      percentage: earning.percentage,
      status: 'completed', // earnings are always completed
      date: earning.createdAt,
      description: `Earning from delivery ${(earning.delivery as any)?.trackingId || earning.delivery}`,
      deliveryId: earning.delivery,
    }));



    const withdrawalTransactions = recentWithdrawals.map(withdrawal => ({
      id: withdrawal._id,
      type: 'withdrawal' as const,
      amount: withdrawal.amount,
      status: withdrawal.status,
      date: withdrawal.createdAt,
      description: `Withdrawal request ${withdrawal.status}`,
      processedAt: withdrawal.processedAt,
      remarks: withdrawal.remarks,
    }));


    // Combine and sort by date (most recent first)
    const allTransactions = [...earningsTransactions, ...withdrawalTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10); // limit to 10 total


    res.status(200).json({
      success: true,
      data: {
        balance: {
          totalEarned,
          totalWithdrawn,
          available,
        },
        transactions: allTransactions,
        // Optional: separate lists for convenience
        earnings: earningsTransactions,
        withdrawals: withdrawalTransactions,
      },
    });
  } catch (error: any) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch balance',
    });
  }
};