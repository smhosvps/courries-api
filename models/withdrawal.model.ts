// models/Withdrawal.js

import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema({
    deliveryPartner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'courries-user',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    remarks: {
        type: String,
        default: ''
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'courries-user'
    },
    processedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes
withdrawalSchema.index({ deliveryPartner: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });



const withdrawalModel = mongoose.model(
    "courries-Withdrawal",
    withdrawalSchema
);

export default withdrawalModel;


