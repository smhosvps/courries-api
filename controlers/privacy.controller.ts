import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import PrivacyModel, { IPrivacy } from "../models/privacy.models";


// upload course 

export const createPrivacy = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, detail } = req.body as IPrivacy
        const newPrivacy: IPrivacy = new PrivacyModel({
            title,
            detail
        });

        const savedPrivacy: IPrivacy = await newPrivacy.save();
        res.status(201).json({
            success: true,
            message: "Privacy has been successfully created",
            savedPrivacy
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500))
    }
})


export const updatePrivacy = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {

        const privacyId: string = req.params.id;
        if (!privacyId) {
            return next(new ErrorHandler("Privacy not found", 404))
        }
        const updatedPrivacyData: Partial<IPrivacy> = req.body;

        const updatedPrivacy: IPrivacy | null = await PrivacyModel.findByIdAndUpdate(
            privacyId,
            updatedPrivacyData,
            { new: true }
        );

        res.status(201).json({
            success: true,
            message: "Privacy has been successfully updated",
            updatedPrivacy
        })

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500))
    }
})


export const getAllPrivacy = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {

        const privacy: IPrivacy | null = await PrivacyModel.findOne().sort({ createdAt: -1 }).limit(1);

        res.status(200).json({
            success: true,
            message: "Privacy has been successfully fetched",
            privacy
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500))
    }
})

export const getAllPrivacyAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privacy: IPrivacy[] = await PrivacyModel.find();
        res.status(200).json({
            success: true,
            message: "Privacy has been successfully fetched",
            privacy
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500))
    }
})


export const deletePrivacy = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const privacy = await PrivacyModel.findById(id)

        if (!privacy) {
            return next(new ErrorHandler("Privacy not found", 404))
        }
        await privacy.deleteOne({ id });
        res.status(200).json({
            success: true,
            message: "Privacy deleted successful",
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }
})

// Get quiz item by ID
export const getPrivacyById = async (req: Request, res: Response): Promise<void> => {
    try {
        const privacyId: string = req.params.id;
        const privacy: IPrivacy | null = await PrivacyModel.findById(privacyId);

        if (!privacy) {
            res.status(404).json({ message: 'Privacy not found' });
            return;
        }

        res.status(200).json(privacy);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



