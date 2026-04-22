// routes/report.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import {
  createReport,
  deleteReport,
  getAllReportsAdmin,
  getReportById,
  getUserReports,
  updateReportStatus,
  uploadReportImages,
} from "../controlers/report.controller";

const reportRouter = express.Router();

// User routes
reportRouter.post("/create-report", authenticate, createReport);
reportRouter.get("/user-reports", authenticate, getUserReports);
reportRouter.get("/report/:id", authenticate, getReportById);

// Admin routes
reportRouter.get(
  "/admin/all-reports",
  authenticate,
  //   authorizeRoles("admin"),
  getAllReportsAdmin
);
reportRouter.put(
  "/admin/update-status/:id",
  authenticate,
  //   authorizeRoles("admin"),
  updateReportStatus
);
reportRouter.delete("/admin/delete-report/:id", authenticate, deleteReport);

// Image upload helper
reportRouter.post("/upload-images", uploadReportImages);

export default reportRouter;
