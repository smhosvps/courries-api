// src/models/User.ts
import mongoose, { Document, Model, Schema } from "mongoose";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Regular expressions for validation
const emailRegexPattern: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IAddress { 
  addressType: "home" | "office" | "other"; 
  street: string;
  city: string;
  state: string; 
  zipCode: string;
  country: string;
}

// Delivery Partner specific interface
interface IDeliveryPartnerInfo {
  vehicle: {
    type: "bicycle" | "bike" | "car" | "van";
    model?: string;
    plateNumber?: string;
    color?: string;
    year?: number;
  };
  documents: {
    license: {
      number: string;
      expiryDate: Date;
      image: string;
    };
    insurance?: {
      number: string;
      expiryDate: Date;
      image: string;
    };
    vehicleRegistration?: {
      number: string;
      expiryDate: Date;
      image: string;
    };
  };
  status: "available" | "busy" | "offline" | "on_break";
  rating: number;
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  averageRating: number;
  earnings: {
    total: number;
    pending: number;
    available: number;
    lastPayout?: Date;
  };
  location?: {
    coordinates: {
      lat: number;
      lng: number;
    };
    lastUpdated: Date;
  };
  online: boolean;
  currentDelivery?: mongoose.Types.ObjectId;
  workingHours: {
    start: string; // "09:00"
    end: string; // "18:00"
    timezone: string;
  };
  preferences: {
    maxDistance: number; // in km
    minDeliveryFee: number;
    acceptedPackageTypes: string[];
  };
  verificationStatus: {
    identity: boolean;
    vehicle: boolean;
    backgroundCheck: boolean;
    verified: boolean;
  };
}

export interface IUser extends Document {
  // Required Fields
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  userType: "customer" | "delivery_partner" | "admin";
  phone?: string;
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  dateOfBirth?: Date;
  gender?: string;
  accountType?: string;
  register_source?: string;
  register_device?: string;
  addresses: IAddress[];
  avatar?: {
    public_id: string;
    url: string;
  };

  // Delivery Partner Specific Fields (optional)
  deliveryPartnerInfo?: IDeliveryPartnerInfo;

  // Deletion Fields
  deletionRequested: boolean;
  deletionRequestDate?: Date;
  status: "active" | "pending-deletion" | "deleted";

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword: (password: string) => Promise<boolean>;
  getJwtToken: () => string;
  isDeliveryPartner: () => boolean;
  updateLocation: (lat: number, lng: number) => Promise<void>;
}

const addressSchema = new Schema<IAddress>({
  addressType: {
    type: String,
    enum: ["home", "office", "other"],
    required: true,
  },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true },
});

const deliveryPartnerInfoSchema = new Schema<IDeliveryPartnerInfo>({
  vehicle: {
    type: {
      type: String,
      enum: ["bicycle", "bike", "car", "van"],
      required: true,
    },
    model: String,
    plateNumber: String,
    color: String,
    year: Number,
  },
  documents: {
    license: {
      number: { type: String, required: true },
      expiryDate: { type: Date, required: true },
      image: { type: String, required: true },
    },
    insurance: {
      number: String,
      expiryDate: Date,
      image: String,
    },
    vehicleRegistration: {
      number: String,
      expiryDate: Date,
      image: String,
    },
  },
  status: {
    type: String,
    enum: ["available", "busy", "offline", "on_break"],
    default: "offline",
  },
  rating: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },
  completedDeliveries: { type: Number, default: 0 },
  cancelledDeliveries: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
  earnings: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    lastPayout: Date,
  },
  location: {
    coordinates: {
      lat: Number,
      lng: Number,
    },
    lastUpdated: Date,
  },
  online: { type: Boolean, default: false },
  currentDelivery: {
    type: Schema.Types.ObjectId,
    ref: "courries-delivery",
  },
  workingHours: {
    start: { type: String, default: "09:00" },
    end: { type: String, default: "18:00" },
    timezone: { type: String, default: "UTC" },
  },
  preferences: {
    maxDistance: { type: Number, default: 20 }, // 20km
    minDeliveryFee: { type: Number, default: 500 }, // ₦500
    acceptedPackageTypes: [{ type: String }],
  },
  verificationStatus: {
    identity: { type: Boolean, default: false },
    vehicle: { type: Boolean, default: false },
    backgroundCheck: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
  },
});

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      validate: {
        validator: function (value: string) {
          if (!value) return true;
          return emailRegexPattern.test(value);
        },
        message: "Please enter a valid email",
      },
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    userType: {
      type: String,
      enum: ["customer", "delivery_partner", "admin"],
      default: "customer",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: String,
    otpExpires: Date,
    dateOfBirth: Date,
    gender: String,
    accountType: String,
    register_source: String,
    register_device: String,
    deletionRequested: {
      type: Boolean,
      default: false,
    },
    deletionRequestDate: Date,
    status: {
      type: String,
      enum: ["active", "pending-deletion", "deleted"],
      default: "active",
    },
    addresses: [addressSchema],
    avatar: {
      public_id: String,
      url: String,
    },
    deliveryPartnerInfo: deliveryPartnerInfoSchema,
  },
  {
    timestamps: true,
  }
);

// Indexes for delivery partner queries
userSchema.index({ userType: 1 });
userSchema.index({ "deliveryPartnerInfo.status": 1 });
userSchema.index({ "deliveryPartnerInfo.location.coordinates": "2dsphere" });
userSchema.index({ "deliveryPartnerInfo.online": 1 });

// Hash password before saving
userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Generate JWT token
userSchema.methods.getJwtToken = function (): string {
  return jwt.sign(
    { id: this._id, userType: this.userType },
    process.env.JWT_SECRET as string,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "3d",
    } as SignOptions
  );
};

// Compare password
userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user is delivery partner
userSchema.methods.isDeliveryPartner = function (): boolean {
  return this.userType === "delivery_partner";
};

// Update delivery partner location
userSchema.methods.updateLocation = async function (lat: number, lng: number): Promise<void> {
  if (this.userType === "delivery_partner" && this.deliveryPartnerInfo) {
    this.deliveryPartnerInfo.location = {
      coordinates: { lat, lng },
      lastUpdated: new Date(),
    };
    await this.save();
  }
};

const userModel: Model<IUser> = mongoose.model("courries-user", userSchema);
export default userModel;