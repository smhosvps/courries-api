import { CatchAsyncError } from "./../middleware/catchAsyncErrors";
import { NextFunction, Request, Response } from "express";
import * as dotenv from "dotenv";
import ErrorHandler from "../utils/ErrorHandler";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendMail";
import { differenceInYears } from "date-fns";
import {
  getAllUsersService,
  getUserByIdC,
  updateUsersRoleService,
} from "../services/user.service";
import cron from "node-cron";
import cloudinary from "cloudinary";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateOTP } from "../utils/otpUtils";
import { createToken } from "../utils/createToken";
import userModel from "../models/user_model";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet";
import Notification from "../models/notificationModel";
import { fileURLToPath } from "url";
import appleAuthService from "../services/appleAuth.service";
import { OAuth2Client } from "google-auth-library";
import csv from "csv-parser";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const TOKEN_EXPIRY = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

const setTokenCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    expires: new Date(Date.now() + TOKEN_EXPIRY),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
};

// check if user available api.
export const checkUserExists = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    console.log(email, "hfhfh");

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Please provide email",
      });
      return;
    }

    const query = { email };

    const user = await userModel
      .findOne(query)
      .select("email firstName isVerified userType");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
        data: { exists: false },
      });
      return;
    }

    // Reject if the user is not a delivery partner (rider)
    if (user.userType !== "delivery_partner") {
      res.status(403).json({
        success: false,
        message:
          "This account is not a rider account. Please use the customer app.",
        data: { exists: true, userType: user.userType },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User found",
      data: {
        exists: true,
        user: {
          email: user.email,
          firstName: user.firstName,
          isVerified: user.isVerified,
          userType: user.userType,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const checkUserExistsUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    console.log(email, "hfhfh");

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Please provide email",
      });
      return;
    }

    const query = { email };

    const user = await userModel
      .findOne(query)
      .select("email firstName isVerified userType");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
        data: { exists: false },
      });
      return;
    }

    // Reject if the user is not a customer (user)
    if (user.userType !== "customer") {
      res.status(403).json({
        success: false,
        message:
          "This account is not a user account. Please use the rider app.",
        data: { exists: true, userType: user.userType },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User found",
      data: {
        exists: true,
        user: {
          email: user.email,
          firstName: user.firstName,
          isVerified: user.isVerified,
          userType: user.userType,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteUser2 = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = await userModel.findById(id);

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }
      await user.deleteOne({ id });
      res.status(200).json({
        success: true,
        message: "User deleted successful",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user: any = await userModel.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res
        .status(401)
        .json({ message: "Please verify your account before logging in" });
    }

    // Authorize allowed roles
    const allowedRoles = ["customer"];
    if (!allowedRoles.includes(user.userType)) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not authorized to access this platform. Please contact your administrator.",
      });
    }

    const token = createToken(user._id);

    // Remove password before sending response
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;

    setTokenCookie(res, token);
    res.status(200).json({
      success: true,
      token,
      message:
        user.userType === "delivery_partner" &&
        user.deliveryPartnerInfo?.verificationStatus?.submitted === false
          ? "Please complete your verification details to start delivering."
          : "Login successful",
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};







// Updated API endpoint - now using object instead of array
export const pushNotificationPlayerId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { playerId, deviceType } = req.body;
    const userId = req.user.id; // Assuming you have auth middleware

    if (!playerId || !deviceType) {
      return res
        .status(400)
        .json({ error: "playerId and deviceType are required" });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update or create the onesignalPlayerId object
    user.onesignalPlayerId = {
      playerId,
      deviceType,
      lastActive: new Date(),
    };

    await user.save();

    res.json({
      success: true,
      message: "Push token updated successfully",
      data: user.onesignalPlayerId,
    });
  } catch (error: any) {
    console.error("Error updating push token:", error);
    res.status(500).json({ error: error.message });
  }
};















export const addUserBySuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      userType,
      dateOfBirth,
      gender,
      adminRiders,
    } = req.body;

    // Trim all string fields to remove whitespace
    const trimmedData = {
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      email: email?.trim().toLowerCase(), // Convert to lowercase for consistency
      password: password, // Don't trim password (preserve exact characters)
      phone: phone?.trim(),
      userType: userType?.trim(),
      adminRiders: adminRiders?.trim(),
      dateOfBirth,
      gender: gender?.trim(),
    };

    // Validate required fields
    const requiredFields = {
      firstName: trimmedData.firstName,
      lastName: trimmedData.lastName,
      email: trimmedData.email,
      password: trimmedData.password,
      phone: trimmedData.phone,
      userType: trimmedData.userType,
      dateOfBirth: trimmedData.dateOfBirth,
      gender: trimmedData.gender,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({
          message: `${field.replace(/_/g, " ")} is required`,
          success: false,
        });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedData.email)) {
      return res.status(400).json({
        message: "Invalid email format",
        success: false,
      });
    }

    // Validate role (prevent Super Admin registration)
    const allowedRoles = [
      "customer",
      "delivery_partner",
      "admin",
      "super admin",
    ];
    if (!allowedRoles.includes(trimmedData.userType)) {
      return res.status(400).json({
        message:
          "Invalid role selection. Allowed roles: customer, delivery_partner, admin",
        success: false,
      });
    }

    // Validate date of birth (must be at least 18 years old)
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 18) {
      return res.status(400).json({
        message: "User must be at least 18 years old",
        success: false,
      });
    }

    // Check if user already exists by email (case-insensitive)
    const existingUser = await userModel.findOne({
      email: { $regex: new RegExp(`^${trimmedData.email}$`, "i") },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user with this email address already exists.",
        success: false,
      });
    }

    // Check if phone number already exists
    const existingPhone = await userModel.findOne({ phone: trimmedData.phone });
    if (existingPhone) {
      return res.status(400).json({
        message: "A user with this phone number already exists.",
        success: false,
      });
    }

    // Create user with trimmed data
    const user = await userModel.create({
      firstName: trimmedData.firstName,
      lastName: trimmedData.lastName,
      email: trimmedData.email,
      password: trimmedData.password,
      phone: trimmedData.phone,
      userType: trimmedData.userType,
      adminRiders: trimmedData.adminRiders || null, // Handle empty adminRiders
      dateOfBirth,
      gender: trimmedData.gender,
      isVerified: true,
      authProvider: "local",
    });

    // Prepare data for email
    const emailData = {
      user: {
        name: `${trimmedData.firstName} ${trimmedData.lastName}`,
        firstName: trimmedData.firstName,
        lastName: trimmedData.lastName,
        email: trimmedData.email,
        role: trimmedData.userType,
        phone: trimmedData.phone,
        adminRiders: trimmedData.adminRiders || null,
      },
      loginCredentials: {
        email: trimmedData.email,
        password: trimmedData.password, // Send original password
      },
      systemName: "Courries",
      loginUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/login`,
      supportEmail: process.env.SUPPORT_EMAIL || "support@courries.com",
      currentYear: new Date().getFullYear(),
    };

    // Send welcome email with credentials
    try {
      await sendEmail({
        email: trimmedData.email,
        subject: "Welcome to Courries - Your Account Details",
        template: "confirmationEmail.ejs",
        data: emailData,
      });
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      // Don't fail the user creation if email fails
    }

    // Remove sensitive data before sending response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    res.status(201).json({
      success: true,
      message:
        "User created successfully. Login credentials have been sent to their email.",
      user: userResponse,
    });
  } catch (error: any) {
    console.error("Error creating user:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(
        (err: any) => err.message
      );
      return res.status(400).json({
        message: messages.join(", "),
        success: false,
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        message: `${field} already exists`,
        success: false,
      });
    }

    res.status(500).json({
      message: "Server error while creating user",
      success: false,
    });
  }
};

export const uploadUsersFromCSV = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No CSV file uploaded",
        success: false,
      });
    }

    const results: any[] = [];
    const errors: any[] = [];
    const successfulUsers: any[] = [];
    const skippedUsers: any[] = [];

    // Convert buffer to readable stream
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    // Parse CSV
    await new Promise((resolve, reject) => {
      bufferStream
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", resolve)
        .on("error", reject);
    });

    // Process each row
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNumber = i + 2; // +2 because 1-based index + header row

      try {
        // Extract and trim data
        const userData = {
          firstName: row["firstName"]?.trim() || row["First Name"]?.trim(),
          lastName: row["lastName"]?.trim() || row["Last Name"]?.trim(),
          email: (
            row["email"]?.trim() ||
            row["Email"]?.trim() ||
            ""
          ).toLowerCase(),
          password:
            row["password"]?.trim() ||
            row["Password"]?.trim() ||
            generateTemporaryPassword(),
          phone:
            row["phone"]?.trim() ||
            row["Phone"]?.trim() ||
            row["phone"]?.trim(),
          userType: row["userType"]?.trim() || row["Role"]?.trim(),
          dateOfBirth:
            row["dateOfBirth"]?.trim() || row["Date of Birth"]?.trim(),
          gender: row["gender"]?.trim() || row["Gender"]?.trim(),
          adminRiders: row["adminRiders"]?.trim() || row["adminRiders"]?.trim(),
        };

        // Validate required fields
        const requiredFields = [
          "firstName",
          "lastName",
          "email",
          "phone",
          "userType",
          "dateOfBirth",
          "gender",
        ];

        const missingFields = requiredFields.filter(
          (field) => !userData[field as keyof typeof userData]
        );

        if (missingFields.length > 0) {
          errors.push({
            row: rowNumber,
            email: userData.email || "N/A",
            error: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
          errors.push({
            row: rowNumber,
            email: userData.email,
            error: "Invalid email format",
          });
          continue;
        }

        // Validate role
        const allowedRoles = [
          "customer",
          "delivery_partner",
          "admin",
          "super admin",
        ];
        if (!allowedRoles.includes(userData.userType)) {
          errors.push({
            row: rowNumber,
            email: userData.email,
            error: "Invalid role. Use: pastor, admin staff, operatives, adhoc",
          });
          continue;
        }

        // Check if user already exists (email or phone)
        const existingUser = await userModel.findOne({
          $or: [
            { email: { $regex: new RegExp(`^${userData.email}$`, "i") } },
            { phone: userData.phone },
          ],
        });

        if (existingUser) {
          // Skip this user but don't treat as error
          skippedUsers.push({
            row: rowNumber,
            email: userData.email,
            phone: userData.phone,
            reason:
              existingUser.email === userData.email
                ? "Email already exists"
                : "Phone number already exists",
          });
          continue;
        }

        // Create user
        const user = await userModel.create({
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: userData.password,
          phone: userData.phone,
          userType: userData.userType,
          adminRiders: userData.adminRiders || null,
          dateOfBirth: userData.dateOfBirth,
          gender: userData.gender,
          isVerified: true,
          authProvider: "local",
          register_source: "admin-csv-upload",
        });

        // Send welcome email (don't await to not block)
        try {
          const emailData = {
            user: {
              name: `${userData.firstName} ${userData.lastName}`,
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              userType: userData.userType,
              phone: userData.phone,
            },
            loginCredentials: {
              email: userData.email,
              password: userData.password,
            },
            systemName: "SMHOS HRM", // Make sure this is included
            loginUrl: `${
              process.env.FRONTEND_URL || "http://localhost:3000"
            }/login`,
            supportEmail: process.env.SUPPORT_EMAIL || "support@courries.com",
            currentYear: new Date().getFullYear(),
          };

          await sendEmail({
            email: userData.email,
            subject: "Welcome to SMHOS HRM - Your Account Details",
            template: "confirmationEmail.ejs",
            data: emailData,
          });
        } catch (emailError) {
          console.error(
            `Failed to send email to ${userData.email}:`,
            emailError
          );
        }

        // Remove sensitive data
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.otp;
        delete userResponse.otpExpiry;

        successfulUsers.push(userResponse);
      } catch (error: any) {
        errors.push({
          row: rowNumber,
          email: row["Email"] || row["email"] || "N/A",
          error: error.message || "Failed to create user",
        });
      }
    }

    // Prepare response
    const response = {
      success: successfulUsers.length > 0,
      message: `Processed ${results.length} records. ${successfulUsers.length} created, ${skippedUsers.length} skipped (already exist), ${errors.length} failed.`,
      summary: {
        total: results.length,
        created: successfulUsers.length,
        skipped: skippedUsers.length,
        failed: errors.length,
      },
      data: {
        created: successfulUsers,
        skipped: skippedUsers,
        errors: errors,
      },
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error("Error processing CSV upload:", error);
    res.status(500).json({
      message: "Server error while processing CSV upload",
      success: false,
    });
  }
};

// Helper function to generate temporary password
function generateTemporaryPassword(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password + "!Aa1"; // Ensure it meets complexity requirements
}

// Helper: Default delivery partner info (reused for new & incomplete users)
const getDefaultDeliveryPartnerInfo = () => ({
  vehicle: { type: "bike" },
  documents: {
    license: { number: "", expiryDate: new Date(), image: "" },
    nin: { number: "", house_address: "", image: "" },
  },
  location: {
    coordinates: {
      type: "Point",
      coordinates: [0, 0], // [lng, lat] – required
    },
    lastUpdated: new Date(),
  },
  verificationStatus: {
    identity: false,
    vehicle: false,
    backgroundCheck: false,
    submitted: false,
    verified: false,
  },
  status: "offline",
  rating: 0,
  totalDeliveries: 0,
  completedDeliveries: 0,
  cancelledDeliveries: 0,
  averageRating: 0,
  stats: {
    totalDeliveries: 0,
    completedDeliveries: 0,
    cancelledDeliveries: 0,
    averageRating: 0,
    totalReviews: 0,
    acceptanceRate: 100,
  },
  earnings: { total: 0, pending: 0, available: 0 },
  online: false,
  workingHours: { start: "09:00", end: "18:00", timezone: "UTC" },
  other_information: {
    why_become_a_delivery_driver: "",
    income_target: "",
    next_of_kin_name: "",
    next_of_kin_phone: "",
    next_of_kin_nin: "",
    next_of_kin_address: "",
    next_of_kin_occupation: "",
  },
  preferences: {
    maxDistance: 20,
    minDeliveryFee: 500,
    acceptedPackageTypes: [],
  },
  reviews: [],
});

// Ensure deliveryPartnerInfo is present and valid
const ensureDeliveryPartnerInfo = (user: any) => {
  if (user.userType !== "delivery_partner") return;

  // If completely missing, assign defaults
  if (!user.deliveryPartnerInfo) {
    user.deliveryPartnerInfo = getDefaultDeliveryPartnerInfo();
    return;
  }

  // Ensure location.coordinates.coordinates exists
  if (!user.deliveryPartnerInfo.location?.coordinates?.coordinates) {
    user.deliveryPartnerInfo.location = {
      coordinates: {
        type: "Point",
        coordinates: [0, 0],
      },
      lastUpdated: new Date(),
    };
  }

  // Ensure other required sub‑documents exist (documents, verificationStatus, etc.)
  if (!user.deliveryPartnerInfo.documents) {
    user.deliveryPartnerInfo.documents =
      getDefaultDeliveryPartnerInfo().documents;
  }
  if (!user.deliveryPartnerInfo.verificationStatus) {
    user.deliveryPartnerInfo.verificationStatus =
      getDefaultDeliveryPartnerInfo().verificationStatus;
  }
  if (!user.deliveryPartnerInfo.other_information) {
    user.deliveryPartnerInfo.other_information =
      getDefaultDeliveryPartnerInfo().other_information;
  }
  if (!user.deliveryPartnerInfo.preferences) {
    user.deliveryPartnerInfo.preferences =
      getDefaultDeliveryPartnerInfo().preferences;
  }
  if (!user.deliveryPartnerInfo.stats) {
    user.deliveryPartnerInfo.stats = getDefaultDeliveryPartnerInfo().stats;
  }
  if (!user.deliveryPartnerInfo.earnings) {
    user.deliveryPartnerInfo.earnings =
      getDefaultDeliveryPartnerInfo().earnings;
  }
};

export const appleLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { identityToken, user: appleUserData, email, fullName } = req.body;

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        message: "Identity token is required",
      });
    }

    // 1. Verify Apple token
    const appleClaims = await appleAuthService.verifyIdentityToken(
      identityToken
    );
    const appleUserId = appleClaims.sub;
    const appleEmail = appleClaims.email || email;

    let user: any = await userModel.findOne({ appleUserId });

    if (user) {
      // Existing user by appleUserId – must be a delivery partner
      if (user.userType !== "delivery_partner") {
        return res.status(403).json({
          success: false,
          message:
            "This account is not a rider account. Please use the customer app.",
        });
      }
    } else if (appleEmail) {
      // Try to find by email
      user = await userModel.findOne({ email: appleEmail });
      if (user) {
        if (user.userType !== "delivery_partner") {
          return res.status(403).json({
            success: false,
            message:
              "This account is not a rider account. Please use the customer app.",
          });
        }
        // Link Apple account
        user.appleUserId = appleUserId;
        user.isAppleLinked = true;
        user.authProvider = user.authProvider === "local" ? "local" : "apple";
        if (!user.isVerified) user.isVerified = true;
      } else {
        // Create brand new delivery partner
        const firstName =
          fullName?.givenName || appleUserData?.firstName || "Apple";
        const lastName =
          fullName?.familyName || appleUserData?.lastName || "User";

        user = new userModel({
          email: appleEmail || `apple_${appleUserId}@privaterelay.appleid.com`,
          firstName,
          lastName,
          appleUserId,
          isAppleLinked: true,
          authProvider: "apple",
          isVerified: true,
          userType: "delivery_partner",
          password: Math.random().toString(36).slice(-8),
          status: "active",
          addresses: [],
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Email information is required from Apple",
      });
    }

    // ✅ CRITICAL: Ensure delivery partner info exists and is valid
    ensureDeliveryPartnerInfo(user);
    await user.save();

    // Check account status
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact support.",
      });
    }

    // Generate token
    const token = createToken(user._id);
    setTokenCookie(res, token);

    // Prepare response
    const userWithoutSensitive = user.toObject();
    delete userWithoutSensitive.password;
    delete userWithoutSensitive.otp;
    delete userWithoutSensitive.otpExpires;

    const isNewUser = user.createdAt.getTime() > Date.now() - 60000;

    let responseMessage = isNewUser
      ? "Account created successfully with Apple"
      : "Apple login successful";

    if (user.userType === "delivery_partner") {
      const isIncomplete =
        !user.deliveryPartnerInfo ||
        user.deliveryPartnerInfo.verificationStatus?.submitted !== true;
      if (isIncomplete) {
        responseMessage =
          "Please complete your verification details to start delivering.";
      }
    }

    res.status(200).json({
      success: true,
      token,
      message: responseMessage,
      user: userWithoutSensitive,
      isNewUser,
    });
  } catch (error) {
    console.error("❌ Apple login error:", error);
    res.status(401).json({
      success: false,
      message: "Apple authentication failed",
      error: error.message,
    });
  }
};

export const appleLoginCustomer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { identityToken, user: appleUserData, email, fullName } = req.body;

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        message: "Identity token is required",
      });
    }

    // 1. Verify Apple's identity token
    const appleClaims = await appleAuthService.verifyIdentityToken(
      identityToken
    );

    // 2. Extract user info from Apple
    const appleUserId = appleClaims.sub;
    const appleEmail = appleClaims.email || email;

    let user: any = await userModel.findOne({ appleUserId });

    // ✅ Correct way to check if userType is not "customer"
    if (user.userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: `This account is not a user account. Please use the rider app.`,
      });
    }

    if (!user) {
      console.log("7. No user found with appleUserId, checking by email...");
      // Check if user exists with same email (for account linking)
      if (appleEmail) {
        user = await userModel.findOne({ email: appleEmail });
        console.log("8. User found by email:", !!user);
      }

      if (user) {
        console.log("9. Linking Apple account to existing user");
        // Link Apple account to existing user
        user.appleUserId = appleUserId;
        user.isAppleLinked = true;
        user.authProvider = user.authProvider === "local" ? "local" : "apple";

        // Apple users are considered verified (since Apple verified their email)
        if (!user.isVerified) {
          user.isVerified = true;
        }
        await user.save();
        console.log("10. User updated successfully");
      } else {
        console.log("11. Creating new user with Apple credentials");
        // Create new user with Apple credentials
        const firstName =
          fullName?.givenName || appleUserData?.firstName || "Apple";
        const lastName =
          fullName?.familyName || appleUserData?.lastName || "User";

        console.log("12. Creating user with:", {
          firstName,
          lastName,
          appleEmail,
        });

        user = await userModel.create({
          email: appleEmail || `apple_${appleUserId}@privaterelay.appleid.com`,
          firstName,
          lastName,
          appleUserId,
          isAppleLinked: true,
          authProvider: "apple",
          isVerified: true,
          userType: "customer",
          password: Math.random().toString(36).slice(-8),
          status: "active",
          addresses: [],
        });

        console.log("13. New user created with ID:", user._id);
      }
    }

    // 4. Check if user is authorized
    const allowedRoles = ["customer"];
    if (!allowedRoles.includes(user.userType)) {
      console.log("15. User not authorized - role:", user.userType);
      return res.status(403).json({
        success: false,
        message:
          "This account is not a customer account. Please use the rider app.",
      });
    }

    // 5. Check if user account is active
    console.log("16. Checking user status:", user.status);
    if (user.status !== "active") {
      console.log("17. User not active - status:", user.status);
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact support.",
      });
    }

    // 6. Create JWT token
    console.log("18. Creating JWT token for user:", user._id);
    const token = createToken(user._id);
    console.log("19. Token created successfully");

    // 7. Prepare user object without sensitive data
    const userWithoutSensitive = user.toObject();
    delete userWithoutSensitive.password;
    delete userWithoutSensitive.otp;
    delete userWithoutSensitive.otpExpires;

    // 8. Set cookie and send response
    console.log("20. Setting cookie and sending response");
    setTokenCookie(res, token);

    // 9. Check if this is a new user
    const isNewUser = user.createdAt.getTime() > Date.now() - 60000;

    console.log("21. Login successful!");
    res.status(200).json({
      success: true,
      token,
      message: isNewUser
        ? "Account created successfully with Apple"
        : "Apple login successful",
      user: userWithoutSensitive,
      isNewUser,
    });
  } catch (error) {
    console.error("❌ Apple login error at step:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    res.status(401).json({
      success: false,
      message: "Apple authentication failed",
      error: error.message,
    });
  }
};

const client = new OAuth2Client(
  "723785150509-ldhib6lr73gl8g9dvhfll7l7v6vf7p9h.apps.googleusercontent.com"
);

export const googleSignIn = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const {
      sub: googleId,
      email,
      given_name,
      family_name,
      picture,
      email_verified,
    } = payload;

    let user = await userModel.findOne({ googleId });

    if (!user) {
      user = await userModel.findOne({ email });

      if (user) {
        // Existing user with same email – must be a delivery partner
        if (user.userType !== "delivery_partner") {
          return res.status(403).json({
            message:
              "This account is not a rider account. Please use the customer app.",
          });
        }
        user.googleId = googleId;
        user.authProvider = "google";
        user.isVerified = email_verified || user.isVerified;
        if (picture) user.avatar = { url: picture, public_id: "" };
        await user.save();
      } else {
        // Create new delivery partner account
        const randomPassword = crypto.randomBytes(16).toString("hex");
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = new userModel({
          email,
          firstName: given_name || "",
          lastName: family_name || "",
          password: hashedPassword,
          googleId,
          authProvider: "google",
          isVerified: email_verified || false,
          avatar: picture ? { url: picture, public_id: "" } : undefined,
          userType: "delivery_partner",
        });
        await user.save();
      }
    } else {
      // User found by googleId – must be a delivery partner
      if (user.userType !== "delivery_partner") {
        return res.status(403).json({
          message:
            "This account is not a rider account. Please use the customer app.",
        });
      }
    }

    // Generate JWT
    const token = createToken(user._id);

    // Remove sensitive data
    const userWithoutSensitive = user.toObject();
    delete userWithoutSensitive.password;
    delete userWithoutSensitive.otp;
    delete userWithoutSensitive.otpExpires;

    // Set cookie
    setTokenCookie(res, token);

    const isNewUser = user.createdAt.getTime() > Date.now() - 60000;

    // ✅ Determine response message based on profile completeness
    let responseMessage = isNewUser
      ? "Rider account created successfully with Google"
      : "Google login successful";

    if (user.userType === "delivery_partner") {
      const isIncomplete =
        !user.deliveryPartnerInfo ||
        user.deliveryPartnerInfo.verificationStatus?.submitted !== true;
      if (isIncomplete) {
        responseMessage =
          "Please complete your verification details to start delivering.";
      }
    }

    res.status(200).json({
      success: true,
      token,
      message: responseMessage,
      user: userWithoutSensitive,
      isNewUser,
    });
  } catch (error) {
    console.error("Google Sign-In error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const googleSignInCustomer = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const {
      sub: googleId,
      email,
      given_name,
      family_name,
      picture,
      email_verified,
    } = payload;

    // Try to find user by googleId first
    let user = await userModel.findOne({ googleId });

    if (!user) {
      // Try to find by email
      user = await userModel.findOne({ email });

      if (user) {
        // User exists with this email but no googleId linked.
        // If the existing account is a customer, block access to the rider app.
        if (user.userType !== "customer") {
          return res.status(403).json({
            message:
              "This account is not a user account. Please use the reider app.",
          });
        }
        // Link Google account to existing delivery partner
        user.googleId = googleId;
        user.authProvider = "google";
        user.isVerified = email_verified || user.isVerified;
        if (picture) user.avatar = { url: picture, public_id: "" };
        await user.save();
      } else {
        // No user found – create a new delivery partner account
        const randomPassword = crypto.randomBytes(16).toString("hex");
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = new userModel({
          email,
          firstName: given_name || "",
          lastName: family_name || "",
          password: hashedPassword,
          googleId,
          authProvider: "google",
          isVerified: email_verified || false,
          avatar: picture ? { url: picture, public_id: "" } : undefined,
          userType: "customer", // <-- Important: rider app
        });
        await user.save();
      }
    } else {
      // User found by googleId – check if they are a delivery partner
      if (user.userType !== "customer") {
        return res.status(403).json({
          message:
            "This account is not a user account. Please use the rider app.",
        });
      }
    }

    // Generate JWT
    const token = createToken(user._id);

    // Remove sensitive data
    const userWithoutSensitive = user.toObject();
    delete userWithoutSensitive.password;
    delete userWithoutSensitive.otp;
    delete userWithoutSensitive.otpExpires;

    // Set cookie
    setTokenCookie(res, token);

    const isNewUser = user.createdAt.getTime() > Date.now() - 60000;

    res.status(200).json({
      success: true,
      token,
      message: isNewUser
        ? "Rider account created successfully with Google"
        : "Google login successful",
      user: userWithoutSensitive,
      isNewUser,
    });
  } catch (error) {
    console.error("Google Sign-In error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const loginDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user: any = await userModel.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res
        .status(401)
        .json({ message: "Please verify your account before logging in" });
    }

    // Authorize allowed roles
    const allowedRoles = ["delivery_partner"];

    if (!allowedRoles.includes(user.userType)) {
      return res.status(403).json({
        success: false,
        message: `Your account ${user?.userType} is not authorized to access this platform. Please contact your administrator.`,
      });
    }

    // ✅ IMPROVED: Check if delivery partner info is missing or not yet submitted
    const isIncomplete =
      user.userType === "delivery_partner" &&
      (!user.deliveryPartnerInfo ||
        user.deliveryPartnerInfo.verificationStatus?.submitted !== true);

    const token = createToken(user._id);
    setTokenCookie(res, token);

    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;

    res.status(200).json({
      success: true,
      token,
      message: isIncomplete
        ? "Please complete your verification details to start delivering."
        : "Login successful",
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const loginAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user: any = await userModel.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res
        .status(401)
        .json({ message: "Please verify your account before logging in" });
    }

    // Authorize allowed roles
    const allowedRoles = ["super admin", "admin"];
    if (!allowedRoles.includes(user.userType)) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not authorized to access this platform. Please contact your administrator.",
      });
    }

    const token = createToken(user._id);

    // Remove password before sending response
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;

    setTokenCookie(res, token);
    res.status(200).json({
      success: true,
      token,
      message:
        user.userType === "delivery_partner" &&
        user.deliveryPartnerInfo?.verificationStatus?.submitted === false
          ? "Please complete your verification details to start delivering."
          : "Login successful",
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { firstName, lastName, email, password, phone, userType } = req.body;

    // 1. Validate required fields (Email is mandatory for this flow)
    if (!firstName || !lastName || !email || !password || !userType) {
      console.log("Validation failed - missing required fields.");
      return res.status(400).json({
        message:
          "Please provide your first name, last name, email, password, and role.",
      });
    }

    // --- FIX: Check for existing user by Email OR Phone ---
    const existingUser = await userModel.findOne({
      $or: [
        { email },
        // Only include phone in the check if it was actually provided in the request body
        ...(phone ? [{ phone }] : []),
      ],
    });

    if (existingUser) {
      let message = "User already exists.";

      // Provide a more specific error message
      if (existingUser.email === email) {
        message = "User already exists with this email address.";
      } else if (phone && existingUser.phone === phone) {
        message = "User already exists with this phone number.";
      }

      return res.status(409).json({ message }); // Use 409 Conflict status
    }

    // Generate OTP and set expiry (10 minutes)
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // 4. Create user BEFORE sending OTP (to catch DB errors early)
    // NOTE: This approach is better for transactions, but simpler systems create first.
    // If user creation fails (e.g., duplicate phone), the email is NOT sent.
    const userData = {
      firstName,
      lastName,
      email,
      password,
      phone,
      userType,
      otp,
      otpExpires: otpExpiry,
      isVerified: false, // Ensure this defaults to false
    };

    const user = await userModel.create(userData);

    try {
      // 5. Prepare and send email
      const data = {
        user: { name: `${firstName} ${lastName}` },
        otp,
      };

      await sendEmail({
        email: email as string,
        subject: "Account Verification OTP",
        template: "activationmail.ejs",
        data,
      });

      // 6. Send success response
      return res.status(201).json({
        success: true,
        message: `Verification OTP sent to ${email}. Please check your email.`,
      });
    } catch (error: any) {
      // Handle email failure: Delete the newly created user to avoid orphaned records
      // This is a necessary cleanup step.
      await userModel.deleteOne({ _id: user._id });
      console.error("Error sending OTP, user deleted:", error);

      return next(
        new ErrorHandler(
          `Registration failed. Failed to send OTP email. Please try again.`,
          500
        )
      );
    }
  } catch (error: any) {
    // --- FIX: Handle main registration errors (like E11000 if missed above) ---
    // This catches database errors that might occur outside the explicit check (e.g., phone format validation)
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A user with this email or phone number already exists.",
        success: false,
      });
    }

    // Handle other errors gracefully
    next(error);
  }
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required for OTP verification",
      });
    }
    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const user = await userModel.findOne({ email: email.trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "No OTP found for verification",
      });
    }
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code",
      });
    }
    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    // --- Registration flow ---
    if (purpose === "registration") {
      // 1. Mark user as verified
      user.isVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;

      // 2. For delivery partners, create complete default deliveryPartnerInfo
      if (user.userType === "delivery_partner" && !user.deliveryPartnerInfo) {
        user.deliveryPartnerInfo = {
          vehicle: { type: "bike" }, // minimal, will be updated later
          documents: {
            license: { number: "", expiryDate: new Date(), image: "" },
            nin: { number: "", house_address: "", image: "" },
          },
          location: {
            coordinates: {
              type: "Point",
              coordinates: [0, 0], // dummy coordinates, satisfies required field
            },
            lastUpdated: new Date(),
          },
          verificationStatus: {
            identity: false,
            vehicle: false,
            backgroundCheck: false,
            submitted: false,
            verified: false,
          },
          status: "offline",
          rating: 0,
          totalDeliveries: 0,
          completedDeliveries: 0,
          cancelledDeliveries: 0,
          averageRating: 0,
          stats: {
            totalDeliveries: 0,
            completedDeliveries: 0,
            cancelledDeliveries: 0,
            averageRating: 0,
            totalReviews: 0,
            acceptanceRate: 100,
          },
          earnings: { total: 0, pending: 0, available: 0 },
          online: false,
          workingHours: { start: "09:00", end: "18:00", timezone: "UTC" },
          other_information: {
            why_become_a_delivery_driver: "",
            income_target: "",
            next_of_kin_name: "",
            next_of_kin_phone: "",
            next_of_kin_nin: "",
            next_of_kin_address: "",
            next_of_kin_occupation: "",
          },
          preferences: {
            maxDistance: 20,
            minDeliveryFee: 500,
            acceptedPackageTypes: [],
          },
          reviews: [],
        };
      }

      await user.save();

      // 3. Generate auth token
      const token = createToken(user._id);

      setTokenCookie(res, token);

      // 4. Handle wallet – idempotent creation & bonus
      const walletBonus = user.userType === "delivery_partner" ? 0 : 100;
      let wallet = await Wallet.findOne({ user: user._id });

      if (!wallet) {
        wallet = new Wallet({
          user: user._id,
          balance: walletBonus,
          transactions: [],
        });

        if (walletBonus > 0) {
          const bonusReference = `signup_bonus_${user._id}_${Date.now()}`;
          wallet.transactions.push({
            type: "credit",
            amount: walletBonus,
            description: "Welcome bonus for account verification",
            reference: bonusReference,
            paymentMethod: "wallet",
            metadata: {
              purpose: "signup_bonus",
              verifiedAt: new Date(),
            },
          });
        }
        await wallet.save();
      } else {
        const alreadyHasBonus = wallet.transactions.some(
          (tx: any) => tx.metadata?.purpose === "signup_bonus"
        );
        if (!alreadyHasBonus && walletBonus > 0) {
          const bonusReference = `signup_bonus_${user._id}_${Date.now()}`;
          wallet.transactions.push({
            type: "credit",
            amount: walletBonus,
            description: "Welcome bonus for account verification",
            reference: bonusReference,
            paymentMethod: "wallet",
            metadata: {
              purpose: "signup_bonus",
              verifiedAt: new Date(),
            },
          });
          wallet.balance += walletBonus;
          await wallet.save();
        }
      }

      // 5. Create notification
      let notificationContent: string;
      let notificationType: string;

      if (user.userType === "delivery_partner") {
        notificationContent = `Congratulations ${user.firstName}! Your account has been successfully verified. Please complete your profile to start accepting deliveries.`;
        notificationType = "Account Verified";
      } else {
        notificationContent = `Congratulations ${user.firstName}! Your account has been successfully verified. As a token of our appreciation, Courries has funded your wallet with 100 NGN. Thank you!`;
        notificationType = "Appreciation Fund";
      }

      await Notification.create({
        recipient: user._id,
        type: notificationType,
        content: notificationContent,
      });

      // 6. Determine response message (mirroring loginDelivery)
      let responseMessage = "Account verified successfully";
      if (user.userType === "delivery_partner") {
        const isIncomplete =
          !user.deliveryPartnerInfo ||
          user.deliveryPartnerInfo.verificationStatus?.submitted !== true;
        if (isIncomplete) {
          responseMessage =
            "Please complete your verification details to start delivering.";
        }
      }

      return res.status(200).json({
        success: true,
        message: responseMessage,
        token,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isVerified: user.isVerified,
        },
      });
    }

    // --- Password reset flow ---
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        _id: user._id,
        email: user.email,
        canResetPassword: true,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    next(error);
  }
};

export const forgotPasswordApi = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, phoneNumber } = req.body;

    // Validate input presence
    const hasEmail = !!email?.trim();
    const hasPhone = !!phoneNumber?.trim();

    // Check for exactly one contact method
    if ((!hasEmail && !hasPhone) || (hasEmail && hasPhone)) {
      return res.status(400).json({
        message: "Please provide either email or phone number",
        success: false,
      });
    }

    // Find user by email or phone
    const query = hasEmail
      ? { email: email.trim() }
      : { phoneNumber: phoneNumber.trim() };

    const user = await userModel.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided credentials",
      });
    }

    // Generate OTP and set expiry
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Send OTP via appropriate channel
      if (hasEmail) {
        // Prepare email template
        const data = { otp, name: user.firstName };
        // Render email template with data
        const html = await ejs.renderFile(
          path.join(__dirname, "../mails/passwordResetConfirmation.ejs"),
          data
        );

        await sendEmail({
          email,
          subject: "Account Verification OTP",
          template: "passwordResetConfirmation.ejs",
          data,
        });
      } else {
        // await sendOTP(user.phone, otp);
      }

      // Update user only after successful OTP dispatch
      user.otp = otp;
      user.otpExpires = otpExpiry;
      await user.save();

      res.status(200).json({
        success: true,
        message: `Password reset OTP sent to your ${
          hasEmail ? "email" : "phone"
        }`,
      });
    } catch (sendError: any) {
      console.error("OTP sending failed:", sendError);
      return next(
        new ErrorHandler(`Failed to send OTP: ${sendError.message}`, 500)
      );
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    next(error);
  }
};


export const forgotPasswordAdminApi = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, phoneNumber } = req.body;

    // Validate input presence
    const hasEmail = !!email?.trim();
    const hasPhone = !!phoneNumber?.trim();

    // Check for exactly one contact method
    if ((!hasEmail && !hasPhone) || (hasEmail && hasPhone)) {
      return res.status(400).json({
        message: "Please provide either email or phone number",
        success: false,
      });
    }

    // Find user by email or phone
    const query = hasEmail
      ? { email: email.trim() }
      : { phoneNumber: phoneNumber.trim() };

    const user = await userModel.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with the provided credentials",
      });
    }

    // --- Role validation: only admin or super admin can reset password ---
    const allowedRoles = ["admin", "super admin"];
    if (!allowedRoles.includes(user.userType)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only administrators can reset passwords.",
      });
    }

    // Generate OTP and set expiry
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Send OTP via appropriate channel
      if (hasEmail) {
        // Prepare email template
        const data = { otp, name: user.firstName };
        // Render email template with data
        const html = await ejs.renderFile(
          path.join(__dirname, "../mails/passwordResetConfirmation.ejs"),
          data
        );

        await sendEmail({
          email,
          subject: "Account Verification OTP",
          template: "passwordResetConfirmation.ejs",
          data,
        });
      } else {
        // await sendOTP(user.phone, otp);
      }

      // Update user only after successful OTP dispatch
      user.otp = otp;
      user.otpExpires = otpExpiry;
      await user.save();

      res.status(200).json({
        success: true,
        message: `Password reset OTP sent to your ${
          hasEmail ? "email" : "phone"
        }`,
      });
    } catch (sendError: any) {
      console.error("OTP sending failed:", sendError);
      return next(
        new ErrorHandler(`Failed to send OTP: ${sendError.message}`, 500)
      );
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    next(error);
  }
};

export const resetPasswordApi = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, phoneNumber, otp, newPassword } = req.body;

    console.log(req.body);

    // Validate input presence
    const hasEmail = !!email?.trim();
    const hasPhone = !!phoneNumber?.trim();

    // Check for exactly one identifier
    if ((!hasEmail && !hasPhone) || (hasEmail && hasPhone)) {
      return res.status(400).json({
        success: false,
        message: "Provide either email or phone number",
      });
    }

    // Validate password strength
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Find user by identifier
    const query = hasEmail
      ? { email: email.trim() }
      : { phoneNumber: phoneNumber.trim() };

    const user = await userModel.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify OTP validity
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "No active OTP found",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    // Update user password and clear OTP
    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Optional: Send confirmation email/SMS
    // sendPasswordChangeConfirmation(user);

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    next(error);
  }
};

export const resendOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, phoneNumber } = req.body;

    console.log(req.body);

    // Validate input presence
    const hasEmail = !!email?.trim();
    const hasPhone = !!phoneNumber?.trim();

    // Check for exactly one contact method
    if ((!hasEmail && !hasPhone) || (hasEmail && hasPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide either email or phone number",
      });
    }

    // Find user by identifier
    const query = hasEmail
      ? { email: email.trim() }
      : { phoneNumber: phoneNumber.trim() };

    const user = await userModel.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    try {
      // Send OTP via appropriate channel
      if (hasEmail) {
        const data = {
          user: {
            firstName: user.firstName,
            lastName: user.lastName,
          },
          otp,
        };
        const html = await ejs.renderFile(
          path.join(__dirname, "../mails/activationmail.ejs"),
          data
        );

        await sendEmail({
          email: user.email,
          subject: "Account Verification OTP",
          template: "activationmail.ejs",
          data,
        });
      } else {
        // await sendOTP(user.phone, otp);
      }

      // Update OTP only after successful dispatch
      user.otp = otp;
      user.otpExpires = otpExpiry;
      await user.save();

      res.status(200).json({
        success: true,
        message: `OTP resent to your ${hasEmail ? "email" : "phone"}`,
      });
    } catch (error: any) {
      console.error("OTP resend failed:", error);
      return next(
        new ErrorHandler(`Failed to resend OTP: ${error.message}`, 500)
      );
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    next(error);
  }
};

// add address api
export const addAddress = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Expecting IAddress structure: addressType, street, city, state, zipCode, country
    const newAddress = req.body;
    const { id } = req.params;

    console.log(newAddress, "new address");

    const user = await userModel
      .findByIdAndUpdate(
        id,
        { $push: { addresses: newAddress } },
        { new: true, runValidators: true } // Return the updated document and run Mongoose validators
      )
      .select("addresses");

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: user.addresses,
    });
  } catch (error: any) {
    // Catch validation errors (e.g., missing required fields like addressType)
    if (error.name === "ValidationError") {
      return next(new ErrorHandler(error.message, 400));
    }
    next(error);
  }
};

// edit user
export const editAddress = async (
  req: Request, // Use your custom request type
  res: Response,
  next: NextFunction
) => {
  try {
    const { addressId } = req.params;
    const { id } = req.params;
    const updates = req.body;

    console.log(updates, id, addressId, "update");

    // 🔥 FIX 1: Use the authenticated user ID for the query.
    const userId = id;

    // Check if updates contain data to prevent empty $set
    if (Object.keys(updates).length === 0) {
      return next(new ErrorHandler("No updates provided", 400));
    }

    // Build the $set payload dynamically for cleaner code and correct pathing
    const setPayload: { [key: string]: any } = {};
    for (const key in updates) {
      // Ensure key is safe and not one of the internal Mongoose fields
      if (key !== "_id" && key !== "__v") {
        setPayload[`addresses.$.${key}`] = updates[key];
      }
    }

    // 💥 FIX 2: Ensure the user ID is correctly used in the query.
    const user = await userModel
      .findOneAndUpdate(
        // Query to find the user AND the specific address sub-document
        { _id: userId, "addresses._id": addressId },
        { $set: setPayload }, // Use the dynamically built payload
        { new: true, runValidators: true }
      )
      .select("addresses");

    if (!user) {
      // User not found OR addressId not found for this user
      // The update failed because the sub-document wasn't matched.
      return next(new ErrorHandler("Address not found for this user", 404));
    }

    // The update was successful, and `new: true` ensures `user.addresses` contains the latest data.
    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: user.addresses,
    });
  } catch (error: any) {
    if (error.name === "ValidationError") {
      return next(new ErrorHandler(error.message, 400));
    }
    next(error);
  }
};

// delete address
export const removeAddress = async (
  req: Request, // 🔥 FIX 1: Use CustomRequest for typing
  res: Response,
  next: NextFunction
) => {
  try {
    const { addressId } = req.params;
    const { id } = req.params;

    // 🔥 FIX 2: Get the User ID from the authenticated user object, NOT req.params
    const userId = id;

    // Remove the confusing and incorrect line: const { id } = req.params;

    if (!userId) {
      return next(new ErrorHandler("User not authenticated", 401));
    }

    // Use $pull to remove the sub-document with the matching _id
    const user = await userModel
      .findByIdAndUpdate(
        // 🔥 FIX 3: Pass the validated userId directly
        userId,
        {
          $pull: {
            addresses: { _id: addressId },
          },
        },
        { new: true }
      )
      .select("addresses");

    // The rest of your logic is correct
    if (!user) {
      // This means the userId was valid but no user was found (highly unlikely after auth)
      return next(new ErrorHandler("User not found", 404));
    }

    return res.status(200).json({
      success: true,
      message: "Address removed successfully",
      data: user.addresses,
    });
  } catch (error) {
    next(error);
  }
};

export const getAddresses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id).select("addresses");

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: user.addresses,
    });
  } catch (error) {
    next(error);
  }
};

// dont know about this api the one in use
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await userModel.find().select("-password -otp -otpExpiry");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getSingleUser = async (req: Request, res: Response) => {
  try {
    const user = await userModel
      .findById(req.params.id)
      .select("-password -otp -otpExpiry");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const user = await userModel
      .findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpiry");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error: any) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;

    const user = await userModel
      .findById(userId)
      .select("-password -otp -otpExpiry");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

interface IUpdateUserPassword {
  currentPassword: string;
  newPassword: string;
}

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Both passwords are required" });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          message: "New password must be at least 6 characters",
        });
    }

    // Get user with password field
    const user = await userModel.findById(userId).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }

    // Hash new password and save
    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // from auth middleware
    const updates = req.body;

    // Allowed fields that can be updated
    const allowedFields = [
      "firstName",
      "lastName",
      "phone",
      "address",
      "gender",
      "avatar",
    ];

    // Filter only allowed fields
    const filteredUpdates: any = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    }

    // Update user
    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpiry");

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

interface IUpdateUserProfilePic {
  avatar: string;
}

export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { avatar } = req.body as IUpdateUserProfilePic;
    const userId = req.user?._id;

    if (!userId) {
      return next(new ErrorHandler("User ID not provided", 400));
    }

    const user = await userModel.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (!avatar) {
      return next(new ErrorHandler("No avatar provided", 400));
    }
    // Delete existing avatar if it exists
    if (user.avatar?.public_id) {
      await cloudinary.v2.uploader.destroy(user.avatar.public_id);
    }

    // Upload new avatar
    const uploadedAvatar = await cloudinary.v2.uploader.upload(avatar, {
      folder: "avatar",
      width: 400,
    });

    // Update user profile with new avatar
    user.avatar = {
      public_id: uploadedAvatar.public_id,
      url: uploadedAvatar.secure_url,
    };

    await user.save();

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
};

// update userinfo
// update userinfo
export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      const user = await userModel.findById(userId);

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      // List of allowed fields to update
      const allowedUpdates = [
        "firstName",
        "lastName",
        "phone",
        "role",
        "dateOfBirth",
        "address",
        "email",
        "gender",
      ];

      // Create update object with only the fields that have meaningful values
      const updateData: any = {};

      allowedUpdates.forEach((field) => {
        // Only include fields that are defined and not empty strings
        if (req.body[field] !== undefined && req.body[field] !== "") {
          updateData[field] = req.body[field];
        }
      });

      // --- Duplicate checks ---
      // Check if phone is being updated and already used by another user
      if (updateData.phone) {
        const existingUserWithPhone = await userModel.findOne({
          phone: updateData.phone,
          _id: { $ne: userId },
        });
        if (existingUserWithPhone) {
          return next(
            new ErrorHandler(
              "Phone number already in use by another account",
              400
            )
          );
        }
      }

      // Check if email is being updated and already used by another user
      if (updateData.email) {
        const existingUserWithEmail = await userModel.findOne({
          email: updateData.email,
          _id: { $ne: userId },
        });
        if (existingUserWithEmail) {
          return next(
            new ErrorHandler("Email already in use by another account", 400)
          );
        }
      }

      // Update user with the filtered data
      Object.assign(user, updateData);
      await user.save();

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// get all users for admin
export const getAllUsers = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      getAllUsersService(res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// get user by id
export const getUserById = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
      const user = await userModel.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(200).json({
        user,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// fetching user info
export const getUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      getUserByIdC(userId, res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// logout
export const logout = (req: Request, res: Response) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({
    success: true,
    message: "User logged out successfully",
  });
};

// delete user by admin
export const deleteUserInApp = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      console.log(userId, "user id");
      const user = await userModel.findById(userId);

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      // Schedule deletion in 7 days
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + 7);

      user.deletionRequested = true;
      user.deletionRequestDate = deletionDate;
      user.status = "pending-deletion";
      await user.save();

      res.status(200).json({
        success: true,
        message: "User deletion scheduled. Account will be deleted in 7 days.",
        deletionDate,
        daysRemaining: 7,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// cancel delete user In Inapp
export const cancelDeletion = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = await userModel.findById(id);

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      user.deletionRequested = false;
      user.deletionRequestDate = undefined;
      user.status = "active";
      await user.save();

      res.status(200).json({
        success: true,
        message: "Account deletion cancelled successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// delete status Edpoint
export const getUserStatus = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = await userModel.findById(id);

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      let daysRemaining = 0;
      if (user.deletionRequestDate) {
        const now = new Date();
        const diffTime = user.deletionRequestDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining = daysRemaining > 0 ? daysRemaining : 0;
      }

      res.status(200).json({
        success: true,
        data: {
          status: user.status,
          deletionRequested: user.deletionRequested,
          deletionRequestDate: user.deletionRequestDate,
          daysRemaining,
        },
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// automatic delete

// Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();
    const usersToDelete = await userModel.find({
      deletionRequested: true,
      deletionRequestDate: { $lte: now },
      status: "pending-deletion",
    });

    for (const user of usersToDelete) {
      await user.deleteOne();
      console.log(`Deleted user ${user._id} as scheduled`);
    }
  } catch (error) {
    console.error("Error processing scheduled deletions:", error);
  }
});

// update user role
export const upDateUserRole = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, role, isSuspend, reason } = req.body;
      updateUsersRoleService(res, id, role, isSuspend, reason);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// chat

export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userModel.findById(req.user?._id).select("-password");
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Ensure the user is treated as a guest
    const guestUser = {
      ...user.toObject(),
      role: "guest",
    };

    res.status(200).json({
      success: true,
      user: guestUser,
      message: "Current user retrieved successfully as guest",
    });
  } catch (error) {
    next(error);
  }
};

// new apis for user verification

export const updatePersonalInfo = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const { dateOfBirth, gender, addresses } = req.body;

    // Validate dateOfBirth (must be >= 18 years)
    if (dateOfBirth) {
      const age = differenceInYears(new Date(), new Date(dateOfBirth));
      if (age < 18) {
        return res
          .status(400)
          .json({ message: "You must be at least 18 years old" });
      }
    }

    // Update allowed fields
    const updateData: any = {};
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (gender !== undefined) updateData.gender = gender;
    if (addresses !== undefined) updateData.addresses = addresses;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOtherInfo = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const {
      why_become_a_delivery_driver,
      income_target,
      next_of_kin_name,
      next_of_kin_phone,
      next_of_kin_nin,
      next_of_kin_address,
      next_of_kin_occupation,
    } = req.body;

    const updateData = {
      "deliveryPartnerInfo.other_information": {
        why_become_a_delivery_driver,
        income_target,
        next_of_kin_name,
        next_of_kin_phone,
        next_of_kin_nin,
        next_of_kin_address,
        next_of_kin_occupation,
      },
    };

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to delete old image from Cloudinary
const deleteCloudinaryImage = async (imageUrl: string, folder: string) => {
  try {
    const publicIdMatch = imageUrl.match(new RegExp(`\\/${folder}\\/(.+)\\.`));
    if (publicIdMatch && publicIdMatch[1]) {
      await cloudinary.v2.uploader.destroy(`${folder}/${publicIdMatch[1]}`);
    }
  } catch (error) {
    console.error(`Error deleting image from ${folder}:`, error);
  }
};

// Helper function to upload image to Cloudinary
const uploadToCloudinary = async (base64Image: string, folder: string) => {
  const uploadResult = await cloudinary.v2.uploader.upload(base64Image, {
    folder,
    width: 800,
    crop: "scale",
    quality: "auto:good",
  });
  return uploadResult;
};

// Update Vehicle Information
export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const { type, model, plateNumber, color, year } = req.body;

    const currentUser = await userModel.findById(userId);

    let imageUrl = req.body.image;
    let public_id: string | undefined;

    // If new image is provided as base64, upload to Cloudinary
    if (req.body.image && req.body.image.startsWith("data:image")) {
      try {
        // Delete existing vehicle image if it exists
        if (currentUser?.deliveryPartnerInfo?.vehicle?.image) {
          await deleteCloudinaryImage(
            currentUser.deliveryPartnerInfo.vehicle.image,
            "vehicles"
          );
        }

        // Upload new image
        const uploadResult = await uploadToCloudinary(
          req.body.image,
          "vehicles"
        );
        imageUrl = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      } catch (uploadError: any) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload image to Cloudinary",
          error: uploadError.message,
        });
      }
    }

    // Prepare update data
    const updateData: any = {
      "deliveryPartnerInfo.vehicle.type": type,
      "deliveryPartnerInfo.vehicle.image": imageUrl,
    };

    if (model) updateData["deliveryPartnerInfo.vehicle.model"] = model;
    if (plateNumber)
      updateData["deliveryPartnerInfo.vehicle.plateNumber"] = plateNumber;
    if (color) updateData["deliveryPartnerInfo.vehicle.color"] = color;
    if (year) updateData["deliveryPartnerInfo.vehicle.year"] = parseInt(year);
    if (public_id)
      updateData["deliveryPartnerInfo.vehicle.public_id"] = public_id;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "Vehicle information updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Update License Document
export const updateLicense = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const { number, expiryDate } = req.body;

    const currentUser = await userModel.findById(userId);

    let imageUrl = req.body.image;
    let public_id: string | undefined;

    if (req.body.image && req.body.image.startsWith("data:image")) {
      try {
        if (currentUser?.deliveryPartnerInfo?.documents?.license?.image) {
          await deleteCloudinaryImage(
            currentUser.deliveryPartnerInfo.documents.license.image,
            "documents"
          );
        }

        const uploadResult = await uploadToCloudinary(
          req.body.image,
          "documents"
        );
        imageUrl = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      } catch (uploadError: any) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload license image",
          error: uploadError.message,
        });
      }
    }

    const updateData: any = {
      "deliveryPartnerInfo.documents.license.number": number,
      "deliveryPartnerInfo.documents.license.expiryDate": expiryDate,
      "deliveryPartnerInfo.documents.license.image": imageUrl,
    };
    if (public_id)
      updateData["deliveryPartnerInfo.documents.license.public_id"] = public_id;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "License information updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Update Insurance Document
export const updateInsurance = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const { number, expiryDate } = req.body;

    const currentUser = await userModel.findById(userId);

    let imageUrl = req.body.image;
    let public_id: string | undefined;

    if (req.body.image && req.body.image.startsWith("data:image")) {
      try {
        if (currentUser?.deliveryPartnerInfo?.documents?.insurance?.image) {
          await deleteCloudinaryImage(
            currentUser.deliveryPartnerInfo.documents.insurance.image,
            "documents"
          );
        }

        const uploadResult = await uploadToCloudinary(
          req.body.image,
          "documents"
        );
        imageUrl = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      } catch (uploadError: any) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload insurance image",
          error: uploadError.message,
        });
      }
    }

    const updateData: any = {
      "deliveryPartnerInfo.documents.insurance.number": number,
      "deliveryPartnerInfo.documents.insurance.expiryDate": expiryDate,
      "deliveryPartnerInfo.documents.insurance.image": imageUrl,
    };
    if (public_id)
      updateData["deliveryPartnerInfo.documents.insurance.public_id"] =
        public_id;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "Insurance information updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Update Vehicle Registration Document
// Update Vehicle Registration Document & Vehicle Details
export const updateVehicleRegistration = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user._id;
    const {
      number,
      expiryDate,
      type, // vehicle type
      model, // vehicle model
      plateNumber, // vehicle plate number
      color, // vehicle color
      year, // vehicle year
    } = req.body;

    const currentUser = await userModel.findById(userId);

    let imageUrl = req.body.image;
    let public_id: string | undefined;

    if (req.body.image && req.body.image.startsWith("data:image")) {
      try {
        if (
          currentUser?.deliveryPartnerInfo?.documents?.vehicleRegistration
            ?.image
        ) {
          await deleteCloudinaryImage(
            currentUser.deliveryPartnerInfo.documents.vehicleRegistration.image,
            "documents"
          );
        }

        const uploadResult = await uploadToCloudinary(
          req.body.image,
          "documents"
        );
        imageUrl = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      } catch (uploadError: any) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload vehicle registration image",
          error: uploadError.message,
        });
      }
    }

    // Build the update object dynamically
    const updateData: any = {};

    // Update vehicle registration document fields if provided
    if (number !== undefined) {
      updateData["deliveryPartnerInfo.documents.vehicleRegistration.number"] =
        number;
    }
    if (expiryDate !== undefined) {
      updateData[
        "deliveryPartnerInfo.documents.vehicleRegistration.expiryDate"
      ] = expiryDate;
    }
    if (imageUrl !== undefined) {
      updateData["deliveryPartnerInfo.documents.vehicleRegistration.image"] =
        imageUrl;
    }
    if (public_id) {
      updateData[
        "deliveryPartnerInfo.documents.vehicleRegistration.public_id"
      ] = public_id;
    }

    // Update vehicle details if provided
    if (type !== undefined) {
      updateData["deliveryPartnerInfo.vehicle.type"] = type;
    }
    if (model !== undefined) {
      updateData["deliveryPartnerInfo.vehicle.model"] = model;
    }
    if (plateNumber !== undefined) {
      updateData["deliveryPartnerInfo.vehicle.plateNumber"] = plateNumber;
    }
    if (color !== undefined) {
      updateData["deliveryPartnerInfo.vehicle.color"] = color;
    }
    if (year !== undefined) {
      updateData["deliveryPartnerInfo.vehicle.year"] = year;
    }

    // Only proceed if there's something to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "Vehicle registration and details updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    // Handle validation errors (e.g., invalid vehicle type)
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Update NIN Document
export const updateNin = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const { number, house_address } = req.body;

    const currentUser = await userModel.findById(userId);

    let imageUrl = req.body.image;
    let public_id: string | undefined;

    if (req.body.image && req.body.image.startsWith("data:image")) {
      try {
        if (currentUser?.deliveryPartnerInfo?.documents?.nin?.image) {
          await deleteCloudinaryImage(
            currentUser.deliveryPartnerInfo.documents.nin.image,
            "documents"
          );
        }

        const uploadResult = await uploadToCloudinary(
          req.body.image,
          "documents"
        );
        imageUrl = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      } catch (uploadError: any) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload NIN image",
          error: uploadError.message,
        });
      }
    }

    const updateData: any = {
      "deliveryPartnerInfo.documents.nin.number": number,
      "deliveryPartnerInfo.documents.nin.house_address": house_address,
      "deliveryPartnerInfo.documents.nin.image": imageUrl,
    };
    if (public_id)
      updateData["deliveryPartnerInfo.documents.nin.public_id"] = public_id;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "NIN information updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Submit for Verification
export const submitForVerification = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            "deliveryPartnerInfo.verificationStatus.submitted": true,
          },
        },
        { new: true, runValidators: true }
      )
      .select("-password -otp -otpExpires");

    res.json({
      success: true,
      message: "Application submitted for verification successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Upgrade user type
export const upgradeUserType = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { newUserType } = req.body;

    // Validate new user type
    const validUserTypes = [
      "customer",
      "delivery_partner",
      "admin",
      "super admin",
    ];
    if (!validUserTypes.includes(newUserType)) {
      return next(new ErrorHandler("Invalid user type", 400));
    }

    // Find user
    const user = await userModel.findById(id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Update user type
    user.userType = newUserType as any;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User type upgraded to ${newUserType} successfully`,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
      },
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
};

