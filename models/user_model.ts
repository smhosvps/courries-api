import mongoose, { Document, Model, Schema, Types } from "mongoose";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Regular expressions for validation
const emailRegexPattern: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IAddress {
  addressType: "home" | "work" | "other";
  street: string;
  city: string;
  state: string;
  country: string;
}

interface IBank {
  bank_name: "home" | "office" | "other";
  account_number: string;
  account_name: string; 
  paystackRecipientCode: string;
  isActive: boolean
}


export interface IReview {
  user: Types.ObjectId;
  rating: number;
  comment: string;
  deliveryId: Types.ObjectId;
  response?: {
    comment?: string;
    respondedAt?: Date;
  };
  images?: string[];
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// OneSignal Player ID interface
interface IOneSignalPlayerId {
  playerId: string;
  deviceType: string; // 'ios', 'android', 'web'
  lastActive: Date;
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
    nin: {
      number: string;
      house_address: string;
      image: string;
    };
  };
  languages?: Array<"English" | "Pidgin" | "Yoruba" | "Hausa" | "Igbo" | "French" | "Other">;
  status: "available" | "busy" | "offline" | "on_break";
  rating: number;
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  averageRating: number;
  stats: {
    totalDeliveries: number;
    completedDeliveries: number;
    cancelledDeliveries: number;
    averageRating: number;
    totalReviews: number;
    acceptanceRate: number;
  };
  earnings: {
    total: number;
    pending: number;
    available: number;
    lastPayout?: Date;
  };
  location?: {
    coordinates: {
      type: 'Point';
      coordinates: [number, number]; // [longitude, latitude]  ✅ FIXED ORDER
    };
    lastUpdated: Date;
  };
  online: boolean;
  currentDelivery?: mongoose.Types.ObjectId;
  workingHours: {
    start: string; // "09:00"
    end: string;   // "18:00"
    timezone: string;
  };
  other_information: {
    why_become_a_delivery_driver: string;
    income_target: string;
    next_of_kin_name: string; 
    next_of_kin_phone: string;
    next_of_kin_nin: string;
    next_of_kin_address: string;   // ✅ corrected spelling
    next_of_kin_occupation: string;
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
    submitted: boolean;
    verified: boolean;
  };

  reviews: Types.DocumentArray<IReview>;
}

export interface IUser extends Document {
  // Required Fields
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  userType: "customer" | "delivery_partner" | "admin" | "super admin";
  phone?: string;
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  dateOfBirth?: Date;
  adminRiders: "Yes" | "No";
  gender?: string;
  address: string;
  accountType?: string;
  // Add these new fields for Apple authentication
  appleUserId: string,
  googleId: string,
  isAppleLinked: boolean,
  authProvider: 'local' | 'apple' | 'google',
  register_source?: string;
  register_device?: string;
  addresses: IAddress[];
  bank: IBank[];
  avatar?: {
    public_id: string;
    url: string;
  };
  // OneSignal Player ID - now a single object instead of array
  onesignalPlayerId?: IOneSignalPlayerId;

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
  getRefreshToken(): string;
  updateLocation: (lat: number, lng: number) => Promise<void>;
}

const bankSchema = new Schema<IBank>({
  bank_name: {
    type: String,
    required: true,
  },
  account_name: { type: String, required: true },
  account_number: { type: String, required: true },
  paystackRecipientCode: { type: String },
  isActive: { type: Boolean, required: true, default: false },
});

const addressSchema = new Schema<IAddress>({
  addressType: {
    type: String,
    enum: ["home", "work", "other", "office"],
    required: true,
  },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true, default: "Nigeria" },
});


const reviewSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "courries-user",
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  deliveryId: {
    type: Schema.Types.ObjectId,
    ref: "courries-delivery",
    required: true,
  },
  response: {
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    respondedAt: Date,
  },
  images: [String],
  isVerified: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const deliveryPartnerInfoSchema = new Schema<IDeliveryPartnerInfo>({
  vehicle: {
    type: {
      type: String,
      enum: ["bicycle", "bike", "car", "van"],
    },
    model: String,
    plateNumber: String,
    color: String,
    year: Number,
  },

  documents: {
    license: {
      number: { type: String,  },
      expiryDate: { type: Date,},
      image: { type: String },
    },
    vehicleRegistration: {
      number: String,
      expiryDate: Date,
      image: String,
    },
  },
  languages: {
    type: [String],
    enum: ['English', 'Pidgin', 'Yoruba', 'Hausa', 'Igbo', 'French', 'Other'],
    default: []
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
  stats: {
    totalDeliveries: { type: Number, default: 0 },
    completedDeliveries: { type: Number, default: 0 },
    cancelledDeliveries: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 100 },
  },
  earnings: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    lastPayout: Date,
  },


location: {
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      default: [0, 0],           // ✅ default coordinates
      validate: {
        validator: (v: number[]) => Array.isArray(v) && v.length === 2,
        message: 'Coordinates must be [longitude, latitude]'
      }
    }
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
    maxDistance: { type: Number, default: 20 },
    minDeliveryFee: { type: Number, default: 500 },
    acceptedPackageTypes: [{ type: String }],
  },
  verificationStatus: {
    identity: { type: Boolean, default: false },
    vehicle: { type: Boolean, default: false },
    backgroundCheck: { type: Boolean, default: false },
    submitted: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },   // ✅ default ensures field exists
  },
  reviews: [reviewSchema],
});


