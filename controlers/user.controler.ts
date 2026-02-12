import { CatchAsyncError } from "./../middleware/catchAsyncErrors";
import { NextFunction, Request, Response } from "express";
import * as dotenv from "dotenv";
import ErrorHandler from "../utils/ErrorHandler";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendMail";
import {
  getAllUsersService,
  getUserByIdC,
  updateUsersRoleService,
} from "../services/user.service";
import cron from "node-cron";
import cloudinary from "cloudinary";
import bcrypt from "bcryptjs";
import { generateOTP } from "../utils/otpUtils";
import { createToken } from "../utils/createToken";
import userModel from "../models/user_model";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet";
import Notification from "../models/notificationModel";
import { fileURLToPath } from "url";

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
    const allowedRoles = ["customer", "delivery_partner", "admin"];
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
      message: "Login successful",
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
    // 1. Destructure only email, otp, and purpose. Remove phoneNumber.
    const { email, otp, purpose } = req.body;

    const hasEmail = !!email?.trim();

    // 2. Simplified validation: Email is now the only required identifier.
    if (!hasEmail) {
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

    // 3. Find user by email (Simplified query)
    const query = { email: email.trim() };

    const user: any = await userModel.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // --- OTP Verification Logic (Remains unchanged) ---

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

    // if (user.otp !== otp) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid OTP code",
    //   });
    // }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    // --- Action Logic ---

    if (purpose === "register") {
      // Update verification status
      user.isVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();

      // Generate authentication token
      const token = createToken(user._id);

      // Create wallet for user
      const wallet = new Wallet({
        user: user._id,
        balance: user.userType === "delivery_partner" ? 0 : 100, // Bonus for customers
      });

      await wallet.save();

      await Notification.create({
        recipient: user._id,
        type: "Appreciation fund",
        content: `Congratulations ${user.firstName}! Your account has been successfully verified. As a token of our appreciation, Courries has funded your wallet with 100 NGN. Thank you!`,
      });

      // Return standardized user response
      return res.status(200).json({
        success: true,
        message: "Account verified successfully",
        token,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
      });
    } else {
      // For password reset, just verify OTP and return success
      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        data: {
          _id: user._id,
          email: user.email,
          canResetPassword: true,
        },
      });
    }
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

    console.log(newAddress, "new address")

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

    console.log(updates, id, addressId, "update")
    
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
      if (key !== '_id' && key !== '__v') {
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
    const user = await userModel.findById(id).select('addresses');

    if (!user) {
      return next(new ErrorHandler('User not found', 404));
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

export const updatePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const { currentPassword, newPassword } = req.body as IUpdateUserPassword;
    console.log(currentPassword, newPassword, "id");

    // Check if the authenticated user is trying to update their own password
    if (userId !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You can only update your own password." });
    }

    const user = await userModel.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordMatch = await user.comparePassword(currentPassword);

    if (!isPasswordMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    next(error);
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
        "phoneNumber",
        "role",
        "dateOfBirth",
        "address",
        "country",
        "email",
        "gender",
        "phone_number_one",
      ];

      // Create update object with only the fields that have meaningful values
      const updateData: any = {};

      allowedUpdates.forEach((field) => {
        // Only include fields that are defined and not empty strings
        if (req.body[field] !== undefined && req.body[field] !== "") {
          // For phoneNumber, validate the format if it's provided
          if (field === "phoneNumber") {
            const e164Regex = /^\+[1-9]\d{1,14}$/;
            if (!e164Regex.test(req.body[field])) {
              throw new Error("Please enter a valid E.164 phone number");
            }
          }
          updateData[field] = req.body[field];
        }
      });

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
