import mongoose, { Document, Model, Schema } from "mongoose";

export interface IPrivacy extends Document {
    title: string;
    detail: string;
}

const privacySchema = new Schema<IPrivacy>({
    title: {
        type: String,
        required: true
    },
    detail: {
        type: String,
        required: true
    },
}, { timestamps: true });

const PrivacyModel: Model<IPrivacy> = mongoose.model<IPrivacy>("Privacy", privacySchema);

export default PrivacyModel;
 