import { Request, Response } from 'express';
import earningSettingModel from '../models/earningSetting.model';

// Get current percentages
export const getEarningSettings = async (req: Request, res: Response) => {
  try {
    const settings = await earningSettingModel.getSingleton(); 
    res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update percentages (admin only)
export const updateEarningSettings = async (req: Request, res: Response) => {
  try {
    const { adminPercentage, riderPercentage } = req.body;
    if (adminPercentage === undefined && riderPercentage === undefined) {
      return res.status(400).json({ success: false, message: 'No values to update' });
    }

    const settings = await earningSettingModel.getSingleton();
    if (adminPercentage !== undefined) {
      if (adminPercentage < 0 || adminPercentage > 100) {
        return res.status(400).json({ success: false, message: 'Admin percentage must be between 0 and 100' });
      }
      settings.adminPercentage = adminPercentage;
    }
    if (riderPercentage !== undefined) {
      if (riderPercentage < 0 || riderPercentage > 100) {
        return res.status(400).json({ success: false, message: 'Rider percentage must be between 0 and 100' });
      }
      settings.riderPercentage = riderPercentage;
    }
    // Optional: ensure they sum to 100 (or allow independent)
    if (settings.adminPercentage + settings.riderPercentage !== 100) {
      return res.status(400).json({ success: false, message: 'Percentages must sum to 100' });
    }

    settings.updatedBy = (req as any).user?._id;
    settings.updatedAt = new Date();
    await settings.save();

    res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};