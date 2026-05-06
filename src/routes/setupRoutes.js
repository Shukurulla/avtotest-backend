import express from 'express';
import {
  createDefaultAdmin,
  createDefaultStudent,
  createAllDefaults,
} from '../controllers/setupController.js';

const router = express.Router();

// Public routes - no authentication required
router.post('/create-admin', createDefaultAdmin);
router.post('/create-student', createDefaultStudent);
router.post('/create-all', createAllDefaults);

export default router;
