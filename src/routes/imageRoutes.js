import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/auth.js';
import { AppError } from '../utils/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Protect images - require authentication
router.get('/:filename', protect, (req, res, next) => {
  const { filename } = req.params;

  // Security: prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    return next(new AppError('Invalid filename', 400));
  }

  const imagePath = path.join(__dirname, '../../images', filename);

  res.sendFile(imagePath, (err) => {
    if (err) {
      return next(new AppError('Image not found', 404));
    }
  });
});

export default router;
