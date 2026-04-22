// models/PackageType.js
import mongoose from "mongoose";

const packageTypeSchema = new mongoose.Schema({
    value: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    label: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    icon: {
        type: String,
        default: 'cube-outline'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});


export const PackageTypeModel = mongoose.model(
    "courries-packageType",
    packageTypeSchema
);