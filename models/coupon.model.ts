import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
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

// Validate that if cityType is 'specific', city array is not empty
CouponSchema.pre('save', function(next) {
  if (this.cityType === 'specific' && (!this.city || this.city.length === 0)) {
    next(new Error('At least one city must be selected when cityType is specific'));
  } else {
    next();
  }
});

export default mongoose.model<ICoupon>('courries-Coupon', CouponSchema);