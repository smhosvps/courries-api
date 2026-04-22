import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
  paystackKey: string;
  oneSignalPlayerId: string;
  webClientId: string;
  iosClientId: string;
  googleMapsApiKey: string;
  googleMapsIosApiKey: string;
  googleMapsAndroidApiKey: string;
}

const SettingSchema: Schema = new Schema(
  {
    paystackKey: { type: String, default: '' },
    oneSignalPlayerId: { type: String, default: '' },
    webClientId: { type: String, default: '' },
    iosClientId: { type: String, default: '' },
    googleMapsApiKey: { type: String, default: '' },
    googleMapsIosApiKey: { type: String, default: '' },
    googleMapsAndroidApiKey: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model<ISetting>('courries-Setting', SettingSchema);