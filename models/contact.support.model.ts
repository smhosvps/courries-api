// models/contactSupport.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IContactSupport extends Document {
  email: string;
  phoneNumbers: {
    number: string;
    label: string;
    isActive: boolean;
  }[];
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contactSupportSchema = new Schema<IContactSupport>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phoneNumbers: [
      {
        number: {
          type: String,
          required: [true, "Phone number is required"],
        },
        label: {
          type: String,
          default: "Support",
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const ContactSupportModel: Model<IContactSupport> = mongoose.model<IContactSupport>(
  "courries-ContactSupport",
  contactSupportSchema
);

export default ContactSupportModel;