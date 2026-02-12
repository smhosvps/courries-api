// // src/models/Wallet.ts
// import mongoose, { Schema, Document, Types } from 'mongoose';

// export interface ITransaction {
//   type: 'credit' | 'debit';
//   amount: number;
//   description: string;
//   reference: string;
//   paymentMethod: 'flutterwave' | 'paystack';
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface IWallet {
//   user: Types.ObjectId;
//   balance: number;
//   transactions: ITransaction[];
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface IWalletDocument extends IWallet, Document {}

// const transactionSchema = new Schema(
//   { 
//     type: {
//       type: String,
//       enum: ['credit', 'debit'],
//       required: true,
//     },
//     amount: {
//       type: Number,
//       required: true,
//     },
//     description: {
//       type: String,
//       required: true,
//     },
//     reference: {
//       type: String,
//       required: true,
//       unique: true,
//     },
//     paymentMethod: {
//       type: String,
//       enum: ['flutterwave', 'paystack'],
//       required: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const walletSchema = new Schema<IWalletDocument>(
//   {
//     user: {
//       type: Schema.Types.ObjectId,
//       ref: 'courries-user',
//       required: true, 
//       unique: true,
//     },
//     balance: {
//       type: Number,
//       default: 0,
//       min: 0,
//     },
//     transactions: [transactionSchema],
//   },
//   {
//     timestamps: true,
//   }
// );

// // Add index for faster queries
// walletSchema.index({ user: 1 });
// transactionSchema.index({ reference: 1 }, { unique: true });

// export const Wallet = mongoose.model<IWalletDocument>('Wallet', walletSchema);





// src/models/Wallet.js (or .ts)
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITransaction {
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reference: string;
  paymentMethod: 'paystack' | 'flutterwave' | 'wallet';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWallet {
  user: Types.ObjectId;
  balance: number;
  transactions: ITransaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IWalletDocument extends IWallet, Document {
  hasSufficientBalance(amount: number): boolean;
}

const transactionSchema = new Schema(
  { 
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    reference: {
      type: String,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['paystack', 'flutterwave', 'wallet'],
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const walletSchema = new Schema<IWalletDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'courries-user',
      required: true, 
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactions: [transactionSchema],
  },
  {
    timestamps: true,
  }
);

// Method to check sufficient balance
walletSchema.methods.hasSufficientBalance = function(amount: number): boolean {
  return this.balance >= amount;
};

// Add indexes
walletSchema.index({ user: 1 });
walletSchema.index({ 'transactions.reference': 1 });

export const Wallet = mongoose.model<IWalletDocument>('Wallet', walletSchema);