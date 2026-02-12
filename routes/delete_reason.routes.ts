// routes/accountRoutes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import { createDeletionReason, deleteDeletionReason, deleteDeletionReasonByUserId, getAllDeleteRequests, getDeletionReason } from "../controlers/delete_reason.controller";


const deleteReasonRouter = express.Router();

// Create a deletion reason
deleteReasonRouter.post("/add-delete-reason", authenticate, createDeletionReason);

// Get a deletion reason by userId
deleteReasonRouter.get("/get-delete-reason-by-userId/:userId", authenticate, getDeletionReason);


// Get a deletion reason by userId
deleteReasonRouter.get("/get-all-delete-reasons", authenticate, getAllDeleteRequests);


// Delete a deletion reason
deleteReasonRouter.delete("/delete-reason/:userId", authenticate, deleteDeletionReason);

deleteReasonRouter.delete("/reseverse-delete-reason/:userId", authenticate, deleteDeletionReasonByUserId);

export default deleteReasonRouter;
