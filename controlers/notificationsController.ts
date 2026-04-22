// controllers/notificationsController.ts
import { NextFunction, Request, Response } from "express";
import Notification from "../models/notificationModel";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";

// Get user notifications
export const getUserNotifications = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    
    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    // Get counts
    const unreadCount = await Notification.countDocuments({ 
      recipient: userId, 
      read: false 
    });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Mark notification as read
export const markNotificationAsRead = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      { read: true, status: "read" },
      { new: true }
    );

    if (!notification) {
      return next(new ErrorHandler("Notification not found", 404));
    }

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({ 
      recipient: userId, 
      read: false 
    });

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification,
      unreadCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Mark all notifications as read
export const markAllNotificationsAsRead = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true, status: "read" }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      count: result.modifiedCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete notification by ID
export const deleteNotificationById = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const notification = await Notification.findOneAndDelete({ 
      _id: id, 
      recipient: userId 
    });

    if (!notification) {
      return next(new ErrorHandler("Notification not found", 404));
    }

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({ 
      recipient: userId, 
      read: false 
    });

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      unreadCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete all notifications
export const deleteAllNotifications = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const result = await Notification.deleteMany({ recipient: userId });

    res.status(200).json({
      success: true,
      message: "All notifications deleted successfully",
      count: result.deletedCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete all read notifications
export const deleteAllReadNotifications = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    const result = await Notification.deleteMany({ 
      recipient: userId, 
      read: true 
    });

    res.status(200).json({
      success: true,
      message: "All read notifications deleted successfully",
      count: result.deletedCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});