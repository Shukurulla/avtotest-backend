import express from 'express';
import {
  getTestTypes,
  getTemplates,
  startTest,
  submitAnswer,
  finishTest,
  getTestHistory,
  getTestResult,
  changeLanguage,
} from '../controllers/testController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/types', getTestTypes);
router.get('/templates', getTemplates);
router.post('/start', startTest);
router.post('/submit-answer', submitAnswer);
router.post('/finish', finishTest);
router.post('/change-language', changeLanguage);
router.get('/history', getTestHistory);
router.get('/result/:id', getTestResult);

export default router;
