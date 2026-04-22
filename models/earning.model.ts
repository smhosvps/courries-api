// models/Earning.js

import mongoose from "mongoose";


const earningSchema = new mongoose.Schema({
    delivery: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'courries-delivery',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'courries-user',
    },
    type: {
        type: String,
        enum: ['admin', 'delivery'],
        required: true
    },
    amount: { 
        type: Number,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient queries
earningSchema.index({ delivery: 1, type: 1 }, { unique: true });
earningSchema.index({ recipient: 1, createdAt: -1 });


const earningModel = mongoose.model(
    "courries-earning",
    earningSchema
);

export default earningModel;

