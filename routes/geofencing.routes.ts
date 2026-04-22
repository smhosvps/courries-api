import express from "express";
import { authenticate } from "../middleware/auth"; // your auth middleware
import { checkGeofencing, createGeofencing, deleteGeofencing, editGeofencing, getAllGeofencing } from "../controlers/geofencing.controller";

const geofencingRoute = express.Router();

// Public routes
geofencingRoute.get("/geofences", getAllGeofencing);

// Protected routes (require authentication)
geofencingRoute.post("/geofences", authenticate, createGeofencing);
geofencingRoute.put("/geofences/:id", authenticate, editGeofencing);
geofencingRoute.delete("/geofences/:id", authenticate, deleteGeofencing);
geofencingRoute.post("/geofences/check", authenticate, checkGeofencing); // POST, not PUT

export default geofencingRoute;