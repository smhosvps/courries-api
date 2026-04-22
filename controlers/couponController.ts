import { Request, Response } from 'express';
import couponModel from '../models/coupon.model';


// Get all coupons (populate city)
export const getCoupons = async (req: Request, res: Response) => {
  try {
    const coupons = await couponModel.find().populate('city', 'name').sort({ createdAt: -1 });
    res.status(200).json(coupons);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get single coupon
export const getCouponById = async (req: Request, res: Response) => {
  try {
    const coupon = await couponModel.findById(req.params.id).populate('city', 'name');
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.status(200).json(coupon);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Create coupon
export const createCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = new couponModel(req.body);
    const saved = await coupon.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update coupon
export const updateCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await couponModel.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    Object.assign(coupon, req.body);
    const updated = await coupon.save();
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete coupon
export const deleteCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await couponModel.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    await coupon.deleteOne();
    res.status(200).json({ message: 'Coupon removed' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};