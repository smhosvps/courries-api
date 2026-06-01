// routes/coupon.routes.ts (or the correct file name)
import express from "express";
import { authenticate } from "../middleware/auth";
import { createCoupon, getCouponById, getCoupons, updateCoupon, validateCoupon, deleteCoupon } from "../controlers/couponController";


const couponRoute = express.Router();

// Public routes (validation endpoint – can be public or protected)
couponRoute.post("/validate-coupon", validateCoupon);  // ← added missing route

// Protected routes (require authentication)
couponRoute.get("/get-coupons", authenticate, getCoupons);
couponRoute.get("/get-coupon/:id", authenticate, getCouponById);
couponRoute.post("/create-coupon", authenticate, createCoupon);
couponRoute.put("/update-coupon/:id", authenticate, updateCoupon);
couponRoute.delete("/delete-coupon/:id", authenticate, deleteCoupon);

export default couponRoute;