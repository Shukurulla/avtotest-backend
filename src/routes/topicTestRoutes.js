import express from 'express';
import {
  getLessons,
  getTopics,
  getTopicQuestions,
  startTopicTest,
  finishTopicTest,
} from '../controllers/topicTestController.js';

const router = express.Router();

// ==================== USER ROUTES ====================
router.get('/lessons', getLessons);
router.get('/topics/:lessonExternalId', getTopics);
router.get('/questions/:topicId', getTopicQuestions);
router.post('/start', startTopicTest);
router.post('/finish', finishTopicTest);

export default router;
