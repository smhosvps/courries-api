import mongoose, { Schema, Types, Model, Document } from "mongoose";

const DELIVERY_CODE_RETRY_LIMIT = 5;
const DELIVERY_CODE_LENGTH = 5;

function generateDeliveryCode(): string {
  const randomNum = Math.floor(Math.random() * 100000);
  return randomNum.toString().padStart(DELIVERY_CODE_LENGTH, "0");
}

// Main interface for delivery properties
export interface IDelivery {
  customer: Types.ObjectId;
  deliveryPartner?: Types.ObjectId;
  deliveryCode: string;
  deliveryType: "bicycle" | "bike" | "car" | "van";
  package: {
    type: string;
    weight: number;
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
    description: string;
    value?: number;
    images: string[];
  };
  pickup: {
    address: string;
    location: {
      type: "Point";
      coordinates: [number, number];
    };
    contactName: string;
    contactPhone: string;
    instructions?: string;
    scheduledTime?: Date;
  };
  delivery: {
    address: string;
    location: {
      type: "Point";
      coordinates: [number, number];
    };
    contactName: string;
    contactPhone: string;
    instructions?: string;
    scheduledTime?: Date;
  };
  status:
    | "pending"
    | "assigned"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled";
  price?: number;
  distance?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "disputed";
  paymentMethod: "paystack" | "wallet" | "cash";
  reference: string;
  paidAt: Date;
  confirmation: {
    customerConfirmed: boolean;
    partnerConfirmed: boolean;
    customerConfirmationTime?: Date;
    partnerConfirmationTime?: Date;
    confirmationAttempts: number;
    lastConfirmationAttempt?: Date;
    verificationCode?: string;
  };
  timeline: Array<{
    status: string;
    timestamp: Date;
    location?: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Instance methods interface
export interface IDeliveryMethods {
  confirmByCustomer(code: string): Promise<{ success: boolean; message: string }>;
  confirmByPartner(code: string): Promise<{ success: boolean; message: string }>;
  markAsPickedUp(location?: { coordinates: [number, number] }): Promise<void>;
  markAsInTransit(location?: { coordinates: [number, number] }): Promise<void>;
  cancelDelivery(reason: string, cancelledBy: Types.ObjectId): Promise<void>;
  verifyCode(code: string): boolean;
  canBeCancelled(): boolean;
  getProgress(): number;
}

// Static methods interface
export interface DeliveryModel extends Model<IDelivery, {}, IDeliveryMethods> {
  findByDeliveryCode(code: string): Promise<DeliveryDocument>;
}

// Combined document type
export type DeliveryDocument = Document<unknown, {}, IDelivery> & 
  IDelivery & 
  IDeliveryMethods & 
  { _id: Types.ObjectId };

// Location schema for GeoJSON format
const locationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coords: number[]) {
          return (
            coords.length === 2 &&
            typeof coords[0] === "number" &&
            typeof coords[1] === "number" &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: "Coordinates must be [longitude, latitude] with valid ranges",
      },
    },
  },
  { _id: false }
);