const oneSignalPlayerIdSchema = new Schema<IOneSignalPlayerId>({
  playerId: { type: String, required: true },
  deviceType: { type: String, required: true, enum: ['ios', 'android', 'web'] },
  lastActive: { type: Date, default: Date.now }
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
    adminRiders: {
      type: String,
      enum: ["Yes", "No"],
      default: "No"
    },
    address: {
      type: String
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      required: true,
      select: false,
    },
    // Add these new fields for Apple authentication
    appleUserId: {
      type: String,
      sparse: true,
      unique: true,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    isAppleLinked: {
      type: Boolean,
      default: false,
    },
    authProvider: {
      type: String,
      enum: ['local', 'apple', 'google'],
      default: 'local',
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
      enum: ["customer", "delivery_partner", "admin", "super admin"],
      default: "customer",
    },
    // OneSignal Player ID - now a single object
    onesignalPlayerId: oneSignalPlayerIdSchema,
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
    bank: [bankSchema],
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
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ "deliveryPartnerInfo.stats.averageRating": -1 });
userSchema.index({ "deliveryPartnerInfo.status": 1 });
userSchema.index({ "deliveryPartnerInfo.location.coordinates": "2dsphere" });
userSchema.index({ "deliveryPartnerInfo.online": 1 });
userSchema.index({ "deliveryPartnerInfo.reviews.deliveryId": 1 });
userSchema.index({ "deliveryPartnerInfo.reviews.user": 1 });
userSchema.index({ "deliveryPartnerInfo.stats.averageRating": -1 });


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

// Generate refresh token
userSchema.methods.getRefreshToken = function (this: IUser): string {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET as string,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
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

// ✅ FIXED: Update delivery partner location with correct coordinate order [lng, lat]
userSchema.methods.updateLocation = async function (
  lat: number,
  lng: number
): Promise<void> {
  if (this.userType === "delivery_partner" && this.deliveryPartnerInfo) {
    this.deliveryPartnerInfo.location = {
      coordinates: {
        type: "Point",
        coordinates: [lng, lat]   // GeoJSON standard: [longitude, latitude]
      },
      lastUpdated: new Date(),
    };
    await this.save();
  }
};

userSchema.pre('save', function(next) {
  if (this.userType === 'delivery_partner' && this.deliveryPartnerInfo) {
    // Ensure location exists and has valid coordinates
    if (!this.deliveryPartnerInfo.location) {
      this.deliveryPartnerInfo.location = {
        coordinates: { type: 'Point', coordinates: [0, 0] },
        lastUpdated: new Date()
      };
    } else if (!this.deliveryPartnerInfo.location.coordinates?.coordinates ||
               this.deliveryPartnerInfo.location.coordinates.coordinates.length !== 2) {
      // Fix malformed location
      this.deliveryPartnerInfo.location.coordinates = {
        type: 'Point',
        coordinates: [0, 0]
      };
      this.deliveryPartnerInfo.location.lastUpdated = new Date();
    }
  }
  next();
});

userSchema.methods.updateEarnings = async function (
  amount: number,
  type: 'pending' | 'available' = 'pending'
): Promise<void> {
  if (this.userType !== 'delivery_partner' || !this.deliveryPartnerInfo) return;

  // Update total and the specified type
  this.deliveryPartnerInfo.earnings.total += amount;
  this.deliveryPartnerInfo.earnings[type] += amount;
  await this.save();
};

// Update delivery partner stats
userSchema.methods.updateDeliveryPartnerStats = async function (
  this: IUser
): Promise<void> {
  if (
    this.userType !== "delivery_partner" ||
    !this.deliveryPartnerInfo?.reviews
  ) {
    return;
  }

  const reviews = this.deliveryPartnerInfo.reviews;
  const totalReviews = reviews.length;

  if (totalReviews > 0) {
    const averageRating =
      reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews;
    this.deliveryPartnerInfo.stats.averageRating = Math.round(averageRating * 10) / 10;
  }

  this.deliveryPartnerInfo.stats.totalReviews = totalReviews;
  await this.save();
};


const userModel: Model<IUser> = mongoose.model("courries-user", userSchema);
export default userModel;