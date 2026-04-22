// controllers/report.controller.ts
import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import ReportModel, { IReport } from "../models/report.model";
import cloudinary from "cloudinary";
import Notification from "../models/notificationModel";
import userModel from "../models/user_model";
import { Delivery } from "../models/Delivery";

// Helper function to create notification
const createReportNotification = async (
  recipientId: string,
  type: string,
  content: string,
  status?: string
) => {
  try {
    await Notification.create({
      recipient: recipientId,
      type,
      content,
      status: status || "unread",
      read: false,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Helper function to format user name
const formatUserName = (user: any): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.name || user.email || "User";
};

// Helper function to format delivery details
const formatDeliveryDetails = (delivery: any): string => {
  if (!delivery) return "Unknown Delivery";
  
  const pickupLocation = delivery.pickup?.address || "Unknown pickup";
  const deliveryLocation = delivery.delivery?.address || "Unknown destination";
  
  return `Delivery #${delivery.deliveryCode || delivery._id?.toString().slice(-6)} from ${pickupLocation} to ${deliveryLocation}`;
};

// Create report
export const createReport = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deliveryId, deliveryType, description, images, issueType } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    // Get user details for notification
    const user = await userModel.findById(userId).select("firstName lastName email name");
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Find delivery with populated fields
    const delivery = await Delivery.findById(deliveryId)
      .populate("customer", "firstName lastName email name")
      .populate("deliveryPartner", "firstName lastName email name");

    if (!delivery) {
      return next(new ErrorHandler("Delivery not found", 404));
    }

    // Upload images to cloudinary if any
    let uploadedImages: string[] = [];
    if (images && images.length > 0) {
      const uploadPromises = images.map(async (image: string) => {
        const result = await cloudinary.v2.uploader.upload(image, {
          folder: "reports",
          resource_type: "image",
        });
        return result.secure_url;
      });
      uploadedImages = await Promise.all(uploadPromises);
    }

    const newReport: IReport = new ReportModel({
      userId,
      deliveryId,
      deliveryType,
      description,
      issueType,
      images: uploadedImages,
      status: "pending",
    });

    const savedReport = await newReport.save();

    // Format user name
    const userName = formatUserName(user);
    
    // Format delivery details
    const deliveryDetails = formatDeliveryDetails(delivery);

    // Create notification for user about report creation
    await createReportNotification(
      userId.toString(),
      "report_created",
      `Your report for ${deliveryDetails} has been submitted successfully and is pending review. We'll notify you once it's processed.`,
      "pending"
    );

    // Optional: Create notification for admins (you can implement this based on your admin notification system)
    // This would require fetching all admin users and sending notifications

    res.status(201).json({
      success: true,
      message: "Report created successfully",
      report: {
        ...savedReport.toObject(),
        userDetails: {
          id: user._id,
          name: userName,
          email: user.email,
        },
        deliveryDetails: {
          id: delivery._id,
          code: delivery.deliveryCode,
          pickup: delivery.pickup,
          delivery: delivery.delivery,
          customer: delivery.customer ? {
            name: formatUserName(delivery.customer),
            email: delivery.customer.email,
          } : null,
          deliveryPartner: delivery.deliveryPartner ? {
            name: formatUserName(delivery.deliveryPartner),
            email: delivery.deliveryPartner.email,
          } : null,
        },
      },
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all reports (admin) - with enhanced delivery info
export const getAllReportsAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reports = await ReportModel.find()
      .populate("userId", "name email firstName lastName phone avatar")
      .populate("resolvedBy", "name email firstName lastName")
      .lean();

    // Fetch delivery details for each report
    const reportsWithDetails = await Promise.all(
      reports.map(async (report) => {
        const delivery = await Delivery.findById(report.deliveryId)
          .populate("customer", "firstName lastName email name phone")
          .populate("deliveryPartner", "firstName lastName email name phone")
          .lean();

        return {
          ...report,
          userDetails: report.userId ? {
            id: report.userId._id,
            name: formatUserName(report.userId),
            email: report.userId.email,
            phone: report.userId.phone,
          } : null,
          deliveryDetails: delivery ? {
            id: delivery._id,
            code: delivery.deliveryCode,
            status: delivery.status,
            pickup: delivery.pickup,
            delivery: delivery.delivery,
            package: delivery.package,
            customer: delivery.customer ? {
              id: delivery.customer._id,
              name: formatUserName(delivery.customer),
              email: delivery.customer.email,
              phone: delivery.customer.phone,
            } : null,
            deliveryPartner: delivery.deliveryPartner ? {
              id: delivery.deliveryPartner._id,
              name: formatUserName(delivery.deliveryPartner),
              email: delivery.deliveryPartner.email,
              phone: delivery.deliveryPartner.phone,
            } : null,
            price: delivery.totalAmount,
            createdAt: delivery.createdAt,
          } : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      reports: reportsWithDetails.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get user's reports with delivery details
export const getUserReports = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    
    const reports = await ReportModel.find({ userId })
      .populate("resolvedBy", "name email firstName lastName")
      .lean();

    // Fetch delivery details for each report
    const reportsWithDetails = await Promise.all(
      reports.map(async (report) => {
        const delivery = await Delivery.findById(report.deliveryId)
          .populate("customer", "firstName lastName email name")
          .populate("deliveryPartner", "firstName lastName email name")
          .lean();

        return {
          ...report,
          deliveryDetails: delivery ? {
            id: delivery._id,
            code: delivery.deliveryCode,
            status: delivery.status,
            pickup: delivery.pickup,
            delivery: delivery.delivery,
            package: delivery.package,
            price: delivery.totalAmount,
            createdAt: delivery.createdAt,
          } : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      reports: reportsWithDetails.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get single report with full details
export const getReportById = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const report = await ReportModel.findById(id)
      .populate("userId", "name email firstName lastName phone avatar")
      .populate("resolvedBy", "name email firstName lastName")
      .lean();

    if (!report) {
      return next(new ErrorHandler("Report not found", 404));
    }

    // Fetch delivery details
    const delivery = await Delivery.findById(report.deliveryId)
      .populate("customer", "firstName lastName email name phone")
      .populate("deliveryPartner", "firstName lastName email name phone")
      .lean();

    const reportWithDetails = {
      ...report,
      userDetails: report.userId ? {
        id: report.userId._id,
        name: formatUserName(report.userId),
        email: report.userId.email,
        phone: report.userId.phone,
        avatar: (report.userId as any).avatar,
      } : null,
      deliveryDetails: delivery ? {
        id: delivery._id,
        code: delivery.deliveryCode,
        status: delivery.status,
        pickup: delivery.pickup,
        delivery: delivery.delivery,
        package: delivery.package,
        timeline: delivery.timeline,
        customer: delivery.customer ? {
          id: delivery.customer._id,
          name: formatUserName(delivery.customer),
          email: delivery.customer.email,
          phone: delivery.customer.phone,
        } : null,
        deliveryPartner: delivery.deliveryPartner ? {
          id: delivery.deliveryPartner._id,
          name: formatUserName(delivery.deliveryPartner),
          email: delivery.deliveryPartner.email,
          phone: delivery.deliveryPartner.phone,
        } : null,
        price: delivery.totalAmount,
        basePrice: delivery.basePrice,
        distance: delivery.distance,
        estimatedDuration: delivery.estimatedDuration,
        actualDuration: delivery.actualDuration,
        paymentStatus: delivery.paymentStatus,
        paymentMethod: delivery.paymentMethod,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      } : null,
    };

    res.status(200).json({
      success: true,
      report: reportWithDetails,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update report status (admin)
export const updateReportStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, resolvedNote, adminNote } = req.body;
    const adminId = req.user?._id;

    // Get admin details
    const admin = await userModel.findById(adminId).select("firstName lastName email name");
    if (!admin) {
      return next(new ErrorHandler("Admin not found", 404));
    }

    const report = await ReportModel.findById(id).populate("userId", "firstName lastName email name");
    if (!report) {
      return next(new ErrorHandler("Report not found", 404));
    }

    // Get delivery details for notification
    const delivery = await Delivery.findById(report.deliveryId).lean();

    const previousStatus = report.status;
    const updateData: Partial<IReport> = {
      status,
      adminNote,
      resolvedBy: adminId,
    };

    if (status === "resolved" || status === "rejected") {
      updateData.resolvedNote = resolvedNote;
      updateData.resolvedAt = new Date();
    }

    const updatedReport = await ReportModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("userId", "name email firstName lastName")
      .populate("resolvedBy", "name email firstName lastName")
      .lean();

    // Format admin name for notification
    const adminName = formatUserName(admin);
    
    // Format delivery details
    const deliveryDetails = delivery ? formatDeliveryDetails(delivery) : `Report #${report._id.toString().slice(-6)}`;

    // Create notification for user based on status change
    let notificationContent = "";
    let notificationType = "";

    switch (status) {
      case "in-progress":
        notificationContent = `Your report for ${deliveryDetails} is now being reviewed by ${adminName}. We'll get back to you soon.`;
        notificationType = "report_in_progress";
        break;
      case "resolved":
        notificationContent = `Good news! Your report for ${deliveryDetails} has been resolved. ${resolvedNote ? `\n\nResolution: ${resolvedNote}` : ""} Thank you for your patience.`;
        notificationType = "report_resolved";
        break;
      case "rejected":
        notificationContent = `Your report for ${deliveryDetails} has been reviewed and cannot be processed at this time. ${resolvedNote ? `\n\nReason: ${resolvedNote}` : ""} Please contact support if you have questions.`;
        notificationType = "report_rejected";
        break;
      default:
        notificationContent = `The status of your report for ${deliveryDetails} has been updated to ${status} by ${adminName}.`;
        notificationType = "report_updated";
    }

    await createReportNotification(
      report.userId._id.toString(),
      notificationType,
      notificationContent,
      status
    );

    // If admin note was added, create a separate notification for that
    if (adminNote) {
      await createReportNotification(
        report.userId._id.toString(),
        "admin_note_added",
        `Admin note on your report for ${deliveryDetails}:\n\n"${adminNote}"`,
        status
      );
    }

    // Fetch updated report with delivery details for response
    const deliveryForResponse = await Delivery.findById(report.deliveryId)
      .populate("customer", "firstName lastName email")
      .populate("deliveryPartner", "firstName lastName email")
      .lean();

    const reportWithDetails = {
      ...updatedReport,
      adminDetails: {
        id: admin._id,
        name: adminName,
        email: admin.email,
      },
      deliveryDetails: deliveryForResponse ? {
        id: deliveryForResponse._id,
        code: deliveryForResponse.deliveryCode,
        pickup: deliveryForResponse.pickup,
        delivery: deliveryForResponse.delivery,
      } : null,
    };

    res.status(200).json({
      success: true,
      message: `Report ${status} successfully`,
      report: reportWithDetails,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete report (admin)
export const deleteReport = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const report = await ReportModel.findById(id).populate("userId", "firstName lastName email name");

    if (!report) {
      return next(new ErrorHandler("Report not found", 404));
    }

    // Prepare delivery details (optional)
    let deliveryDetails = `Report #${report._id.toString().slice(-6)}`;
    try {
      const delivery = await Delivery.findById(report.deliveryId).lean();
      if (delivery) {
        deliveryDetails = formatDeliveryDetails(delivery);
      }
    } catch (err) {
      console.error("Error fetching delivery details:", err);
    }

    // Notify user only if user still exists
    if (report.userId) {
      try {
        await createReportNotification(
          report.userId._id.toString(),
          "report_deleted",
          `Your report for ${deliveryDetails} has been removed from our system by an administrator. If you have any questions, please contact support.`,
          "deleted"
        );
      } catch (notifyErr) {
        console.error("Failed to send notification:", notifyErr);
        // Continue deletion even if notification fails
      }
    } else {
      console.warn(`Report ${report._id} has no associated user; skipping notification.`);
    }

    // Delete images from Cloudinary
    if (report.images && report.images.length > 0) {
      const deletePromises = report.images.map(async (imageUrl) => {
        try {
          const publicId = imageUrl.split("/").pop()?.split(".")[0];
          if (publicId) {
            await cloudinary.v2.uploader.destroy(`reports/${publicId}`);
          }
        } catch (error) {
          console.error("Error deleting image from cloudinary:", error);
        }
      });
      await Promise.all(deletePromises);
    }

    await report.deleteOne();

    res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Upload images to cloudinary (helper endpoint)
export const uploadReportImages = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { images } = req.body;

    if (!images || !Array.isArray(images)) {
      return next(new ErrorHandler("Images array is required", 400));
    }

    const uploadPromises = images.map(async (image: string) => {
      const result = await cloudinary.v2.uploader.upload(image, {
        folder: "reports",
        resource_type: "image",
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    });

    const uploadedImages = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      images: uploadedImages.map(img => img.url),
      imageDetails: uploadedImages,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
