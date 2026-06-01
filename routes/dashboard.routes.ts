


// routes/contactSupport.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import { getDashboardDataV1, getDashboardDataV2, getDashboardDataV3 } from "../controlers/dashboardController";


const dashboardRoute = express.Router();

// Public routes
dashboardRoute.get("/get-admin-stats", authenticate, getDashboardDataV1);
dashboardRoute.get("/get-dashboard-stats", authenticate, getDashboardDataV2);
dashboardRoute.get("/get-dashboard-data", authenticate, getDashboardDataV3);

export default dashboardRoute;
 