const deliverySchema = new Schema<IDelivery, DeliveryModel, IDeliveryMethods>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "courries-user",
      required: true,
    },
    deliveryPartner: {
      type: Schema.Types.ObjectId,
      ref: "courries-user",
    },
    deliveryCode: {
      type: String,
      unique: true,
      minlength: DELIVERY_CODE_LENGTH,
      maxlength: DELIVERY_CODE_LENGTH,
      validate: {
        validator: function (v: string) {
          return /^\d{5}$/.test(v);
        },
        message: "Delivery code must be a 5-digit number",
      },
    },
    deliveryType: {
      type: String,
      enum: ["bicycle", "bike", "car", "van"],
      default: "bike",
    },
    package: {
      type: {
        type: String,
        required: true,
        enum: ["document", "parcel", "food", "electronics", "other"],
      },
      weight: {
        type: Number,
        required: true,
        min: 0,
      },
      dimensions: {
        length: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
      },
      description: {
        type: String,
        required: true,
      },
      value: {
        type: Number,
        min: 0,
      },
      images: [String],
    },
    pickup: {
      address: {
        type: String,
        required: true,
      },
      location: locationSchema,
      contactName: {
        type: String,
        required: true,
      },
      contactPhone: {
        type: String,
        required: true,
      },
      instructions: String,
      scheduledTime: Date,
    },
    delivery: {
      address: {
        type: String,
        required: true,
      },
      location: locationSchema,
      contactName: {
        type: String,
        required: true,
      },
      contactPhone: {
        type: String,
        required: true,
      },
      instructions: String,
      scheduledTime: Date,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    price: {
      type: Number,
      min: 0,
    },
    distance: {
      type: Number,
      min: 0,
    },
    estimatedDuration: {
      type: Number,
      min: 0,
    },
    actualDuration: {
      type: Number,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "disputed"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["wallet", "paystack", "cash"],
      default: "wallet",
    },
    reference: {
      type: String,
      unique: true,
    },
    paidAt: {
      type: Date,
    },
    confirmation: {
      customerConfirmed: {
        type: Boolean,
        default: false,
      },
      partnerConfirmed: {
        type: Boolean,
        default: false,
      },
      customerConfirmationTime: {
        type: Date,
      },
      partnerConfirmationTime: {
        type: Date,
      },
      confirmationAttempts: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      lastConfirmationAttempt: {
        type: Date,
      },
      verificationCode: {
        type: String,
        minlength: 6,
        maxlength: 6,
      },
    },
    timeline: [
      {
        status: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        location: locationSchema,
      },
    ],
    cancellationReason: {
      type: String,
      enum: [
        "customer_request",
        "partner_unavailable",
        "bad_weather",
        "vehicle_issue",
        "address_issue",
        "other",
      ],
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "courries-user",
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook for delivery code
// Pre-save hook for delivery code - SIMPLIFIED FIX
deliverySchema.pre("save", async function (next) {
  if (this.isNew && !this.deliveryCode) {
    let attempts = 0;
    let isUnique = false;
    const DeliveryModel = this.constructor as DeliveryModel;

    while (attempts < DELIVERY_CODE_RETRY_LIMIT && !isUnique) {
      const potentialCode = generateDeliveryCode();

      try {
        const existingDelivery = await DeliveryModel.findOne({
          deliveryCode: potentialCode,
        });

        if (!existingDelivery) {
          this.deliveryCode = potentialCode;
          isUnique = true;
          break;
        }
      } catch (error) {
        console.warn(`Error checking delivery code uniqueness: ${error}`);
      }

      attempts++;
    }

    if (!isUnique) {
      const error = new Error(
        `Failed to generate a unique delivery code after ${DELIVERY_CODE_RETRY_LIMIT} attempts`
      );
      return next(error);
    }
  }

  // Initialize confirmation object for new deliveries
  if (this.isNew) {
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Direct assignment without spread to avoid TypeScript errors
    this.confirmation = {
      customerConfirmed: false,
      partnerConfirmed: false,
      customerConfirmationTime: undefined,
      partnerConfirmationTime: undefined,
      confirmationAttempts: 0,
      lastConfirmationAttempt: undefined,
      verificationCode,
    };
    
    // Initialize timeline
    this.timeline = [
      {
        status: "pending",
        timestamp: new Date(),
      },
    ];
  }

  next();
});

// Method to confirm delivery by customer
deliverySchema.methods.confirmByCustomer = async function (
  code: string
): Promise<{ success: boolean; message: string }> {
  if (this.status !== "in_transit" && this.status !== "picked_up") {
    return { success: false, message: "Delivery is not in a confirmable state" };
  }

  if (this.confirmation.confirmationAttempts >= 5) {
    return { success: false, message: "Too many confirmation attempts. Please contact support." };
  }

  this.confirmation.confirmationAttempts += 1;
  this.confirmation.lastConfirmationAttempt = new Date();

  if (code !== this.deliveryCode) {
    return { success: false, message: "Invalid confirmation code" };
  }

  this.confirmation.customerConfirmed = true;
  this.confirmation.customerConfirmationTime = new Date();

  // If both parties have confirmed, mark as delivered
  if (this.confirmation.customerConfirmed && this.confirmation.partnerConfirmed) {
    this.status = "delivered";
    this.timeline.push({
      status: "delivered",
      timestamp: new Date(),
    });
  }

  await this.save();
  return { success: true, message: "Customer confirmation successful" };
};

// Method to confirm delivery by partner
deliverySchema.methods.confirmByPartner = async function (
  code: string
): Promise<{ success: boolean; message: string }> {
  if (this.status !== "in_transit" && this.status !== "picked_up") {
    return { success: false, message: "Delivery is not in a confirmable state" };
  }

  if (this.confirmation.confirmationAttempts >= 5) {
    return { success: false, message: "Too many confirmation attempts. Please contact support." };
  }

  this.confirmation.confirmationAttempts += 1;
  this.confirmation.lastConfirmationAttempt = new Date();

  if (code !== this.deliveryCode) {
    return { success: false, message: "Invalid confirmation code" };
  }

  this.confirmation.partnerConfirmed = true;
  this.confirmation.partnerConfirmationTime = new Date();

  // If both parties have confirmed, mark as delivered
  if (this.confirmation.customerConfirmed && this.confirmation.partnerConfirmed) {
    this.status = "delivered";
    this.timeline.push({
      status: "delivered",
      timestamp: new Date(),
    });
  }

  await this.save();
  return { success: true, message: "Partner confirmation successful" };
};

// Method to mark as picked up
deliverySchema.methods.markAsPickedUp = async function (
  location?: { coordinates: [number, number] }
): Promise<void> {
  if (this.status !== "assigned") {
    throw new Error("Delivery must be in assigned status to be marked as picked up");
  }

  this.status = "picked_up";
  this.timeline.push({
    status: "picked_up",
    timestamp: new Date(),
    location: location ? {
      type: "Point",
      coordinates: location.coordinates
    } : undefined,
  });

  await this.save();
};

// Method to mark as in transit
deliverySchema.methods.markAsInTransit = async function (
  location?: { coordinates: [number, number] }
): Promise<void> {
  if (this.status !== "picked_up") {
    throw new Error("Delivery must be in picked_up status to be marked as in transit");
  }

  this.status = "in_transit";
  this.timeline.push({
    status: "in_transit",
    timestamp: new Date(),
    location: location ? {
      type: "Point",
      coordinates: location.coordinates
    } : undefined,
  });

  await this.save();
};

// Method to cancel delivery
deliverySchema.methods.cancelDelivery = async function (
  reason: string,
  cancelledBy: Types.ObjectId
): Promise<void> {
  const cancellableStatuses = ["pending", "assigned", "picked_up"];
  
  if (!cancellableStatuses.includes(this.status)) {
    throw new Error(`Delivery cannot be cancelled in ${this.status} status`);
  }

  this.status = "cancelled";
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.timeline.push({
    status: "cancelled",
    timestamp: new Date(),
  });

  await this.save();
};

// Indexes
deliverySchema.index({ customer: 1, createdAt: -1 });
deliverySchema.index({ deliveryPartner: 1, status: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ deliveryCode: 1 });
deliverySchema.index({ "pickup.location": "2dsphere" });
deliverySchema.index({ "delivery.location": "2dsphere" });
deliverySchema.index({ "confirmation.customerConfirmed": 1, "confirmation.partnerConfirmed": 1 });

// Static method for code verification
deliverySchema.statics.findByDeliveryCode = function (code: string) {
  return this.findOne({ deliveryCode: code });
};

// Virtual for delivery duration
deliverySchema.virtual("duration").get(function (this: IDelivery) {
  if (this.actualDuration) return this.actualDuration;
  return this.estimatedDuration;
});

// Instance method to verify delivery code
deliverySchema.methods.verifyCode = function (code: string): boolean {
  return this.deliveryCode === code;
};

// Method to check if delivery can be cancelled
deliverySchema.methods.canBeCancelled = function (): boolean {
  const cancellableStatuses = ["pending", "assigned", "picked_up"];
  return cancellableStatuses.includes(this.status);
};

// Method to calculate delivery progress (0-100%)
deliverySchema.methods.getProgress = function (): number {
  const statusProgress: { [key: string]: number } = {
    pending: 0,
    assigned: 25,
    picked_up: 50,
    in_transit: 75,
    delivered: 100,
    cancelled: 0,
  };
  return statusProgress[this.status] || 0;
};

export const Delivery = mongoose.model<IDelivery, DeliveryModel>(
  "courries-delivery",
  deliverySchema
);