// models/deliveryModel.ts
import mongoose, { Schema, Types, Model, Document } from "mongoose";

const DELIVERY_CODE_RETRY_LIMIT = 5;
const DELIVERY_CODE_LENGTH = 5;
const TRACKING_ID_LENGTH = 10;

function generateDeliveryCode(): string {
  const randomNum = Math.floor(Math.random() * 100000);
  return randomNum.toString().padStart(DELIVERY_CODE_LENGTH, "0");
}

function generateTrackingId(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const timestamp = Date.now().toString(36).toUpperCase();
  let randomPart = "";

  for (let i = 0; i < 6; i++) {
    randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return `COU-${timestamp.slice(-4)}${randomPart}`;
}

export interface IDelivery {
  customer: Types.ObjectId;
  deliveryPartner?: Types.ObjectId;
  offeredPartners?: Types.ObjectId[];
  deliveryCode: string;
  trackingId: string;
  deliveryOption: "send package" | "recieve package";
  deliveryType: "bicycle" | "bike" | "car" | "van";
  package: {
    type: string;
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
    | "request_accepted"
    | "cancelled"
    | "failed_to_assign";
  price?: number;
  distance?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "disputed";
  paymentMethod: "paystack" | "wallet" | "cash";
  reference: string;
  paidAt: Date;
  basePrice: number;
  pricePerKm: number;
  distanceFee: number;
  tax: number;
  serviceFee: number;
  totalAmount: number;
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
    note?: string;
  }>;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeliveryMethods {
  confirmByCustomer(code: string): Promise<{ success: boolean; message: string }>;
  confirmByPartner(code: string): Promise<{ success: boolean; message: string }>;
  markAsPickedUp(location?: { coordinates: [number, number] }): Promise<void>;
  markAsInTransit(location?: { coordinates: [number, number] }): Promise<void>;
  cancelDelivery(reason: string, cancelledBy: Types.ObjectId): Promise<void>;
  unassignByPartner(reason: string, cancelledBy: Types.ObjectId): Promise<void>;
  unassignPartnerAndReset(reason: string, cancelledBy: Types.ObjectId): Promise<void>;
  verifyCode(code: string): boolean;
  canBeCancelled(): boolean;
  getProgress(): number;
}

export interface DeliveryModel extends Model<IDelivery, {}, IDeliveryMethods> {
  findByDeliveryCode(code: string): Promise<DeliveryDocument>;
  findByTrackingId(trackingId: string): Promise<DeliveryDocument>;
}

export type DeliveryDocument = Document<unknown, {}, IDelivery> &
  IDelivery &
  IDeliveryMethods & { _id: Types.ObjectId };

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
    offeredPartners: [{ type: Schema.Types.ObjectId, ref: "courries-user" }],
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
    trackingId: {
      type: String,
      unique: true,
      minlength: TRACKING_ID_LENGTH,
      maxlength: 14,
      validate: {
        validator: function (v: string) {
          return /^COU-[A-Z0-9]{10}$/.test(v);
        },
        message: "Tracking ID must be in format COU-XXXXXXXXXX",
      },
    },
    deliveryType: {
      type: String,
      enum: ["bicycle", "bike", "car", "van"],
      default: "bike",
    },
    deliveryOption: {
      type: String,
      enum: ["send package", "recieve package"],
      default: "send package",
    },
    basePrice: {
      type: Number,
      default: 0,
    },
    pricePerKm: {
      type: Number,
      default: 0,
    },
    distanceFee: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    serviceFee: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    package: {
      type: {
        type: String,
        required: true,
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
        "request_accepted",
        "failed_to_assign",
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
        note: { type: String },
      },
    ],
    cancellationReason: {
      type: String,
      enum: [
        "dispatcher_request",
        "customer_unavailable",
        "customer_request",
        "Dont_like_dispatcher",
        "partner_unavailable",
        "damaged_items",
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

// Pre-save hook for delivery code and tracking ID
deliverySchema.pre("save", async function (next) {
  if (this.isNew) {
    if (!this.deliveryCode) {
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

    if (!this.trackingId) {
      let attempts = 0;
      let isUnique = false;
      const DeliveryModel = this.constructor as DeliveryModel;

      while (attempts < DELIVERY_CODE_RETRY_LIMIT && !isUnique) {
        const potentialTrackingId = generateTrackingId();

        try {
          const existingDelivery = await DeliveryModel.findOne({
            trackingId: potentialTrackingId,
          });

          if (!existingDelivery) {
            this.trackingId = potentialTrackingId;
            isUnique = true;
            break;
          }
        } catch (error) {
          console.warn(`Error checking tracking ID uniqueness: ${error}`);
        }

        attempts++;
      }

      if (!isUnique) {
        const error = new Error(
          `Failed to generate a unique tracking ID after ${DELIVERY_CODE_RETRY_LIMIT} attempts`
        );
        return next(error);
      }
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    this.confirmation = {
      customerConfirmed: false,
      partnerConfirmed: false,
      customerConfirmationTime: undefined,
      partnerConfirmationTime: undefined,
      confirmationAttempts: 0,
      lastConfirmationAttempt: undefined,
      verificationCode,
    };

    this.timeline = [
      {
        status: "pending",
        timestamp: new Date(),
        note: "",
      },
    ];
  }

  next();
});

// ---------- Instance Methods ----------

deliverySchema.methods.confirmByPartner = async function (
  code: string
): Promise<{ success: boolean; message: string }> {
  if (this.status !== "in_transit" && this.status !== "picked_up") {
    return { success: false, message: "Delivery is not in a confirmable state" };
  }

  if (this.confirmation.confirmationAttempts >= 5) {
    return {
      success: false,
      message: "Too many confirmation attempts. Please contact support.",
    };
  }

  this.confirmation.confirmationAttempts += 1;
  this.confirmation.lastConfirmationAttempt = new Date();

  if (code !== this.deliveryCode) {
    return { success: false, message: "Invalid confirmation code" };
  }

  this.confirmation.partnerConfirmed = true;
  this.confirmation.partnerConfirmationTime = new Date();

  this.status = "delivered";
  this.timeline.push({
    status: "delivered",
    timestamp: new Date(),
  });

  await this.save();
  return { success: true, message: "Delivery completed successfully!" };
};

deliverySchema.methods.markAsPickedUp = async function (
  location?: { coordinates: [number, number] }
): Promise<void> {
  if (this.status !== "request_accepted") {
    throw new Error("Delivery must be accepted to be marked as picked up");
  }

  this.status = "picked_up";
  this.timeline.push({
    status: "picked_up",
    timestamp: new Date(),
    location: location
      ? {
          type: "Point",
          coordinates: location.coordinates,
        }
      : undefined,
  });

  await this.save();
};

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
    location: location
      ? {
          type: "Point",
          coordinates: location.coordinates,
        }
      : undefined,
  });

  await this.save();
};

// Customer or admin cancellation – sets status to "cancelled"
deliverySchema.methods.cancelDelivery = async function (
  reason: string,
  cancelledBy: Types.ObjectId
) {
  const cancellableStatuses = ["pending", "assigned", "picked_up", "request_accepted"];
  if (!cancellableStatuses.includes(this.status)) {
    throw new Error(`Delivery cannot be cancelled in ${this.status} status`);
  }
  this.status = "cancelled";
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.timeline.push({ status: "cancelled", timestamp: new Date() });
  await this.save();
};

// Partner rejection BEFORE accepting (status = "assigned")
// Unassigns partner and moves delivery back to "pending"
deliverySchema.methods.unassignByPartner = async function (
  reason: string,
  cancelledBy: Types.ObjectId
) {
  if (this.status !== "assigned") {
    throw new Error(`Partner can only unassign from 'assigned' status, current: ${this.status}`);
  }
  if (!this.deliveryPartner) {
    throw new Error("No partner assigned to this delivery");
  }
  if (this.deliveryPartner.toString() !== cancelledBy.toString()) {
    throw new Error("Only the assigned partner can unassign themselves");
  }

  this.status = "pending";
  this.deliveryPartner = undefined;
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;

  this.timeline.push({
    status: "partner_rejected",
    timestamp: new Date(),
    note: reason,
  });
  this.timeline.push({
    status: "pending",
    timestamp: new Date(),
    note: "Delivery reassigned to pending queue",
  });

  await this.save();
};

// Partner cancellation AFTER acceptance (status = request_accepted, picked_up, in_transit)
// Sets status to "pending" (not cancelled) and removes partner – allows reassignment
deliverySchema.methods.unassignPartnerAndReset = async function (
  reason: string,
  cancelledBy: Types.ObjectId
) {
  const allowedStatuses = ["assigned", "request_accepted", "picked_up", "in_transit"];
  if (!allowedStatuses.includes(this.status)) {
    throw new Error(`Cannot unassign partner in '${this.status}' status`);
  }

  this.status = "pending";
  this.deliveryPartner = undefined;
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;

  this.timeline.push({
    status: "partner_cancelled",
    timestamp: new Date(),
    note: reason,
  });
  this.timeline.push({
    status: "pending",
    timestamp: new Date(),
    note: "Delivery moved back to pending queue for reassignment",
  });

  await this.save();
};

deliverySchema.methods.verifyCode = function (code: string): boolean {
  return this.deliveryCode === code;
};

deliverySchema.methods.canBeCancelled = function (): boolean {
  const cancellableStatuses = ["pending", "assigned", "picked_up", "request_accepted"];
  return cancellableStatuses.includes(this.status);
};

deliverySchema.methods.getProgress = function (): number {
  const statusProgress: { [key: string]: number } = {
    pending: 0,
    assigned: 25,
    picked_up: 50,
    in_transit: 75,
    delivered: 100,
    cancelled: 0,
    request_accepted: 25,
    failed_to_assign: 0,
  };
  return statusProgress[this.status] || 0;
};

// ---------- Static Methods ----------
deliverySchema.statics.findByDeliveryCode = function (code: string) {
  return this.findOne({ deliveryCode: code });
};

deliverySchema.statics.findByTrackingId = function (trackingId: string) {
  return this.findOne({ trackingId: trackingId });
};

// Indexes
deliverySchema.index({ customer: 1, createdAt: -1 });
deliverySchema.index({ deliveryPartner: 1, status: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ deliveryCode: 1 });
deliverySchema.index({ trackingId: 1 });
deliverySchema.index({ "pickup.location": "2dsphere" });
deliverySchema.index({ "delivery.location": "2dsphere" });
deliverySchema.index({ "confirmation.partnerConfirmed": 1 });

// Virtuals
deliverySchema.virtual("duration").get(function (this: IDelivery) {
  if (this.actualDuration) return this.actualDuration;
  return this.estimatedDuration;
});

export const Delivery = mongoose.model<IDelivery, DeliveryModel>(
  "courries-delivery",
  deliverySchema
);