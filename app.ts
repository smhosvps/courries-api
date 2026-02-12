import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import path from "path";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
const server = http.createServer(app);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
});

app.use(
  cors({
    origin: ["http://localhost:3000"],
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

// routes
app.use(
  "/api/v1",
  userRouter,
  deliveryRouter,
  notificationRouter,
  deleteReasonRouter,
  walletRouter,
  deliveryStatusRouter
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// testing api
app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    success: true,
    message: "api is working",
  });
});

// unknown routes
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Route ${req.originalUrl} not found!`) as any;
  err.statusCode = 404;
  next(err);
});

// use errorhandler
app.use(ErrorMiddleware);

export { app, server, io };
