// middleware/upload.middleware.ts
import multer from 'multer';

// Simple memory storage
const storage = multer.memoryStorage();

// File filter for CSV only
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});