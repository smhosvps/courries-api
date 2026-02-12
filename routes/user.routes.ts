import express from "express";
import {
  cancelDeletion,
  deleteUserInApp,
  forgotPasswordApi,
  getAllUsers,
  getCurrentUser,
  getSingleUser,
  getUser,
  getUserById,
  getUserInfo,
  getUsers,
  getUserStatus,
  logout,
  register,
  resendOTP,
  resetPasswordApi,
  updatePassword,
  updateUser,
  updateUserInfo,
  updateUserProfile,
  upDateUserRole,
  verifyOTP,
  login,
  deleteUser2,
  checkUserExists,
  editAddress,
  addAddress,
  removeAddress,
  getAddresses,
} from "../controlers/user.controler";
import { authenticate } from "../middleware/auth";

const userRouter = express.Router();

// check user api
userRouter.post("/check-user", checkUserExists);
// login user
userRouter.post("/login-customer", login);
// register user
userRouter.post("/register-user", register);
// verify Otp
userRouter.post("/verify-otp", verifyOTP);
userRouter.post("/reset-password", resetPasswordApi);
userRouter.post("/resent-otp", resendOTP);
userRouter.post("/logout", authenticate, logout);

userRouter.post("/user/addresses/:id", addAddress);
userRouter.put("/user/:id/addresses/:addressId", editAddress);
userRouter.delete("/user/:id/addresses/:addressId", removeAddress);
userRouter.get('/user/addresses/:id', getAddresses);

 







userRouter.delete("/delete-user-admin/:id", authenticate, deleteUser2);

userRouter.post("/forgot-password", forgotPasswordApi);

userRouter.get("/admin-all-users", authenticate, getUsers);

userRouter.get("/admin-all-users", authenticate, getUsers);

userRouter.delete("/smhos-user/:userId", deleteUserInApp);
userRouter.patch("/smhos-user/:id/cancel-deletion", cancelDeletion);
userRouter.get("/smhos-user/:id/status", getUserStatus);

userRouter.get("/single-user/:id", authenticate, getSingleUser);
userRouter.put("/admin-edit-users/:id", updateUser);

userRouter.get("/get-user-info/:userId", authenticate, getUserInfo);

userRouter.get("/get-users", getAllUsers);
userRouter.put("/user/:userId/password", authenticate, updatePassword);

userRouter.get("/user", authenticate, getUser);
userRouter.put("/update-user-info", authenticate, updateUserInfo);
userRouter.put("/update-user-avatar", authenticate, updateUserProfile);
userRouter.get("/users/:userId", authenticate, getUserById);

userRouter.put("/update-user-role", authenticate, upDateUserRole);

// test for chat
userRouter.get("/current", authenticate, getCurrentUser);

export default userRouter;
