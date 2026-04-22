import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
  name: string;
  country: mongoose.Types.ObjectId;
  geofenced: string[];           // ✅ stored as plain strings (IDs as strings)
  fixedCharges: number;
  cancelCharges: number;
  minimumDistance: number;
  minimumWeight: number;
  perDistanceCharge: number;
  perWeightCharge: number;
  commissionType: 'fixed' | 'percentage';
  adminCommission: number;
  status: 'enable' | 'disable';
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    country: { type: Schema.Types.ObjectId, ref: 'courries-country', required: true },
    geofenced: [{ type: String }],

    fixedCharges: { type: Number, required: true, min: 0 },
    cancelCharges: { type: Number, required: true, min: 0 },
    minimumDistance: { type: Number, required: true, min: 0 },
    minimumWeight: { type: Number, required: true, min: 0 },
    perDistanceCharge: { type: Number, required: true, min: 0 },
    perWeightCharge: { type: Number, required: true, min: 0 },
    commissionType: { type: String, enum: ['fixed', 'percentage'], required: true },
    adminCommission: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['enable', 'disable'], default: 'enable' },
  },
  { timestamps: true }
);

// ✅ Remove any previously compiled model to force fresh definition
if (mongoose.models['courries-city']) {
  delete mongoose.models['courries-city'];
}

export default mongoose.model<ICity>('courries-city', CitySchema);