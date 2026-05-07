import { asyncHandler, AppError } from '../utils/errorHandler.js';
import Lesson from '../models/Lesson.js';
import Topic from '../models/Topic.js';
import TopicQuestion from '../models/TopicQuestion.js';
import ErrorTrackingUser from '../models/ErrorTrackingUser.js';
import ErrorTrackingTestResult from '../models/ErrorTrackingTestResult.js';
import ActiveTest from '../models/ActiveTest.js';
import { LANGUAGES, getTestDurationByCount } from '../config/constants.js';
import { emitTestStarted, emitTestFinished } from '../config/socket.js';

// Get all lessons
export const getLessons = asyncHandler(async (req, res) => {
  const lessons = await Lesson.find({ status: 1 })
    .sort({ externalId: 1 });

  res.json({
    success: true,
    count: lessons.length,
    data: lessons,
  });
});

// Get topics for a specific lesson
export const getTopics = asyncHandler(async (req, res, next) => {
  const { lessonExternalId } = req.params;

  if (!lessonExternalId) {
    return next(new AppError('Darslik ID kiritilishi shart', 400));
  }

  const topics = await Topic.find({
    lessonExternalId: parseInt(lessonExternalId),
    status: 1
  }).sort({ topicId: 1 });

  res.json({
    success: true,
    count: topics.length,
    data: topics,
  });
});

// Get questions for a specific topic (for admin/debug)
export const getTopicQuestions = asyncHandler(async (req, res, next) => {
  const { topicId } = req.params;
  const { langId = 1 } = req.query;

  if (!topicId) {
    return next(new AppError('Topic ID kiritilishi shart', 400));
  }

  const questions = await TopicQuestion.find({
    topicId: parseInt(topicId),
    langId: parseInt(langId),
    status: 1
  });

  res.json({
    success: true,
    count: questions.length,
    data: questions,
  });
});

// Start topic test
export const startTopicTest = asyncHandler(async (req, res, next) => {
  const { odamId, topicId, langId } = req.body;

  if (!odamId || !topicId || !langId) {
    return next(new AppError('odamId, topicId va langId kiritilishi shart', 400));
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError('Foydalanuvchi topilmadi', 404));
  }

  if (![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(parseInt(langId))) {
    return next(new AppError('Noto\'g\'ri til', 400));
  }

  // Get topic info
  const topic = await Topic.findOne({ topicId: parseInt(topicId) });
  if (!topic) {
    return next(new AppError('Mavzu topilmadi', 404));
  }

  // Check if topic has questions
  if (!topic.questionCount || topic.questionCount === 0) {
    return next(new AppError('Bu mavzuda test mavjud emas', 400));
  }

  // Get questions for this topic from database
  const questions = await TopicQuestion.find({
    topicId: parseInt(topicId),
    langId: parseInt(langId),
    status: 1,
  }).sort({ order: 1 }).lean();

  if (questions.length === 0) {
    return next(new AppError('Bu mavzuda savollar topilmadi', 400));
  }

  // Get lesson info for template name
  const lesson = await Lesson.findOne({ externalId: topic.lessonExternalId });
  const templateName = lesson ? lesson.name.uz : topic.name.uz;

  // Get time limit from topic
  const timeLimit = topic.topicActionLimit?.timeLimit || 600; // default 10 minutes

  const startedAt = new Date();

  // Create ActiveTest for monitoring
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType: 'topic',
    templateName: `${templateName} - ${topic.name.uz}`,
    totalQuestions: questions.length,
    startedAt,
  });

  // Emit socket event
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType: 'topic',
    templateName: `${templateName} - ${topic.name.uz}`,
    totalQuestions: questions.length,
    startedAt,
    status: 'active',
  });

  res.json({
    success: true,
    data: {
      testType: 'topic',
      topicId: parseInt(topicId),
      topicName: topic.name,
      lessonName: lesson ? lesson.name : null,
      langId: parseInt(langId),
      questions,
      duration: getTestDurationByCount(questions.length),
      startedAt,
      activeTestId: activeTest._id,
    },
  });
});

