import express from "express";
import { protect } from "../middleware/auth.js";
import { protectAdmin } from "../middleware/auth.js";
import {
  trackTestStart,
  trackTestProgress,
  trackTestFinish,
  getActiveTests,
  getFinishedTests,
  getStats,
  getUsers,
} from "../controllers/nukusMonitoringController.js";

const router = express.Router();

// Frontend tracking (user auth)
router.post("/track-start", protect, trackTestStart);
router.post("/track-progress", protect, trackTestProgress);
router.post("/track-finish", protect, trackTestFinish);

// Admin monitoring (admin auth)
router.get("/active", protectAdmin, getActiveTests);
router.get("/finished", protectAdmin, getFinishedTests);
router.get("/stats", protectAdmin, getStats);
router.get("/users", protectAdmin, getUsers);

export default router;
