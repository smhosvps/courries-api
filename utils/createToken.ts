// // src/utils/token.ts
// import jwt from 'jsonwebtoken';

// export const createToken = (userId: string): string => {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
//     expiresIn: '3d',
//   });
// };


// utils/token.ts - Your existing file looks good, but here's a version with userType included

import jwt from 'jsonwebtoken';

export const createToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, {
    expiresIn: '3d',
  });
};

export const setTokenCookie = (res: any, token: string): void => {
  const cookieOptions = {
    expires: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };

  res.cookie('token', token, cookieOptions);
};