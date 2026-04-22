


// routes/contactSupport.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import { createCoupon, deleteCoupon, getCouponById, getCoupons, updateCoupon } from "../controlers/couponController";


const couponRoute = express.Router();

// Public routes
couponRoute.get("/get-coupons", authenticate, getCoupons);
couponRoute.get("/get-coupon/:id", authenticate, getCouponById);
couponRoute.post("/create-coupon", authenticate, createCoupon);
couponRoute.put("/update-coupon/:id", authenticate, updateCoupon);
couponRoute.delete("/delete-coupon/:id", authenticate, deleteCoupon);

export default couponRoute;
