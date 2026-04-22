import { Response } from "express";
import userModel from "../models/user_model";


// get user by id
export const getUserByIdC = async (id: string, res: Response) => {
    const user = await userModel.findById(id);
    if (user) {
        res.status(201).json({
            success: true,
            user
        })
    }
}

// get all users 

export const getAllUsersService = async (res: Response) => {
    const users = await userModel.find().sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        users
    })
}

export const updateUsersRoleService = async (res: Response, id: string, role: string, isSuspend: boolean, reason: string) => {
    const users = await userModel.findByIdAndUpdate(id, { role, isSuspend, reason }, { new: true });
    res.status(200).json({
        success: true,
        users
    })
}



