import { Request, Response } from "express";
import geofencingModel from "../models/geofence.model";

// Helper: Haversine distance
const cleanGeofenceData = (data: any) => {
  if (data.type === "circle") {
    delete data.polygon;      // remove polygon field entirely
    if (!data.center) throw new Error("Center required for circle");
  } else if (data.type === "polygon") {
    delete data.center;
    delete data.radius;
    if (!data.polygon || !data.polygon.coordinates) throw new Error("Polygon coordinates required");
  }
  return data;
};

// GET all geofences
export const getAllGeofencing = async (req: Request, res: Response) => {
  try {
    const geofences = await geofencingModel.find();
    res.json(geofences);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// POST create a geofence
export const createGeofencing = async (req: Request, res: Response) => {
  try {
    const cleaned = cleanGeofenceData(req.body);
    const newGeofence = new geofencingModel(cleaned);
    await newGeofence.save();
    res.status(201).json(newGeofence);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// PUT update a geofence
export const editGeofencing = async (req: Request, res: Response) => {
  try {
    const cleaned = cleanGeofenceData(req.body);
    const updated = await geofencingModel.findByIdAndUpdate(
      req.params.id,
      cleaned,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Geofence not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};


// DELETE a geofence
export const deleteGeofencing = async (req: Request, res: Response) => {
  try {
    const deleted = await geofencingModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Geofence not found" });
    }
    res.json({ message: "Geofence deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// POST check if a point is inside any geofence
export const checkGeofencing = async (req: Request, res: Response) => {
  const { lng, lat } = req.body; // [longitude, latitude]
  try {
    // Check circles
    const circles = await geofencingModel.find({ type: "circle" });
    let inside = false;
    for (const circle of circles) {
      if (!circle.center) continue;
      const distance = getDistanceFromLatLonInMeters(
        lat,
        lng,
        circle.center.coordinates[1],
        circle.center.coordinates[0]
      );
      if (distance <= (circle.radius ?? 0)) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      // Check polygons using $geoIntersects
      const point = { type: "Point", coordinates: [lng, lat] };
      const polygonMatch = await geofencingModel.findOne({
        type: "polygon",
        polygon: { $geoIntersects: { $geometry: point } },
      });
      inside = !!polygonMatch;
    }
    res.json({ inside });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};