export const updateWorkingHours = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?._id;
  const { start, end, timezone } = req.body;

  const user = await userModel.findById(userId).select("+deliveryPartnerInfo");

  if (!user || user.userType !== "delivery_partner") {
    return next(new ErrorHandler("Access denied", 403));
  }

  if (!user.deliveryPartnerInfo) {
    user.deliveryPartnerInfo = {} as any;
  }

  user.deliveryPartnerInfo.workingHours = {
    start,
    end,
    timezone: timezone || "UTC",
  };

  await user.save();

  res.status(200).json({
    success: true,
    message: "Working hours updated successfully",
    workingHours: user.deliveryPartnerInfo.workingHours,
  });
};

// Update location
export const updateLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?._id;
  const { lat, lng } = req.body;

  console.log(lat, "location api lat", lng, "locations settings api lng");

  const user = await userModel.findById(userId).select("+deliveryPartnerInfo");

  if (!user || user.userType !== "delivery_partner") {
    return next(new ErrorHandler("Access denied", 403));
  }

  if (!user.deliveryPartnerInfo) {
    user.deliveryPartnerInfo = {} as any;
  }

  // Update location using GeoJSON format
  user.deliveryPartnerInfo.location = {
    coordinates: {
      type: "Point",
      coordinates: [lng, lat], // IMPORTANT: MongoDB uses [longitude, latitude] order
    },
    lastUpdated: new Date(),
  };

  await user.save();

  // Return in a format your frontend expects
  res.status(200).json({
    success: true,
    message: "Location updated successfully",
    location: {
      coordinates: {
        lat: user.deliveryPartnerInfo.location.coordinates.coordinates[1],
        lng: user.deliveryPartnerInfo.location.coordinates.coordinates[0],
      },
      lastUpdated: user.deliveryPartnerInfo.location.lastUpdated,
    },
  });
};

