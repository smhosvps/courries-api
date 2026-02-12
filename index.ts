import { v2 as cloudinary } from 'cloudinary';
import connectDB from "./utils/db";
import { app, io } from './app';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as dotenv from 'dotenv';

dotenv.config();

// cloudinary config
cloudinary.config({ 
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_SECRET_KEY
});

const PORT = process.env.PORT || 8400;

const startServer = async () => {
    try {
        // Connect to the database
        await connectDB();

        // Create HTTP server using the Express app
        const httpServer = http.createServer(app);

        // Attach Socket.IO to the HTTP server
        if (io instanceof SocketIOServer) {
            io.attach(httpServer);
        }

        // Start the HTTP server
        httpServer.listen(PORT, () => {
            console.log(`Server is connected with port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();