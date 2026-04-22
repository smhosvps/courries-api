// routes/contactSupport.routes.ts
import express from "express";
import { authenticate} from "../middleware/auth";
import { addPhoneNumber, createContactSupport, getContactSupport, getContactSupportAdmin, removePhoneNumber, toggleContactStatus, togglePhoneStatus, updateContactSupport } from "../controlers/contact.controller";


const contactSupportRouter = express.Router();

// Public routes
contactSupportRouter.get("/get-contact", getContactSupport);

// Admin routes
contactSupportRouter.post(
  "/create-contact",
  authenticate,
//   authorizeRoles("admin"),
  createContactSupport
);

contactSupportRouter.put(
  "/update-contact/:id",
  authenticate,
  updateContactSupport
);

contactSupportRouter.get(
  "/get-admin-contact",
  authenticate,
  getContactSupportAdmin
);

contactSupportRouter.put(
  "/toggle-status/:id",
  authenticate,
  toggleContactStatus
);

contactSupportRouter.put(
  "/toggle-phone/:contactId/:phoneId",
  authenticate,
  togglePhoneStatus
);

contactSupportRouter.post(
  "/add-phone/:id",
  authenticate,
  addPhoneNumber
);

contactSupportRouter.delete(
  "/remove-phone/:contactId/:phoneId",
  authenticate,
  removePhoneNumber
);

export default contactSupportRouter;