// Update status
export const updateStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?._id;
  const { status } = req.body;

  console.log(status, "delivery update status");

  const validStatuses = ["available", "offline"];

  if (!validStatuses.includes(status)) {
    return next(new ErrorHandler("Invalid status", 400));
  }

  const user = await userModel.findById(userId).select("+deliveryPartnerInfo");

  if (!user || user.userType !== "delivery_partner") {
    return next(new ErrorHandler("Access denied", 403));
  }

  if (!user.deliveryPartnerInfo) {
    user.deliveryPartnerInfo = {} as any;
  }

  user.deliveryPartnerInfo.status = status;
  user.deliveryPartnerInfo.online = status !== "offline";

  await user.save();

  res.status(200).json({
    success: true,
    message: `Status updated to ${status}`,
    status: user.deliveryPartnerInfo.status,
    online: user.deliveryPartnerInfo.online,
  });
};

// Add bank account
export const addBank = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user.id; // from auth middleware
    const {
      bank_name,
      account_number,
      account_name,
      isActive = false,
    } = req.body;

    // Validate required fields
    if (!bank_name || !account_number || !account_name) {
      return res.status(400).json({
        success: false,
        message: "Bank name, account number, and account name are required",
      });
    }

    // Optional: ensure only one bank can be active
    const user = await userModel.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // If this bank is set as active, deactivate others
    if (isActive) {
      user.bank.forEach((bank) => (bank.isActive = false));
    }

    // Add new bank
    user.bank.push({
      bank_name,
      account_number,
      account_name,
      isActive,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      data: user.bank[user.bank.length - 1], // return the newly added bank
    });
  } catch (error) {
    next(error);
  }
};

