


// routes/contactSupport.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import { getDashboardData } from "../controlers/dashboardController";


const dashboardRoute = express.Router();

// Public routes
dashboardRoute.get("/get-admin-stats", authenticate, getDashboardData); 

export default dashboardRoute;
 