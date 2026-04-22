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
  updatePersonalInfo,
  updateOtherInfo,
  updateNin,
  submitForVerification,
  updateVehicleRegistration,
  updateInsurance,
  updateLicense,
  upgradeUserType,
  updateStatus,
  updateLocation,
  updateWorkingHours,
  loginDelivery,
  loginAdmin,
  appleLogin,
  googleSignIn,
  pushNotificationPlayerId,
  uploadUsersFromCSV,
  addUserBySuperAdmin,
  addBank,
  deleteBank,
  getLanguages,
  updateLanguages,
  checkUserExistsUser,
  googleSignInCustomer,
  appleLoginCustomer,
  toggleOverallVerification,
  changePassword,
  updateProfile,
  forgotPasswordAdminApi,
} from "../controlers/user.controler";
import { authenticate } from "../middleware/auth";
import { upload } from "../middleware/upload.middleware";

const userRouter = express.Router();

// check user api
userRouter.post("/check-user-delivery", checkUserExists);
userRouter.post("/check-user", checkUserExistsUser);
// login user
userRouter.post("/login-customer", login);
userRouter.post("/login-delivery", loginDelivery);
userRouter.post("/login-admin", loginAdmin);

userRouter.post('/auth/apple', appleLogin);
userRouter.post('/auth/apple/customer', appleLoginCustomer);


userRouter.post('/auth/google', googleSignIn);

userRouter.put('/users/:userId/verification-status', authenticate, toggleOverallVerification);


userRouter.post('/auth/google/customer', googleSignInCustomer);
// register user
userRouter.post("/register-user", register);
// verify Otp
userRouter.post("/verify-otp", verifyOTP);
userRouter.post("/reset-password", resetPasswordApi);
userRouter.post("/resent-otp", resendOTP);
userRouter.post("/logout", authenticate, logout);
userRouter.post("/add-user-admin", authenticate, addUserBySuperAdmin);
userRouter.post(
  '/upload-users-csv',
  authenticate,
  upload.single('csvFile'), // Changed to 'csvFile' for clarity
  uploadUsersFromCSV
);

// verification links
userRouter.put("/verify-rider/personal-info", authenticate, updatePersonalInfo);
userRouter.put("/verify-rider/other-info", authenticate, updateOtherInfo);
userRouter.put("/working-hours", authenticate, updateWorkingHours);
userRouter.put("/location-settings", authenticate, updateLocation);
userRouter.put("/driver-status", authenticate, updateStatus);
// Document routes
userRouter.put("/documents/license", authenticate, updateLicense);
userRouter.put("/documents/insurance", authenticate, updateInsurance);
userRouter.put(
  "/documents/vehicle-registration",
  authenticate,
  updateVehicleRegistration
);
userRouter.put("/documents/nin", authenticate, updateNin);
userRouter.post("/submit-verification", authenticate, submitForVerification);
userRouter.put("/upgrade-user-type/:id", authenticate, upgradeUserType);
//

userRouter.post("/user/addresses/:id", addAddress);
userRouter.put("/user/:id/addresses/:addressId", editAddress);
userRouter.delete("/user/:id/addresses/:addressId", removeAddress);
userRouter.get("/user/addresses/:id", getAddresses);

userRouter.delete("/delete-user-admin/:id", authenticate, deleteUser2);

userRouter.post("/forgot-password", forgotPasswordApi);
userRouter.post("/forgot-password-admin", forgotPasswordAdminApi);

userRouter.get("/admin-all-users", authenticate, getUsers);

userRouter.delete("/smhos-user/:userId", deleteUserInApp);
userRouter.patch("/smhos-user/:id/cancel-deletion", cancelDeletion);
userRouter.get("/smhos-user/:id/status", getUserStatus);

userRouter.get("/single-user/:id", authenticate, getSingleUser);
userRouter.put("/admin-edit-users/:id", updateUser);

userRouter.get("/get-user-info/:userId", authenticate, getUserInfo);

userRouter.get("/get-users", getAllUsers);

userRouter.get("/user", authenticate, getUser);
userRouter.put("/update-user-info", authenticate, updateUserInfo);
userRouter.put("/update-user-avatar", authenticate, updateUserProfile);
userRouter.get("/users/:userId", authenticate, getUserById);

userRouter.put("/update-user-role", authenticate, upDateUserRole);
userRouter.post("/update-push-token", authenticate, pushNotificationPlayerId);

userRouter.get("/get-languages", authenticate, getLanguages)
userRouter.put("/update-languages", authenticate, updateLanguages)


// test for chat
userRouter.get("/current", authenticate, getCurrentUser);
userRouter.post('/add-bank', authenticate, addBank);           // Add bank account
userRouter.delete('/delete-bank/:bankId', authenticate, deleteBank); // Delete bank account

// herre 
userRouter.put('/change-password', authenticate, changePassword);
userRouter.put('/profile-update-user', authenticate, updateProfile);

export default userRouter;
