import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Delivery } from '../models/Delivery';

// Extend Express Request to include user from auth middleware
interface AuthRequest extends Request {
    user?: {
        _id: string;
        role: 'admin' | 'partner' | 'customer';
    };
}

// Helper to build role-based filter
const buildUserFilter = (user: AuthRequest['user']) => {
    if (!user) return {};
    if (user.role === 'admin') return {};
    if (user.role === 'partner') return { deliveryPartner: new mongoose.Types.ObjectId(user._id) };
    if (user.role === 'customer') return { customer: new mongoose.Types.ObjectId(user._id) };
    return {};
};

// Helper for pagination
const getPagination = (page: number = 1, limit: number = 20) => {
    const skip = (page - 1) * limit;
    return { skip, limit: Math.min(limit, 100) };
};

// GET /deliveries/pending
export const getPendingDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, startDate, endDate, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        // 1. User‑based restrictions (never includes paymentStatus)
        const userFilter = buildUserFilter(req.user);

        // 2. Core order conditions: only pending + paid
        const orderCondition = {
            status: 'pending',
            paymentStatus: 'paid'
        };

        // 3. Date range filter (optional)
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) })
                }
            };
        }

        // 4. Tracking ID search (optional)
        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        // Merge all filters – userFilter applies first, then orderCondition, etc.
        const filter = {
            ...userFilter,
            ...orderCondition,
            ...dateFilter,
            ...trackingFilter
        };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone'),
            Delivery.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error in getPendingDeliveries:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /deliveries/assigned
export const getAssignedDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, startDate, endDate, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);
        // "assigned" status – you may also include "request_accepted" if needed
        const statusFilter = { status: 'assigned' };

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) }),
                },
            };
        }

        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        const filter = { ...userFilter, ...statusFilter, ...dateFilter, ...trackingFilter };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getAssignedDeliveries:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /deliveries/picked-up-in-transit
export const getPickedUpAndInTransitDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, startDate, endDate, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);
        const statusFilter = { status: { $in: ['picked_up', 'in_transit'] } };

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) }),
                },
            };
        }

        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        const filter = { ...userFilter, ...statusFilter, ...dateFilter, ...trackingFilter };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getPickedUpAndInTransitDeliveries:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /deliveries/delivered
export const getDeliveredDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, startDate, endDate, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);
        const statusFilter = { status: 'delivered' };

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) }),
                },
            };
        }

        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        const filter = { ...userFilter, ...statusFilter, ...dateFilter, ...trackingFilter };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getDeliveredDeliveries:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /deliveries/canceled
export const getCanceledDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, startDate, endDate, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);
        const statusFilter = { status: 'cancelled' };

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) }),
                },
            };
        }

        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        const filter = { ...userFilter, ...statusFilter, ...dateFilter, ...trackingFilter };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone')
                .populate('cancelledBy', 'name email role'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getCanceledDeliveries:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


// GET /deliveries/today
export const getTodayOrders = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, trackingId } = req.query;
        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);

        // Get start of today (00:00:00) and end of today (23:59:59.999)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        // ✅ Only include paid orders (no status restriction)
        const filter = {
            ...userFilter,
            createdAt: { $gte: startOfToday, $lte: endOfToday },
            paymentStatus: 'paid',   // 👈 added condition
            ...trackingFilter,
        };

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getTodayOrders:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /deliveries/all
export const getAllOrders = async (req: AuthRequest, res: Response) => {
    try {
        const {
            page,
            limit,
            status,
            startDate,
            endDate,
            trackingId,
            deliveryPartner,
            customer,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const { skip, limit: limitNum } = getPagination(Number(page), Number(limit));

        const userFilter = buildUserFilter(req.user);

        // Status filter (single status or array)
        let statusFilter = {};
        if (status) {
            if (Array.isArray(status)) {
                statusFilter = { status: { $in: status } };
            } else {
                statusFilter = { status };
            }
        }

        // Date range filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {
                createdAt: {
                    ...(startDate && { $gte: new Date(startDate as string) }),
                    ...(endDate && { $lte: new Date(endDate as string) }),
                },
            };
        }

        // Tracking ID search
        let trackingFilter = {};
        if (trackingId) {
            trackingFilter = { trackingId: { $regex: trackingId, $options: 'i' } };
        }

        // Filter by specific delivery partner (admin only? we'll respect userFilter anyway)
        let partnerFilter = {};
        if (deliveryPartner && req.user?.role === 'admin') {
            partnerFilter = { deliveryPartner: new mongoose.Types.ObjectId(deliveryPartner as string) };
        }

        // Filter by specific customer (admin only)
        let customerFilter = {};
        if (customer && req.user?.role === 'admin') {
            customerFilter = { customer: new mongoose.Types.ObjectId(customer as string) };
        }

        // ✅ Mandatory: only return paid orders
        const paymentFilter = { paymentStatus: 'paid' };

        const filter = {
            ...userFilter,
            ...statusFilter,
            ...dateFilter,
            ...trackingFilter,
            ...partnerFilter,
            ...customerFilter,
            ...paymentFilter,   // 👈 added here
        };

        // Sorting
        const sort: Record<string, 1 | -1> = {};
        sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

        const [deliveries, total] = await Promise.all([
            Delivery.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .populate('customer', 'name email phone')
                .populate('deliveryPartner', 'name email phone')
                .populate('cancelledBy', 'name email role'),
            Delivery.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: deliveries,
            pagination: {
                page: Number(page) || 1,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error in getAllOrders:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


export const getDeliveryById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const delivery = await Delivery.findById(id)
            .populate('customer', 'firstName lastName email phone avatar')
            .populate('deliveryPartner', 'email phone firstName lastName avatar')
            .populate('cancelledBy', 'firstName lastName email');

        if (!delivery) {
            return res.status(404).json({ success: false, message: 'Delivery not found' });
        }

        // Optionally check authorization: admin or owner
        res.status(200).json({ success: true, data: delivery });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};