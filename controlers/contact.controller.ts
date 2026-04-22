// controllers/contactSupport.controller.ts
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import ContactSupportModel, { IContactSupport } from "../models/contact.support.model";


// Create contact support info
export const createContactSupport = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, phoneNumbers, description } = req.body as IContactSupport;

    // Check if contact info already exists
    const existingContact = await ContactSupportModel.findOne();
    if (existingContact) {
      return next(
        new ErrorHandler("Contact support information already exists. Use update instead.", 400)
      );
    }

    const newContact: IContactSupport = new ContactSupportModel({
      email,
      phoneNumbers,
      description,
    });

    const savedContact: IContactSupport = await newContact.save();

    res.status(201).json({
      success: true,
      message: "Contact support information has been successfully created",
      contact: savedContact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update contact support info
export const updateContactSupport = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contactId: string = req.params.id;

    if (!contactId) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    const updatedData: Partial<IContactSupport> = req.body;
    const updatedContact: IContactSupport | null =
      await ContactSupportModel.findByIdAndUpdate(contactId, updatedData, {
        new: true,
        runValidators: true,
      });

    if (!updatedContact) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Contact support information has been successfully updated",
      contact: updatedContact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get contact support info (public - active only)
export const getContactSupport = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contact: IContactSupport | null = await ContactSupportModel.findOne({
      isActive: true,
    });

    if (!contact) {
      return next(new ErrorHandler("Contact support information not found", 404));
    }

    // Filter only active phone numbers
    const activePhoneNumbers = contact.phoneNumbers.filter((phone) => phone.isActive);

    res.status(200).json({
      success: true,
      message: "Contact support information has been successfully fetched",
      contact: {
        ...contact.toObject(),
        phoneNumbers: activePhoneNumbers,
      },
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get contact support info for admin
export const getContactSupportAdmin = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contact: IContactSupport | null = await ContactSupportModel.findOne();

    if (!contact) {
      return next(new ErrorHandler("Contact support information not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Contact support information has been successfully fetched",
      contact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Toggle contact status
export const toggleContactStatus = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const contact = await ContactSupportModel.findById(id);

    if (!contact) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    contact.isActive = !contact.isActive;
    await contact.save();

    res.status(200).json({
      success: true,
      message: `Contact support has been ${contact.isActive ? "activated" : "deactivated"} successfully`,
      contact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Toggle phone number status
export const togglePhoneStatus = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { contactId, phoneId } = req.params;
    const contact = await ContactSupportModel.findById(contactId);

    if (!contact) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    const phoneIndex = contact.phoneNumbers.findIndex(
      (phone:any) => phone._id?.toString() === phoneId
    );

    if (phoneIndex === -1) {
      return next(new ErrorHandler("Phone number not found", 404));
    }

    contact.phoneNumbers[phoneIndex].isActive = !contact.phoneNumbers[phoneIndex].isActive;
    await contact.save();

    res.status(200).json({
      success: true,
      message: `Phone number has been ${
        contact.phoneNumbers[phoneIndex].isActive ? "activated" : "deactivated"
      } successfully`,
      contact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Add phone number
export const addPhoneNumber = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { number, label } = req.body;

    const contact = await ContactSupportModel.findById(id);

    if (!contact) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    contact.phoneNumbers.push({
      number,
      label: label || "Support",
      isActive: true,
    });

    await contact.save();

    res.status(201).json({
      success: true,
      message: "Phone number added successfully",
      contact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Remove phone number
export const removePhoneNumber = CatchAsyncError(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { contactId, phoneId } = req.params;

    const contact = await ContactSupportModel.findById(contactId);

    if (!contact) {
      return next(new ErrorHandler("Contact information not found", 404));
    }

    contact.phoneNumbers = contact.phoneNumbers.filter(
      (phone:any) => phone._id?.toString() !== phoneId
    );

    await contact.save();

    res.status(200).json({
      success: true,
      message: "Phone number removed successfully",
      contact,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});