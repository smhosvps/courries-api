import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import userModel from "../models/user_model";
import DeletionReasonModel from "../models/delete_reason";

// Create a deletion reason
export const createDeletionReason = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, reason } = req.body;
    // Check if reason already exists for this user
    const existingUser = await userModel.findOne({ userId });
    if (existingUser) {
      return res.status(400).json({ message: "User not found" });
    }

    const deletionReason = new DeletionReasonModel({
      // Use the Model here
      userId,
      reason,
    });

    await deletionReason.save();
    res.status(201).json(deletionReason);
  }
);

// Get a deletion reason by userId
export const getDeletionReason = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const deletionReason = await DeletionReasonModel.findOne({ userId });

    if (!deletionReason) {
      return res.status(404).json({ message: "Deletion reason not found" });
    }

    res.status(200).json(deletionReason); // Use 200 for successful GET
  }
);

export const getAllDeleteRequests = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deletionReason = await DeletionReasonModel.find().sort({ createdAt: -1 });
      res.status(200).json({ success: true, data: deletionReason});
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: "Failed to fetch altar calls",
          error: error.message,
        });
    }
  }
);

// Delete a deletion reason
export const deleteDeletionReason = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const deletionReason = await DeletionReasonModel.findOneAndDelete({
      userId,
    });

    if (!deletionReason) {
      return res.status(404).json({ message: "Deletion reason not found" });
    }

    res.status(200).json({ message: "Deletion reason removed successfully" }); // Use 200 for successful DELETE
  }
);

// delete reasdon based on user Id

export const deleteDeletionReasonByUserId = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID provided",
        });
      }

      const result = await DeletionReasonModel.deleteOne({ userId });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "No deletion reason found for this user",
        });
      }

      res.status(200).json({
        success: true,
        message: "Deletion reason removed successfully",
      });
    } catch (error) {
      console.error("Error deleting deletion reason:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting deletion reason",
        error: error.message,
      });
    }
  }
);




