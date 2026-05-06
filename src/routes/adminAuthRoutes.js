import express from 'express';
import { adminLogin, adminRefreshToken, getAdminMe } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', adminLogin);
router.post('/refresh', adminRefreshToken);

// Protected routes
router.get('/me', protectAdmin, getAdminMe);

export default router;
