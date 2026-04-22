// controllers/faq.controller.ts
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import FaqModel, { IFaq } from "../models/faq.model";

// Create FAQ
export const createFaq = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, answer, category, order, isActive } = req.body as IFaq;

    const newFaq: IFaq = new FaqModel({
      question,
      answer,
      category,
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    const savedFaq: IFaq = await newFaq.save();

    res.status(201).json({
      success: true,
      message: "FAQ has been successfully created",
      faq: savedFaq,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update FAQ
export const updateFaq = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faqId: string = req.params.id;

    if (!faqId) {
      return next(new ErrorHandler("FAQ not found", 404));
    }

    const updatedFaqData: Partial<IFaq> = req.body;
    const updatedFaq: IFaq | null = await FaqModel.findByIdAndUpdate(
      faqId,
      updatedFaqData,
      { new: true, runValidators: true }
    );

    if (!updatedFaq) {
      return next(new ErrorHandler("FAQ not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "FAQ has been successfully updated",
      faq: updatedFaq,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all FAQs (for public - only active)
export const getAllFaqs = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faqs: IFaq[] = await FaqModel.find({ isActive: true }).sort({ category: 1, order: 1 });

    res.status(200).json({
      success: true,
      message: "FAQs have been successfully fetched",
      faqs,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all FAQs for admin (including inactive)
export const getAllFaqsAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faqs: IFaq[] = await FaqModel.find().sort({ category: 1, order: 1 });

    res.status(200).json({
      success: true,
      message: "FAQs have been successfully fetched",
      faqs,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get FAQ by ID
export const getFaqById = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faqId: string = req.params.id;
    const faq: IFaq | null = await FaqModel.findById(faqId);

    if (!faq) {
      return next(new ErrorHandler("FAQ not found", 404));
    }

    res.status(200).json({
      success: true,
      faq,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete FAQ
export const deleteFaq = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const faq = await FaqModel.findById(id);

    if (!faq) {
      return next(new ErrorHandler("FAQ not found", 404));
    }

    await faq.deleteOne();

    res.status(200).json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Toggle FAQ active status
export const toggleFaqStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const faq = await FaqModel.findById(id);

    if (!faq) {
      return next(new ErrorHandler("FAQ not found", 404));
    }

    faq.isActive = !faq.isActive;
    await faq.save();

    res.status(200).json({
      success: true,
      message: `FAQ has been ${faq.isActive ? "activated" : "deactivated"} successfully`,
      faq,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Reorder FAQs
export const reorderFaqs = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { faqs } = req.body; // Array of { id, order }

    const updatePromises = faqs.map((item: { id: string; order: number }) =>
      FaqModel.findByIdAndUpdate(item.id, { order: item.order }, { new: true })
    );

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: "FAQs reordered successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});