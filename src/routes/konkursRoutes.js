import express from 'express';
import {
  registerParticipant,
  startTest,
  submitAnswer,
  finishTest,
  getParticipants,
  getParticipantById,
  getStatistics,
  getTemplatesWithQuestions,
  getSelectedQuestions,
  saveSelectedQuestions,
  deleteAllParticipants,
  deleteParticipant,
} from '../controllers/konkursController.js';

const router = express.Router();

// Public routes (no auth required for konkurs)
router.post('/register', registerParticipant);
router.post('/start', startTest);
router.post('/submit-answer', submitAnswer);
router.post('/finish', finishTest);

// Admin routes (for admin panel)
router.get('/participants', getParticipants);
router.get('/participants/:id', getParticipantById);
router.get('/statistics', getStatistics);

// Question management routes (for admin panel)
router.get('/templates-with-questions', getTemplatesWithQuestions);
router.get('/selected-questions', getSelectedQuestions);
router.post('/save-selected-questions', saveSelectedQuestions);

// Delete routes (for admin panel)
router.delete('/participants', deleteAllParticipants);
router.delete('/participants/:id', deleteParticipant);

export default router;
