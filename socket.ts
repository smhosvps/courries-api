import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";

// Store online users: userId -> socket.id
export const userSockets = new Map<string, string>();

let io: SocketIOServer;

export function initializeSocket(server: HTTPServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://192.168.102.51:8081",
        "http://192.168.102.34:8082",
        // Add your production frontend URLs
      ],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    },
    // Important: allow polling fallback and set path (optional)
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] New client connected: ${socket.id}`);

    socket.on("register", (userId: string) => {
      if (!userId) {
        console.log(`[Socket] ${socket.id} tried to register without userId`);
        return;
      }
      userSockets.set(userId, socket.id);
      (socket as any).userId = userId;
      console.log(`[Socket] User ${userId} registered (socket: ${socket.id})`);
    });

    socket.on("disconnect", () => {
      const userId = (socket as any).userId;
      if (userId) {
        userSockets.delete(userId);
        console.log(`[Socket] User ${userId} disconnected`);
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocket first.");
  }
  return io;
}