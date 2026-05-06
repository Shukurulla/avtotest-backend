import express from 'express';
import {
  getUsers,
  createUser,
  createMultipleUsers,
  updateUser,
  deleteUser,
  resetUserDevice,
  triggerSync,
  syncSingleTemplate,
  getSyncStatus,
  getSyncHistory,
  getStats,
  getTemplates,
} from '../controllers/adminController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(protect);
router.use(admin);

// User management
router.get('/users', getUsers);
router.post('/users', createUser);
router.post('/users/bulk', createMultipleUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.post('/users/:id/reset-device', resetUserDevice);

// Sync management
router.post('/sync/trigger', triggerSync);
router.post('/sync/template', syncSingleTemplate);
router.get('/sync/status', getSyncStatus);
router.get('/sync/history', getSyncHistory);

// Templates
router.get('/templates', getTemplates);

// Stats
router.get('/stats', getStats);

export default router;
