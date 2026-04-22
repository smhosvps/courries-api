// models/report.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IReport extends Document {
  userId: mongoose.Types.ObjectId;
  deliveryId: mongoose.Types.ObjectId;
  deliveryType: string;
  issueType: string;
  deliveryCode: string;
  description: string;
  images: string[];
  status: "pending" | "in-progress" | "resolved" | "rejected";
  resolvedNote?: string;
  adminNote?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "courries-user",
      required: [true, "User ID is required"],
    },
    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: "courries-delivery",
      required: [true, "Delivery ID is required"],
    },
    deliveryCode: String,
    deliveryType: String,
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    issueType: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "resolved", "rejected"],
      default: "pending",
    },
    resolvedNote: {
      type: String,
      trim: true,
    },
    adminNote: {
      type: String,
      trim: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "courries-user",
    },
    resolvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const ReportModel: Model<IReport> = mongoose.model<IReport>(
  "courries-Report",
  reportSchema
);

export default ReportModel;
