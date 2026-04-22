import mongoose, { Document, Model, Schema } from "mongoose";

export interface IPrivacy extends Document {
  title: string;
  detail: string;
  type: "privacy" | "terms";
}

const privacySchema = new Schema<IPrivacy>(
  {
    title: {
      type: String,
      required: true,
    },
    detail: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["privacy", "terms"],
      default: "privacy",
    },
  },
  { timestamps: true }
);

const PrivacyModel: Model<IPrivacy> = mongoose.model<IPrivacy>(
  "courries-privacy",
  privacySchema
);

export default PrivacyModel;
