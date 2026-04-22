import mongoose from "mongoose";

const geofenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["circle", "polygon"], required: true },
    // For circles
    center: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], required: false },
    },
    radius: { type: Number, required: false },
    // For polygons
    polygon: {
      type: { type: String, enum: ["Polygon"] },
      coordinates: { type: [[[Number]]], required: false },
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "courries-geofencing",
    // This ensures that only the relevant fields are saved
  }
);

// Indexes
geofenceSchema.index({ center: "2dsphere" });
geofenceSchema.index({ polygon: "2dsphere" });

export default mongoose.model("Geofence", geofenceSchema);