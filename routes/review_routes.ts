import express from "express";
import { createReview, deleteReview, getPartnerReviews, respondToReview, updateReview } from "../controlers/reviewController";
import { authenticate, authorize } from "../middleware/auth";


const reviewsRouter = express.Router({ mergeParams: true });


// Get all reviews for a partner
reviewsRouter.get("/partners/:partnerId/reviews", getPartnerReviews);

// Create a review (customers only)
reviewsRouter.post(
    "/partners/:partnerId/reviews",
    authenticate,
    createReview
);

// Update a review (review owner only)
reviewsRouter.put(
    "/partners/:partnerId/reviews/:reviewId",
    authenticate,
    updateReview
);

// Respond to a review (delivery partner only)
reviewsRouter.post(
    "/partners/:partnerId/reviews/:reviewId/respond",
    authorize("delivery_partner"),
    authenticate,
    respondToReview
);

// Delete a review (owner or admin)
reviewsRouter.delete(
    "/partners/:partnerId/reviews/:reviewId",
    deleteReview
);

export default reviewsRouter;