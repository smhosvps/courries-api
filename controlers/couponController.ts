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
    // If you want admin to supply the code, validate uniqueness here
    const existing = await couponModel.findOne({ code: req.body.code });
    if (existing) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    const coupon = new couponModel(req.body);
    const saved = await coupon.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update coupon
// Update coupon – prevent code duplication
export const updateCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await couponModel.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    
    // If code is being changed, check uniqueness
    if (req.body.code && req.body.code !== coupon.code) {
      const existing = await couponModel.findOne({ code: req.body.code });
      if (existing) {
        return res.status(400).json({ message: 'Coupon code already exists' });
      }
    }
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

// Validate coupon and get discount info
export const validateCoupon = async (req: Request, res: Response) => {
  try {
    const { code, cartTotal, cityId } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    // Find active coupon
    const coupon = await couponModel.findOne({ code: code.toUpperCase(), status: 'enable' });
    if (!coupon) {
      return res.status(404).json({ message: 'Invalid or expired coupon code' });
    }

    // Check date validity
    const now = new Date();
    const start = new Date(coupon.startDate);
    const end = new Date(coupon.endDate);
    if (now < start || now > end) {
      return res.status(400).json({ message: 'Coupon is not valid at this time' });
    }

    // Check city eligibility (if cityId provided)
    if (cityId && coupon.cityType === 'specific') {
      const cityIds = coupon.city.map(id => id.toString());
      if (!cityIds.includes(cityId)) {
        return res.status(400).json({ message: 'Coupon is not applicable to your city' });
      }
    }

    // Prepare response
    let percentageDeduction = null;
    if (coupon.valueType === 'percentage') {
      percentageDeduction = coupon.discountAmount; // e.g., 15 for 15%
    } else if (cartTotal && cartTotal > 0) {
      // Calculate percentage discount for fixed amount relative to cart total
      percentageDeduction = (coupon.discountAmount / cartTotal) * 100;
      // Cap at 100%
      percentageDeduction = Math.min(percentageDeduction, 100);
    }

    const response = {
      valid: true,
      code: coupon.code,
      valueType: coupon.valueType,
      discountAmount: coupon.discountAmount,
      percentageDeduction: percentageDeduction !== null ? parseFloat(percentageDeduction.toFixed(2)) : null,
      message: coupon.valueType === 'percentage' 
        ? `${coupon.discountAmount}% discount applied` 
        : `$${coupon.discountAmount} discount applied`,
    };

    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};