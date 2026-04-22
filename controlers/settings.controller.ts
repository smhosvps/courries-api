import { Request, Response } from 'express';
import settingModel, { ISetting } from '../models/setting.model';


// Get settings (create default if none exists)
export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await settingModel.findOne();
    if (!settings) {
      settings = await settingModel.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Update settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const updates: Partial<ISetting> = req.body;
    const settings = await settingModel.findOneAndUpdate({}, updates, {
      new: true,
      upsert: true,
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};