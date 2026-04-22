// models/faq.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IFaq extends Document {
  question: string;
  answer: string;
  category: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new Schema<IFaq>(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
    },
    answer: {
      type: String,
      required: [true, "Answer is required"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["general", "account", "billing", "technical", "support"],
      default: "general",
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const FaqModel: Model<IFaq> = mongoose.model<IFaq>("Faq", faqSchema);

export default FaqModel;