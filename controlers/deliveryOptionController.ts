import { NextFunction, Request, Response } from 'express';
import deliveryOption, { IDeliveryOption } from '../models/deliveryOption';
import ErrorHandler from '../utils/ErrorHandler';

export const getAllDeliveryOptions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const options = await deliveryOption.find().sort({ createdAt: -1 });
        res.status(200).json(options);
    } catch (error: any) {
        next(new ErrorHandler(error.message, 500));
    }
};

export const createDeliveryOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            title,
            description,
            tag,
            tagColor,
            tagTextColor,
            icon,
            basePrice,
            perKm,
            speed
        } = req.body;

        // Validate required fields
        if (!title || !description || !tag || !tagColor || !tagTextColor || basePrice === undefined || perKm === undefined || speed === undefined) {
            return next(new ErrorHandler('All required fields must be provided', 400));
        }

        const newOption = new deliveryOption({
            title,
            description,
            tag,
            tagColor,
            tagTextColor,
            icon: icon || null,
            basePrice: Number(basePrice),
            perKm: Number(perKm),
            speed: Number(speed)
        });

        const savedOption = await newOption.save();
        res.status(201).json(savedOption);
    } catch (error: any) {
        // Handle duplicate key error specifically
        if (error.code === 11000) {
            // Check which field caused the duplicate key error
            const duplicateField = Object.keys(error.keyPattern)[0];
            return next(new ErrorHandler(`Duplicate value for field: ${duplicateField}`, 400));
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return next(new ErrorHandler(messages.join(', '), 400));
        }
        
        next(new ErrorHandler(error.message, 500));
    }
};

export const updateDeliveryOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Validate MongoDB ID format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return next(new ErrorHandler('Invalid delivery option ID format', 400));
        }

        const updatedOption = await deliveryOption.findByIdAndUpdate(
            id,
            {
                ...req.body,
                // Ensure numeric fields are numbers
                basePrice: req.body.basePrice ? Number(req.body.basePrice) : undefined,
                perKm: req.body.perKm ? Number(req.body.perKm) : undefined,
                speed: req.body.speed ? Number(req.body.speed) : undefined
            },
            { 
                new: true, 
                runValidators: true,
                context: 'query' 
            }
        );

        if (!updatedOption) {
            return next(new ErrorHandler('Delivery option not found', 404));
        }

        res.status(200).json(updatedOption);
    } catch (error: any) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            return next(new ErrorHandler(`Duplicate value for field: ${duplicateField}`, 400));
        }
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return next(new ErrorHandler(messages.join(', '), 400));
        }
        
        next(new ErrorHandler(error.message, 500));
    }
};

export const deleteDeliveryOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Validate MongoDB ID format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return next(new ErrorHandler('Invalid delivery option ID format', 400));
        }

        const deletedOption = await deliveryOption.findByIdAndDelete(id);

        if (!deletedOption) {
            return next(new ErrorHandler('Delivery option not found', 404));
        }

        res.status(200).json({ 
            success: true,
            message: 'Delivery option deleted successfully' 
        });
    } catch (error: any) {
        next(new ErrorHandler(error.message, 500));
    }
};