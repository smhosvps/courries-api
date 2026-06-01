import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEarningSetting extends Document {
  adminPercentage: number;
  riderPercentage: number;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

// Define the static methods interface
interface IEarningSettingModel extends Model<IEarningSetting> {
  getSingleton(): Promise<IEarningSetting>;
}

const EarningSettingSchema = new Schema<IEarningSetting, IEarningSettingModel>(
  {
    adminPercentage: { type: Number, required: true, min: 0, max: 100, default: 22.5 },
    riderPercentage: { type: Number, required: true, min: 0, max: 100, default: 77.5 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true } // optional, but you already have updatedAt
);

// Static method implementation
EarningSettingSchema.statics.getSingleton = async function() {
  let setting = await this.findOne();
  if (!setting) {
    setting = await this.create({ adminPercentage: 22.5, riderPercentage: 77.5 });
  }
  return setting;
};

const EarningSetting = mongoose.model<IEarningSetting, IEarningSettingModel>(
  'EarningSetting',
  EarningSettingSchema
);

export default EarningSetting;