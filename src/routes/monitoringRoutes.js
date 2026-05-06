import express from "express";
import {
  getActiveTests,
  getFinishedTests,
  getFinishedTestsByDate,
  getTestStats,
  deleteActiveTest,
  deleteFinishedTest,
  deleteAllActiveTests,
  deleteAllFinishedTests,
  getInternalActiveTests,
  getInternalFinishedTests,
  getInternalTestResult,
} from "../controllers/monitoringController.js";
import { protectAdmin } from "../middleware/auth.js";

const router = express.Router();

// Barcha routelar himoyalangan (admin uchun)
router.use(protectAdmin);

// Faol testlarni olish
router.get("/active", getActiveTests);

// Tugallangan testlarni olish
router.get("/finished", getFinishedTests);

// Sana bo'yicha tugallangan testlarni olish
router.get("/finished-by-date", getFinishedTestsByDate);

// Statistika
router.get("/stats", getTestStats);

// Bitta faol testni o'chirish
router.delete("/active/:id", deleteActiveTest);

// Bitta tugallangan testni o'chirish
router.delete("/finished/:id", deleteFinishedTest);

// Barcha faol testlarni o'chirish
router.delete("/active-all", deleteAllActiveTests);

// Sana bo'yicha barcha tugallangan testlarni o'chirish
router.delete("/finished-all", deleteAllFinishedTests);

// Ichki test monitoring
router.get("/internal-active", getInternalActiveTests);
router.get("/internal-finished", getInternalFinishedTests);
router.get("/internal-result", getInternalTestResult);

export default router;
