import mongoose from 'mongoose';

const countrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Country name is required'],
    unique: true,
    trim: true
  },
  distanceType: {
    type: String,
    required: [true, 'Distance type is required'],
    enum: ['km', 'm', 'cm', 'mi', 'nmi'],
    default: 'km'
  },
  weightType: {
    type: String,
    required: [true, 'Weight type is required'],
    enum: ['kg'],
    default: 'kg'
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['enable', 'disable'],
    default: 'enable'
  }
}, {
  timestamps: true
});


export const CountryModel = mongoose.model("courries-country", countrySchema);
