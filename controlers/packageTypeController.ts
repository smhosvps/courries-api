import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { PackageTypeModel } from "../models/PackageType";

// controllers/packageTypeController.js

// Get all package types


export const getAllPackageTypes = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const packageTypes = await PackageTypeModel.find({ isActive: true })
            .select('value label description icon')
            .sort({ label: 1 });

        res.status(200).json({
            success: true,
            data: packageTypes
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error fetching package types',
            error: error.message
        });
    }
});

// Get all package types (admin - includes inactive)
export const getAllPackageTypesAdmin = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {

    try {
        const packageTypes = await PackageTypeModel.find()
            .populate('createdBy', 'firstName lastName email')
            .populate('updatedBy', 'firstName lastName email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: packageTypes
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error fetching package types',
            error: error.message
        });
    }
});

// Get single package type

export const getPackageType = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const packageType = await PackageTypeModel.findById(req.params.id);

        if (!packageType) {
            return res.status(404).json({
                success: false,
                message: 'Package type not found'
            });
        }

        res.status(200).json({
            success: true,
            data: packageType
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error fetching package type',
            error: error.message
        });
    }
});

// Create package type

export const createPackageType = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { value, label, description, icon } = req.body;

        // Check if package type with same value exists
        const existingType = await PackageTypeModel.findOne({ value: value.toLowerCase() });
        if (existingType) {
            return res.status(400).json({
                success: false,
                message: 'Package type with this value already exists'
            });
        }

        const packageType = new PackageTypeModel({
            value: value.toLowerCase(),
            label,
            description,
            icon: icon || 'cube-outline',
        });

        await packageType.save();

        res.status(201).json({
            success: true,
            message: 'Package type created successfully',
            data: packageType
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error creating package type',
            error: error.message
        });
    }
});

// Update package type

export const updatePackageType = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { label, description, icon, isActive } = req.body;

        const packageType = await PackageTypeModel.findById(req.params.id);

        if (!packageType) {
            return res.status(404).json({
                success: false,
                message: 'Package type not found'
            });
        }

        // Update fields
        if (label) packageType.label = label;
        if (description !== undefined) packageType.description = description;
        if (icon) packageType.icon = icon;
        if (isActive !== undefined) packageType.isActive = isActive;

        await packageType.save();

        res.status(200).json({
            success: true,
            message: 'Package type updated successfully',
            data: packageType
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error updating package type',
            error: error.message
        });
    }
});

// Delete package type (soft delete)
export const deletePackageType = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const packageType = await PackageTypeModel.findById(req.params.id);

        if (!packageType) {
            return res.status(404).json({
                success: false,
                message: 'Package type not found'
            });
        }

        // Soft delete - just mark as inactive
        packageType.isActive = false;
        await packageType.save();

        res.status(200).json({
            success: true,
            message: 'Package type deleted successfully'
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error deleting package type',
            error: error.message
        });
    }
});

// Hard delete (admin only)
export const hardDeletePackageType = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const packageType = await PackageTypeModel.findByIdAndDelete(req.params.id);

        if (!packageType) {
            return res.status(404).json({
                success: false,
                message: 'Package type not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Package type permanently deleted'
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Error deleting package type',
            error: error.message
        });
    }
});

// Seed default package types
export const seedDefaultPackageTypes = CatchAsyncError(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {

    try {
        const defaultTypes = [
            { value: 'document', label: 'Document', icon: 'document-text-outline', description: 'Papers, documents, files' },
            { value: 'food', label: 'Food', icon: 'restaurant-outline', description: 'Food items, groceries, meals' },
            { value: 'clothes', label: 'Clothes', icon: 'shirt-outline', description: 'Clothing, fabrics, textiles' },
            { value: 'books', label: 'Books', icon: 'book-outline', description: 'Books, magazines, notebooks' },
            { value: 'medicine', label: 'Medicine', icon: 'medkit-outline', description: 'Medications, medical supplies' },
            { value: 'electronics', label: 'Electronics', icon: 'hardware-chip-outline', description: 'Electronic devices, gadgets' },
            { value: 'other', label: 'Other', icon: 'cube-outline', description: 'Other items not listed' }
        ];

        let created = 0;
        let skipped = 0;

        for (const type of defaultTypes) {
            const existing = await PackageTypeModel.findOne({ value: type.value });
            if (!existing) {
                await PackageTypeModel.create({
                    ...type,
                });
                created++;
            } else {
                skipped++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Default package types seeded: ${created} created, ${skipped} skipped`
        });
    } catch (error:any) {
        res.status(500).json({
            success: false,
            message: 'Error seeding package types',
            error: error.message
        });
    }
});