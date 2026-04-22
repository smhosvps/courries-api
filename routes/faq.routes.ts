// routes/faq.routes.ts
import express from "express";
import { authenticate, } from "../middleware/auth";
import { createFaq, deleteFaq, getAllFaqs, getAllFaqsAdmin, getFaqById, reorderFaqs, toggleFaqStatus, updateFaq } from "../controlers/faq.controller";

const faqRouter = express.Router();

// Public routes
faqRouter.get("/get-faqs", getAllFaqs);
faqRouter.get("/get-faq/:id", getFaqById);

// Admin routes
faqRouter.post("/create-faq", authenticate, createFaq);
faqRouter.put("/update-faq/:id", authenticate, updateFaq);
faqRouter.delete("/delete-faq/:id", authenticate, deleteFaq);
faqRouter.patch("/toggle-faq/:id", authenticate, toggleFaqStatus);
faqRouter.post("/reorder-faqs", authenticate, reorderFaqs);
faqRouter.get("/get-admin-all-faqs", authenticate, getAllFaqsAdmin);

export default faqRouter;