// routes/contactSupport.routes.ts
import express from "express";
import { authenticate } from "../middleware/auth";
import {
  createCountry,
  deleteCountry,
  getCountries,
  getCountryById,
  updateCountry,
} from "../controlers/country.controller";

const countryRoute = express.Router();

// Public routes
countryRoute.get("/get-countries", authenticate, getCountries);
countryRoute.get("/get-country/:id", authenticate, getCountryById);
countryRoute.post("/create-country", authenticate, createCountry);
countryRoute.put("/update-country/:id", authenticate, updateCountry);
countryRoute.delete("/delete-country/:id", authenticate, deleteCountry);

export default countryRoute;