// Delete bank account
export const deleteBank = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user.id;
    const { bankId } = req.params;

    const user = await userModel.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Find bank index
    const bankIndex = user.bank.findIndex(
      (bank) => bank._id.toString() === bankId
    );
    if (bankIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Bank account not found" });
    }

    // Remove bank
    user.bank.splice(bankIndex, 1);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Bank account deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Get languages for the authenticated delivery partner
export const getLanguages = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Include both userType and languages
    const user = await userModel
      .findById(userId)
      .select("userType deliveryPartnerInfo.languages");

    console.log(user, "dhhhd");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.userType !== "delivery_partner") {
      return res.status(403).json({ message: "Not a delivery partner" });
    }

    const languages = user.deliveryPartnerInfo?.languages || [];
    console.log(languages, "langddh");

    res.status(200).json({ success: true, languages });
  } catch (error) {
    console.error("Error fetching languages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update languages for the authenticated delivery partner
export const updateLanguages = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { languages } = req.body;
    if (!languages || !Array.isArray(languages)) {
      return res.status(400).json({ message: "Languages must be an array" });
    }
    // Optional: validate each language against allowed list
    const allowedLanguages = [
      "English",
      "Pidgin",
      "Yoruba",
      "Hausa",
      "Igbo",
      "French",
      "Other",
    ];
    const validLanguages = languages.every((lang: string) =>
      allowedLanguages.includes(lang)
    );
    if (!validLanguages) {
      return res.status(400).json({ message: "Invalid language(s)" });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.userType !== "delivery_partner") {
      return res.status(403).json({ message: "Not a delivery partner" });
    }

    // Update languages
    if (!user.deliveryPartnerInfo) {
      user.deliveryPartnerInfo = {} as any; // should exist for delivery partners, but just in case
    }
    user.deliveryPartnerInfo.languages = languages;
    await user.save();

    res
      .status(200)
      .json({ success: true, languages: user.deliveryPartnerInfo.languages });
  } catch (error) {
    console.error("Error updating languages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleOverallVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const { verified } = req.body; // optional: explicitly set true/false, otherwise toggle

    const user = await userModel.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Ensure user is a delivery partner
    if (user.userType !== "delivery_partner") {
      return res.status(400).json({
        success: false,
        message:
          "User is not a delivery partner. Verification status only applies to delivery partners.",
      });
    }

    // ✅ Initialize deliveryPartnerInfo and verificationStatus if they don't exist
    if (!user.deliveryPartnerInfo) {
      user.deliveryPartnerInfo = {} as any;
    }
    if (!user.deliveryPartnerInfo.verificationStatus) {
      user.deliveryPartnerInfo.verificationStatus = {
        identity: false,
        vehicle: false,
        backgroundCheck: false,
        submitted: false,
        verified: false,
      };
    }

    // Toggle or set the verified flag
    if (typeof verified === "boolean") {
      user.deliveryPartnerInfo.verificationStatus.verified = verified;
    } else {
      user.deliveryPartnerInfo.verificationStatus.verified =
        !user.deliveryPartnerInfo.verificationStatus.verified;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `Overall verification status updated to ${user.deliveryPartnerInfo.verificationStatus.verified}`,
      verificationStatus: user.deliveryPartnerInfo.verificationStatus.verified,
    });
  } catch (error) {
    next(error);
  }
};
