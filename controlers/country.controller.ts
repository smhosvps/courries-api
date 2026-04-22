import {  Request, Response } from "express";
import { CountryModel } from "../models/country.model";

export const getCountries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const countries = await CountryModel.find().sort({ createdAt: -1 });
    res.status(200).json(countries);
  } catch (error:any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single country
// @route   GET /api/countries/:id
export const getCountryById = async (req: Request, res: Response) => {
  try {
    const country = await CountryModel.findById(req.params.id);
    if (!country) {
      return res.status(404).json({ message: "Country not found" });
    }
    res.status(200).json(country);
  } catch (error:any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a country
// @route   POST /api/countries

export const createCountry = async (req: Request, res: Response) => {
  try {
    const { name, distanceType, weightType, status } = req.body;

    // Check if country already exists
    const existingCountry = await CountryModel.findOne({ name });
    if (existingCountry) {
      return res.status(400).json({ message: "Country already exists" });
    }

    const country = await CountryModel.create({
      name,
      distanceType,
      weightType,
      status,
    });

    res.status(201).json(country);
  } catch (error:any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a country
// @route   PUT /api/countries/:id

export const updateCountry = async (req: Request, res: Response) => {
  try {
    const { name, distanceType, weightType, status } = req.body;

    const country = await CountryModel.findById(req.params.id);
    if (!country) {
      return res.status(404).json({ message: "Country not found" });
    }

    // Check name uniqueness if name is being changed
    if (name && name !== country.name) {
      const existingCountry = await CountryModel.findOne({ name });
      if (existingCountry) {
        return res.status(400).json({ message: "Country name already exists" });
      }
    }

    country.name = name || country.name;
    country.distanceType = distanceType || country.distanceType;
    country.weightType = weightType || country.weightType;
    country.status = status || country.status;

    const updatedCountry = await country.save();
    res.status(200).json(updatedCountry);
  } catch (error:any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a country
// @route   DELETE /api/countries/:id

export const deleteCountry = async (req: Request, res: Response) => {
  try {
    const country = await CountryModel.findById(req.params.id);
    if (!country) {
      return res.status(404).json({ message: "Country not found" });
    }

    await country.deleteOne();
    res.status(200).json({ message: "Country removed successfully" });
  } catch (error:any) {
    res.status(500).json({ message: error.message });
  }
};