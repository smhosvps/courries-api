// routes/notification.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import {
  deleteAllNotifications,
  deleteAllReadNotifications,
  deleteNotificationById,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controlers/notificationsController";

export const notificationRouter = express.Router();

// All routes require authentication
notificationRouter.use(authenticate);

// Get user notifications
notificationRouter.get("/my-notifications", getUserNotifications);

// Mark single notification as read
notificationRouter.put("/notifications/:id/mark-read", markNotificationAsRead);

// Mark all notifications as read
notificationRouter.put(
  "/notifications/mark-all-read",
  markAllNotificationsAsRead
);

// ✅ Static routes first
notificationRouter.delete("/notifications/delete-all", deleteAllNotifications);
notificationRouter.delete("/notifications/delete-read", deleteAllReadNotifications);

// ✅ Then dynamic routes
notificationRouter.delete("/notifications/:id", deleteNotificationById);
