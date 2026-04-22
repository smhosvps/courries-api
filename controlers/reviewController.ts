import { Request, Response } from "express";
import userModel from "../models/user_model";
import { Delivery } from "../models/Delivery";


// Create a review for a delivery partner
export const createReview = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const { rating, comment, deliveryId, images } = req.body;
    const userId = req.user?.id;

    console.log(userId, "user id")

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (!comment?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    if (comment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 500 characters",
      });
    }

    // Find the delivery partner
    const partner = await userModel.findOne({
      _id: partnerId,
      userType: "delivery_partner",
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Verify the delivery exists and was completed
    const delivery = await Delivery.findOne({
      _id: deliveryId,
      deliveryPartner: partnerId,
      customer: userId,
      status: "delivered",
    });

    if (!delivery) {
      return res.status(403).json({
        success: false,
        message: "You can only review completed deliveries",
      });
    }

    // Check if user has already reviewed this delivery
    const existingReview = partner.deliveryPartnerInfo?.reviews?.find(
      (r) => r.deliveryId.toString() === deliveryId && r.user.toString() === userId
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this delivery",
      });
    }

    // Initialize deliveryPartnerInfo if it doesn't exist
    if (!partner.deliveryPartnerInfo) {
      partner.deliveryPartnerInfo = {} as any;
    }

    // Initialize reviews array if it doesn't exist
    if (!partner.deliveryPartnerInfo.reviews) {
      partner.deliveryPartnerInfo.reviews = [] as any;
    }

    // Create new review
    const newReview = {
      user: userId,
      rating,
      comment,
      deliveryId,
      images: images || [],
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    // Add review to partner's reviews array
    partner.deliveryPartnerInfo.reviews.push(newReview);

    // Update partner stats
    const reviews = partner.deliveryPartnerInfo.reviews;
    const totalReviews = reviews.length;
    const averageRating =
      reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews;

    partner.deliveryPartnerInfo.stats = {
      ...partner.deliveryPartnerInfo.stats,
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalDeliveries: partner.deliveryPartnerInfo.stats?.totalDeliveries || 0,
      completedDeliveries: partner.deliveryPartnerInfo.stats?.completedDeliveries || 0,
      cancelledDeliveries: partner.deliveryPartnerInfo.stats?.cancelledDeliveries || 0,
      acceptanceRate: partner.deliveryPartnerInfo.stats?.acceptanceRate || 100,
    };

    await partner.save();

    res.status(201).json({
      success: true,
      message: "Review added successfully",
      data: {
        review: newReview,
        stats: {
          averageRating: partner.deliveryPartnerInfo.stats.averageRating,
          totalReviews: partner.deliveryPartnerInfo.stats.totalReviews,
        },
      },
    });
  } catch (error: any) {
    console.error("Create review error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create review",
    });
  }
};

// Get all reviews for a delivery partner
export const getPartnerReviews = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sort = (req.query.sort as string) || "latest";

    const partner = await userModel
      .findOne({
        _id: partnerId,
        userType: "delivery_partner",
      })
      .populate({
        path: "deliveryPartnerInfo.reviews.user",
        select: "firstName lastName avatar",
      });

    if (!partner || !partner.deliveryPartnerInfo) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    let reviews = partner.deliveryPartnerInfo.reviews || [];

    // Sort reviews
    switch (sort) {
      case "latest":
        reviews = reviews.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "highest":
        reviews = reviews.sort((a, b) => b.rating - a.rating);
        break;
      case "lowest":
        reviews = reviews.sort((a, b) => a.rating - b.rating);
        break;
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    // Format reviews for response
    const formattedReviews = paginatedReviews.map((review: any) => ({
      id: review._id,
      user: {
        id: review.user?._id,
        name: review.user
          ? `${review.user.firstName} ${review.user.lastName}`
          : "Anonymous",
        avatar: review.user?.avatar?.url,
      },
      rating: review.rating,
      comment: review.comment,
      date: review.createdAt,
      images: review.images || [],
      response: review.response,
    }));

    // Calculate rating distribution
    const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
      rating: star,
      count: reviews.filter((r) => Math.floor(r.rating) === star).length,
    }));

    res.status(200).json({
      success: true,
      data: {
        reviews: formattedReviews,
        stats: {
          averageRating: partner.deliveryPartnerInfo.stats?.averageRating || 0,
          totalReviews: partner.deliveryPartnerInfo.stats?.totalReviews || 0,
          ratingDistribution,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(reviews.length / limit),
          totalItems: reviews.length,
          itemsPerPage: limit,
          hasNextPage: endIndex < reviews.length,
          hasPrevPage: startIndex > 0,
        },
      },
    });
  } catch (error: any) {
    console.error("Get reviews error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get reviews",
    });
  }
};

