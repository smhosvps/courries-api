import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import path from "path";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middleware/error";
import userRouter from "./routes/user.routes";

dotenv.config();

import { fileURLToPath } from "url";
import deliveryRouter from "./routes/deliveries";
import { notificationRouter } from "./routes/notifications.routes";
import deleteReasonRouter from "./routes/delete_reason.routes";
import walletRouter from "./routes/wallet.routes";
import deliveryStatusRouter from "./routes/deliveryStatusRoutes";
import privacyRouter from "./routes/privacy.routes";
import faqRouter from "./routes/faq.routes";
import contactSupportRouter from "./routes/contact.routes";
import reportRouter from "./routes/report.routes";
import deliveryOptionRouter from "./routes/deliveryOptionRoutes";
import userModel from "./models/user_model";
import mongoose from "mongoose";
import packageRouter from "./routes/packageTypeRoutes";
import reviewsRouter from "./routes/review_routes";
import adminDeliveryRouter from "./routes/adminDeliveryRoutes";
import withdrawRouter from "./routes/withdrawalRoutes";
import keyRouter from "./routes/settings.routes";
import transferRoute from "./routes/transfer.routes";
import geofencingRoute from "./routes/geofencing.routes";
import countryRoute from "./routes/country.routes";
import cityRoute from "./routes/city.route";
import couponRoute from "./routes/coupon.routes";
import { initializeSocket } from "./socket";
import deliverOrderRoutes from "./routes/deliveryStatus.routes";
import earningRouter from "./routes/earningAdmin.routes";
import dashboardRoute from "./routes/dashboard.routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
const server = http.createServer(app);

app.set("trust proxy", 1); // Trust first proxy

// Global request logger middleware - Logs all incoming requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Log request details
  console.log(
    `[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url
    } - Params: ${JSON.stringify(req.params)} - Query: ${JSON.stringify(
      req.query
    )}`
  );

  // Check for "undefined" in parameters to catch issues early
  Object.keys(req.params).forEach((key) => {
    if (req.params[key] === "undefined") {
      console.error(
        `⚠️ [${requestId}] WARNING: Route ${req.method} ${req.url} received "undefined" as ${key}`
      );
    }
  });

  // Add request ID and start time to request object for tracking
  (req as any).requestId = requestId;
  (req as any).startTime = start;

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? "ERROR" : "INFO";
    console.log(
      `[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url
      } - Status: ${res.statusCode} - Duration: ${duration}ms`
    );
  });

  next();
});

// Global error catcher for unhandled promise rejections
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
  console.error("Promise:", promise);

  // Log detailed error information
  if (reason instanceof Error) {
    console.error("Stack trace:", reason.stack);
  }

  // Don't crash - just log and continue
  console.log("⚠️ Unhandled rejection caught. Application continues running.");
});

// Global error catcher for uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", error.message);
  console.error("Stack trace:", error.stack);

  // Don't crash - log and continue
  console.log("⚠️ Uncaught exception caught. Application continues running.");

  // Optionally notify administrators here (email, Slack, etc.)
});

// Global ObjectId validation middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Validate all ObjectId parameters in the request
  const validateObjectIdParams = () => {
    const invalidParams: string[] = [];

    // Check params
    Object.keys(req.params).forEach((key) => {
      const value = req.params[key];
      // If the parameter looks like it should be an ObjectId (common patterns)
      if (
        key.toLowerCase().includes("id") &&
        typeof value === "string" &&
        value.length > 0
      ) {
        // Check for invalid string values
        if (["undefined", "null", "NaN"].includes(value)) {
          invalidParams.push(`${key}: '${value}' (invalid string)`);
        }
        // Check if it's supposed to be ObjectId but isn't valid
        else if (
          !mongoose.Types.ObjectId.isValid(value) &&
          // Only flag if it looks like it might be an ObjectId (24 chars hex)
          value.length === 24 &&
          /^[a-f0-9]+$/.test(value.toLowerCase())
        ) {
          // This could be a valid ObjectId that failed validation
        }
      }
    });

    return invalidParams;
  };

  const invalidParams = validateObjectIdParams();
  if (invalidParams.length > 0) {
    console.warn(
      `⚠️ Invalid ObjectId parameters detected: ${invalidParams.join(", ")}`
    );
    // Don't block the request here - let individual routes handle validation
  }

  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000, // limit each IP to 100,000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`🚨 Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later.",
    });
  },
});

app.use(limiter);

