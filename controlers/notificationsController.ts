import { NextFunction, Request, Response } from "express";
import Notification from "../models/notificationModel";


export const getNotificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const notifications = await Notification.find({ recipient: req.params.userId }).sort({ createdAt: -1  });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications', error });
    }
};

export const editNotificationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification', error }); 
    }
};


export const deleteNotificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting notification', error });
    }
};