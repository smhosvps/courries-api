import { Request, Response } from 'express';
import mongoose from 'mongoose';
import cityModel from '../models/city.model';

const toObjectIdArray = (ids: any): mongoose.Types.ObjectId[] => {
  if (!ids) return [];
  
  const arr = Array.isArray(ids) ? ids : [ids];
  
  return arr
    .filter((id): id is string | mongoose.Types.ObjectId => 
      id != null && 
      (typeof id === 'string' || id instanceof mongoose.Types.ObjectId)
    )
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id);
};


export const getCities = async (req: Request, res: Response) => {
  try {
    const cities = await cityModel
      .find()
      .populate('country', 'name')
      .populate('geofenced', 'name center isActive createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(cities);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: 'Failed to retrieve cities', error: error.message });
  }
};

export const getCityById = async (req: Request, res: Response) => {
  try {
    const city = await cityModel
      .findById(req.params.id)
      .populate('country', 'name')
      .populate('geofenced', 'name center isActive createdAt');
    if (!city) return res.status(404).json({ message: 'City not found' });
    res.status(200).json(city);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createCity = async (req: Request, res: Response) => {
  try {
    const existing = await cityModel.findOne({ name: req.body.name });
    if (existing) return res.status(400).json({ message: 'City already exists' });

    const geofenced = toObjectIdArray(req.body.geofenced);

    const city = new cityModel({
      ...req.body,
      geofenced,
    });

    const saved = await city.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCity = async (req: Request, res: Response) => {
  try {
    const city = await cityModel.findById(req.params.id);
    if (!city) return res.status(404).json({ message: 'City not found' });

    if (req.body.name && req.body.name !== city.name) {
      const existing = await cityModel.findOne({ name: req.body.name });
      if (existing) return res.status(400).json({ message: 'City name already exists' });
    }

    if (req.body.geofenced !== undefined) {
      req.body.geofenced = toObjectIdArray(req.body.geofenced);
    }

    Object.assign(city, req.body);
    const updated = await city.save();
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteCity = async (req: Request, res: Response) => {
  try {
    const city = await cityModel.findById(req.params.id);
    if (!city) return res.status(404).json({ message: 'City not found' });
    await city.deleteOne();
    res.status(200).json({ message: 'City removed' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};