import express from 'express';
import { protectAdmin } from '../middleware/auth.js';
import {
  // Admin functions
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  generateId,
  // User functions
  login,
  checkSession,
  getTestTypes,
  getTemplates,
  startTest,
  submitAnswer,
  finishTest,
  getWrongQuestions,
  markLearned,
  startWrongTest,
  getTestResult,
  getUserInfo,
  // Default language
  updateDefaultLang,
  // Saved questions
  saveQuestion,
  removeSavedQuestion,
  getSavedQuestions,
  startSavedTest,
  // Exam
  getExamQuestions,
  startExamTest,
  // Internal test
  startInternalTest,
  // History
  getTestHistory,
  // Random test
  startRandomTest,
  // Imageless test
  startImagelessTest,
  // Full test
  startFullTest,
  // Paused full test
  pauseFullTest,
  getPausedFullTest,
  deletePausedFullTest,
} from '../controllers/errorTrackingController.js';

const router = express.Router();

// ==================== ADMIN ROUTES ====================
// These routes require admin authentication
router.get('/users', protectAdmin, getUsers);
router.post('/users', protectAdmin, createUser);
router.put('/users/:id', protectAdmin, updateUser);
router.delete('/users/:id', protectAdmin, deleteUser);
router.get('/generate-id', protectAdmin, generateId);

// ==================== USER ROUTES ====================
// These routes are for frontend users (using odamId for identification)
router.post('/login', login);
router.get('/check-session/:odamId', checkSession);
router.get('/user/:odamId', getUserInfo);
router.post('/update-default-lang', updateDefaultLang);
router.get('/types', getTestTypes);
router.get('/templates', getTemplates);
router.post('/start', startTest);
router.post('/submit-answer', submitAnswer);
router.post('/finish', finishTest);
router.get('/wrong-questions/:odamId', getWrongQuestions);
router.post('/mark-learned', markLearned);
router.post('/start-wrong-test', startWrongTest);
router.get('/result/:id', getTestResult);

// Saved questions routes
router.post('/save-question', saveQuestion);
router.post('/remove-saved-question', removeSavedQuestion);
router.get('/saved-questions/:odamId', getSavedQuestions);
router.post('/start-saved-test', startSavedTest);

// Exam routes
router.get('/exam-questions', getExamQuestions);
router.post('/start-exam-test', startExamTest);

// Internal test route (ichki test)
router.post('/start-internal-test', startInternalTest);

// Random test route
router.post('/start-random-test', startRandomTest);

// Imageless test route (rasmsiz savollar)
router.post('/start-imageless-test', startImagelessTest);

// Full test route (barcha shablonlardan barcha savollar)
router.post('/start-full-test', startFullTest);

// Paused full test routes (vaqtincha to'xtatish)
router.post('/pause-full-test', pauseFullTest);
router.get('/paused-full-test/:odamId', getPausedFullTest);
router.delete('/paused-full-test/:odamId', deletePausedFullTest);

// History route
router.get('/history/:odamId', getTestHistory);

export default router;
