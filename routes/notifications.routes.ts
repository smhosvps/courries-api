import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  deleteNotificationById,
  editNotificationRead,
  getNotificationById,
} from "../controlers/notificationsController";

export const notificationRouter = express.Router();

notificationRouter.get("/notification/:userId", getNotificationById);
notificationRouter.put(
  "/notifications/:id/read",
  editNotificationRead,
  authenticate
);
notificationRouter.delete(
  "/notifications/:id",
  deleteNotificationById,
  authenticate
);
