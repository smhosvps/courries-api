import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  startDate: Date;
  endDate: Date;
  valueType: 'fixed' | 'percentage';
  discountAmount: number;
  cityType: 'all' | 'specific';
  city: mongoose.Types.ObjectId[];
  status: 'enable' | 'disable';
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    valueType: { type: String, enum: ['fixed', 'percentage'], required: true },
    discountAmount: { type: Number, required: true, min: 0 },
    cityType: { type: String, enum: ['all', 'specific'], required: true },
    city: [{ type: Schema.Types.ObjectId, ref: 'courries-city' }],
    status: { type: String, enum: ['enable', 'disable'], default: 'enable' },
  },
  { timestamps: true }
);

// Auto-generate a unique coupon code if not provided
CouponSchema.pre('save', async function (next) {
  if (!this.code) {
    let code = ''; // ✅ initialized to avoid TypeScript error
    let exists = true;
    while (exists) {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const existing = await mongoose.model('courries-Coupon').findOne({ code });
      if (!existing) exists = false;
    }
    this.code = code;
  }
  // Validate cities when cityType is 'specific'
  if (this.cityType === 'specific' && (!this.city || this.city.length === 0)) {
    return next(new Error('At least one city must be selected when cityType is specific'));
  }
  next();
});

export default mongoose.model<ICoupon>('courries-Coupon', CouponSchema);