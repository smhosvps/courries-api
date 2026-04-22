

// routes/contactSupport.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import { createCity, deleteCity, getCities, getCityById, updateCity } from "../controlers/city.control";


const cityRoute = express.Router();

// Public routes
cityRoute.get("/get-cities", authenticate, getCities);
cityRoute.get("/get-city/:id", authenticate, getCityById);
cityRoute.post("/create-city", authenticate, createCity);
cityRoute.put("/update-city/:id", authenticate, updateCity);
cityRoute.delete("/delete-city/:id", authenticate, deleteCity);

export default cityRoute;
