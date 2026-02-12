import mongoose, { Schema, Document } from 'mongoose';

interface IDeletionReason extends Document {
  userId: string;
  reason: string;
}

const deletionReasonSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true, // Each user should only have one deletion reason
  },
  reason: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 500,
  },

}, { timestamps: true });

const DeletionReasonModel = mongoose.model<IDeletionReason>(
  'DeletionReason',
  deletionReasonSchema
);

export default DeletionReasonModel;
