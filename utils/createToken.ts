// src/utils/token.ts
import jwt from 'jsonwebtoken';

export const createToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '3d',
  });
};