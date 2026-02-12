import { NextFunction, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export const validateRegistration = [
  body('surname').notEmpty().isString().trim(),
  body('firstName').notEmpty().isString().trim(),
  body('dateOfBirth').isISO8601().toDate(),
  body('age').isInt({ min: 6, max: 17 }),
  body('parentName').notEmpty().trim(),
  body('parentAddress').notEmpty().trim(),
  body('parentPhone').notEmpty().isMobilePhone('any'),
  body('schoolName').notEmpty().trim(),
  body('languagesSpoken').isArray({ min: 1 }),
  body('bornAgain').isIn(['yes', 'no']),
  body('baptizedHolySpirit').isIn(['yes', 'no']),
  body('baptizedWater').isIn(['yes', 'no']),
  body('studentSignature').notEmpty().trim(),
  body('studentDate').isISO8601().toDate(),
  body('parentSignature').notEmpty().trim(),
  body('parentConsentDate').isISO8601().toDate(),
  body('rulesAgreement').isBoolean().toBoolean(),
  body('parentConsent').isBoolean().toBoolean(),

  (req:Request, res:Response, next:NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];