import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryOption extends Document {
  title: string;
  description: string;
  tag: string;
  tagColor: string;
  tagTextColor: string;
  icon: string | null;
  basePrice: number;
  perKm: number;
  speed: number;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryOptionSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  tag: { type: String, required: true },
  tagColor: { type: String, required: true },
  tagTextColor: { type: String, required: true },
  icon: { type: String, default: null },
  basePrice: { type: Number, required: true },
  perKm: { type: Number, required: true },
  speed: { type: Number, required: true }
}, {
  timestamps: true
});

// Ensure no unintended indexes
// If you want to drop all indexes and recreate only _id, uncomment this:
DeliveryOptionSchema.index({}); // This ensures only _id is indexed

// Make sure we're not creating any unique indexes on title or other fields
// If you want title to be unique, add:
// DeliveryOptionSchema.index({ title: 1 }, { unique: true });

export default mongoose.model<IDeliveryOption>('courries-DeliveryOption', DeliveryOptionSchema);