// Initialize Socket.IO
const io = initializeSocket(server);

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://https://api.courries.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Enhanced global error handler for Mongoose CastError (ObjectId errors)
app.use((req: Request, res: Response, next: NextFunction) => {
  // This middleware will catch any CastError before it reaches the route handler
  const originalSend = res.send;

  res.send = function (body: any) {
    // If there's an error in the response chain, handle it
    if (body && body.success === false && body.error) {
      // Check for ObjectId errors
      if (
        body.error.includes("Cast to ObjectId") ||
        body.error.includes("24 character hex string")
      ) {
        console.error(`🛑 ObjectId Error Detected:`);
        console.error(`  URL: ${req.method} ${req.url}`);
        console.error(`  Params:`, req.params);
        console.error(`  Query:`, req.query);
        console.error(`  Error: ${body.error}`);

        // Return a cleaner error message to client
        body.message = "Invalid ID format. Please check the provided ID.";
        body.error = "INVALID_ID_FORMAT"; // Sanitize error for production
      }
    }

    return originalSend.call(this, body);
  };

  next();
});

// Helper function to sanitize request body for logging (remove sensitive data)
function sanitizeBody(body: any): any {
  if (!body || typeof body !== "object") return body;

  const sanitized = { ...body };
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "creditCard",
    "cvv",
    "ssn",
    "pin",
    "email",
    "phone",
    "address",
  ];

  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = "***REDACTED***";
    }
  });

  return sanitized;
}

// Enhanced global error handler middleware
const GlobalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal Server Error";

  // Log the error with request context
  console.error(`🔥 [GLOBAL ERROR] - ${new Date().toISOString()}`);
  console.error(`  URL: ${req.method} ${req.url}`);
  console.error(`  Status: ${err.statusCode}`);
  console.error(`  Message: ${err.message}`);
  console.error(`  Stack: ${err.stack}`);
  console.error(`  Params:`, req.params);
  console.error(`  Query:`, req.query);
  if (req.body && Object.keys(req.body).length > 0) {
    console.error(`  Body (sanitized):`, sanitizeBody(req.body));
  }
  console.error(`  Request ID: ${(req as any).requestId || "N/A"}`);

  // Handle specific error types
  let errorResponse = {
    success: false,
    message: err.message,
    error: process.env.NODE_ENV === "production" ? undefined : err.stack,
    requestId: (req as any).requestId,
  };

  // Mongoose CastError (ObjectId errors)
  if (err.name === "CastError" || err.name === "BSONError") {
    errorResponse.message = "Invalid ID format. Please check the provided ID.";
    errorResponse.error = "INVALID_ID_FORMAT";
    err.statusCode = 400;
  }

  // Mongoose ValidationError
  if (err.name === "ValidationError") {
    errorResponse.message = "Validation failed";
    errorResponse.error = Object.values(err.errors).map((e: any) => e.message);
    err.statusCode = 400;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    errorResponse.message = "Duplicate field value entered";
    err.statusCode = 400;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    errorResponse.message = "Invalid token";
    err.statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    errorResponse.message = "Token expired";
    err.statusCode = 401;
  }

  // Rate limit errors
  if (err.statusCode === 429) {
    errorResponse.message = "Too many requests, please try again later";
  }

  // Production error sanitization
  if (process.env.NODE_ENV === "production") {
    // Don't expose stack traces in production
    delete errorResponse.error;

    // Generic messages for 500 errors
    if (err.statusCode === 500) {
      errorResponse.message = "Something went wrong. Please try again later.";
    }
  }

  res.status(err.statusCode).json(errorResponse);
};

// routes
app.use(
  "/api/v1",
  userRouter,
  deliveryRouter,
  notificationRouter,
  deleteReasonRouter,
  walletRouter,
  deliveryStatusRouter,
  privacyRouter,
  faqRouter,
  contactSupportRouter,
  reportRouter,
  notificationRouter,
  deliveryOptionRouter,
  packageRouter,
  reviewsRouter,
  adminDeliveryRouter,
  withdrawRouter,
  keyRouter,
  transferRoute,
  geofencingRoute,
  countryRoute,
  cityRoute,
  couponRoute,
  deliverOrderRoutes,
  earningRouter,
  dashboardRoute
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check endpoint for monitoring
app.get("/health", (req: Request, res: Response) => {
  const health = {
    status: "UP",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  };

  res.status(200).json(health);
});

// testing api
app.get("/courries-x", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    success: true,
    message: "api is working",
  });
});

// Global 404 handler
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Route ${req.originalUrl} not found!`) as any;
  err.statusCode = 404;

  console.warn(`🚨 404 Not Found: ${req.method} ${req.originalUrl}`);

  next(err);
});

// Add this temporary debug endpoint to check your user model
app.get("/debug/user-model", async (req, res) => {
  try {
    // Check if model exists
    console.log("User model exists:", !!userModel);

    // Check collection
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      "Collections:",
      collections.map((c) => c.name)
    );

    // Try to count users
    const count = await userModel.countDocuments();
    console.log("Total users in DB:", count);

    res.json({
      modelExists: !!userModel,
      collections: collections.map((c) => c.name),
      userCount: count,
    });
  } catch (error:any) {
    console.error("Debug endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Use the global error handler
app.use(GlobalErrorHandler);

// use errorhandler
app.use(ErrorMiddleware);

export { app, server, io };
