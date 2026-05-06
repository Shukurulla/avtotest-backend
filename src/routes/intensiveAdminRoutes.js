import express from "express";
import {
  getStats,
  getUsers,
  getActiveTests,
  getStatistics,
  getDeletedUsers,
} from "../controllers/intensiveAdminController.js";

const router = express.Router();

// Public (no auth) - bu alohida panel uchun
router.get("/stats", getStats);
router.get("/users", getUsers);
router.get("/active-tests", getActiveTests);
router.get("/statistics", getStatistics);
router.get("/deleted-users", getDeletedUsers);

export default router;