// Update a review
export const updateReview = async (req: Request, res: Response) => {
  try {
    const { partnerId, reviewId } = req.params;
    const { rating, comment, images } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const partner = await userModel.findOne({
      _id: partnerId,
      userType: "delivery_partner",
    });

    if (!partner || !partner.deliveryPartnerInfo) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Find the review
    const review = partner.deliveryPartnerInfo.reviews?.id(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check if user owns this review
    if (review.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own reviews",
      });
    }

    // Check if review is within editable time (24 hours)
    const reviewAge = Date.now() - new Date(review.createdAt).getTime();
    const hoursSinceReview = reviewAge / (1000 * 60 * 60);

    if (hoursSinceReview > 24) {
      return res.status(400).json({
        success: false,
        message: "Reviews can only be edited within 24 hours of posting",
      });
    }

    // Update review fields
    if (rating) review.rating = rating;
    if (comment) review.comment = comment;
    if (images) review.images = images;
    review.updatedAt = new Date();

    // Update partner stats
    const reviews = partner.deliveryPartnerInfo.reviews;
    const averageRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    partner.deliveryPartnerInfo.stats.averageRating =
      Math.round(averageRating * 10) / 10;

    await partner.save();

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: { review },
    });
  } catch (error: any) {
    console.error("Update review error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update review",
    });
  }
};

// Respond to review (for delivery partner)
export const respondToReview = async (req: Request, res: Response) => {
  try {
    const { partnerId, reviewId } = req.params;
    const { comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if the user is the delivery partner
    if (userId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "Only the delivery partner can respond to reviews",
      });
    }

    const partner = await userModel.findOne({
      _id: partnerId,
      userType: "delivery_partner",
    });

    if (!partner || !partner.deliveryPartnerInfo) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    const review = partner.deliveryPartnerInfo.reviews?.id(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Add or update response
    review.response = {
      comment,
      respondedAt: new Date(),
    };

    await partner.save();

    res.status(200).json({
      success: true,
      message: "Response added successfully",
      data: { response: review.response },
    });
  } catch (error: any) {
    console.error("Respond to review error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add response",
    });
  }
};

// Delete a review
export const deleteReview = async (req: Request, res: Response) => {
  try {
    const { partnerId, reviewId } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.userType === "admin" || req.user?.userType === "super_admin";

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const partner = await userModel.findOne({
      _id: partnerId,
      userType: "delivery_partner",
    });

    if (!partner || !partner.deliveryPartnerInfo) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    // Find the review
    const reviewIndex = partner.deliveryPartnerInfo.reviews?.findIndex(
      (r) => r._id.toString() === reviewId
    );

    if (reviewIndex === -1 || reviewIndex === undefined) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const review = partner.deliveryPartnerInfo.reviews[reviewIndex];

    // Check if user owns this review or is admin
    if (review.user.toString() !== userId && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own reviews",
      });
    }

    // Remove the review
    partner.deliveryPartnerInfo.reviews.splice(reviewIndex, 1);

    // Update partner stats
    const remainingReviews = partner.deliveryPartnerInfo.reviews;
    if (remainingReviews.length > 0) {
      const averageRating =
        remainingReviews.reduce((sum, r) => sum + r.rating, 0) /
        remainingReviews.length;
      partner.deliveryPartnerInfo.stats.averageRating =
        Math.round(averageRating * 10) / 10;
    } else {
      partner.deliveryPartnerInfo.stats.averageRating = 0;
    }
    partner.deliveryPartnerInfo.stats.totalReviews = remainingReviews.length;

    await partner.save();

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete review error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete review",
    });
  }
};