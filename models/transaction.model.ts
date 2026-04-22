import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true },
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'courries-user', required: true },
        status: {
            type: String,
            enum: ['pending', 'success', 'failed'],
            default: 'pending',
        },
        reference: { type: String, unique: true }, // your internal reference
        paystackTransferReference: { type: String },
        initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'courries-user' }, // admin who initiated
    },
    { timestamps: true }
);

export default mongoose.model('courries-transaction', transactionSchema);

export const transactionModel = mongoose.model(
    'courries-transaction', transactionSchema
);