// Finish topic test
export const finishTopicTest = asyncHandler(async (req, res, next) => {
  const { odamId, topicId, langId, questions, startedAt, activeTestId } = req.body;

  if (!odamId || !topicId || !langId || !questions || !startedAt) {
    return next(new AppError('Barcha maydonlar to\'ldirilishi shart', 400));
  }

  // Verify user exists (faqat kerakli fieldlarni olamiz, og'ir wrongQuestions massivini emas)
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true })
    .select('createdBy firstName lastName')
    .lean();
  if (!user) {
    return next(new AppError('Foydalanuvchi topilmadi', 404));
  }

  const completedAt = new Date();
  const duration = Math.floor((completedAt - new Date(startedAt)) / 1000);

  let correctCount = 0;
  let incorrectCount = 0;
  const wrongQuestionIds = [];

  for (const q of questions) {
    if (q.isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
      wrongQuestionIds.push({
        questionId: q.questionId,
        langId: q.langId,
      });
    }
  }

  const totalQuestions = questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const maxAllowedErrors = Math.floor(totalQuestions * 0.1);
  const actualMaxErrors = maxAllowedErrors < 1 ? 0 : maxAllowedErrors;
  const passed = incorrectCount <= actualMaxErrors;

  // Save test result
  const testResult = await ErrorTrackingTestResult.create({
    odamId,
    testType: 'topic',
    templateId: topicId,
    langId,
    questions,
    correctCount,
    incorrectCount,
    score,
    duration,
    startedAt: new Date(startedAt),
    completedAt,
    passed,
  });

  // Add wrong questions to user's wrongQuestions array (atomik bulkWrite)
  if (wrongQuestionIds.length > 0) {
    const seen = new Set();
    const ops = [];
    const now = new Date();

    for (const wq of wrongQuestionIds) {
      const qId = parseInt(wq.questionId);
      const lId = parseInt(wq.langId);
      const key = `${qId}-${lId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 1) Mavjud yozuvni learned=true → false ga qaytarish (testResultId yangilanadi)
      ops.push({
        updateOne: {
          filter: { odamId, isActive: true },
          update: {
            $set: {
              'wrongQuestions.$[elem].learned': false,
              'wrongQuestions.$[elem].addedAt': now,
              'wrongQuestions.$[elem].testResultId': testResult._id,
            },
          },
          arrayFilters: [
            { 'elem.questionId': qId, 'elem.langId': lId, 'elem.learned': true },
          ],
        },
      });
      // 2) Yozuv yo'q bo'lsa qo'shish
      ops.push({
        updateOne: {
          filter: {
            odamId,
            isActive: true,
            wrongQuestions: { $not: { $elemMatch: { questionId: qId, langId: lId } } },
          },
          update: {
            $push: {
              wrongQuestions: {
                questionId: qId,
                langId: lId,
                addedAt: now,
                testResultId: testResult._id,
                learned: false,
              },
            },
          },
        },
      });
    }
    await ErrorTrackingUser.bulkWrite(ops, { ordered: false });
  }

  // Update ActiveTest and emit socket event
  if (activeTestId) {
    const activeTest = await ActiveTest.findById(activeTestId);
    if (activeTest) {
      activeTest.status = 'finished';
      activeTest.finishedAt = completedAt;
      activeTest.duration = duration;
      activeTest.correctCount = correctCount;
      activeTest.incorrectCount = incorrectCount;
      activeTest.answeredCount = totalQuestions;
      activeTest.score = score;
      activeTest.passed = passed;
      await activeTest.save();

      emitTestFinished(user.createdBy.toString(), {
        _id: activeTest._id,
        odamId,
        odamFullName: `${user.firstName} ${user.lastName}`,
        testType: 'topic',
        templateName: activeTest.templateName,
        totalQuestions,
        correctCount,
        incorrectCount,
        score,
        duration,
        passed,
        finishedAt: completedAt,
        status: 'finished',
      });
    }
  }

  res.json({
    success: true,
    data: {
      id: testResult._id,
      correctCount,
      incorrectCount,
      score,
      totalQuestions,
      duration,
      passed,
      maxAllowedErrors: actualMaxErrors,
      newWrongQuestions: wrongQuestionIds.length,
    },
  });
});
