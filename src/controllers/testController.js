import { asyncHandler, AppError } from '../utils/errorHandler.js';
import Question from '../models/Question.js';
import Template from '../models/Template.js';
import TestResult from '../models/TestResult.js';
import { TEST_TYPES, LANGUAGES, TEST_DURATIONS } from '../config/constants.js';

const TEMPLATES_CACHE_TTL_MS = 5 * 60 * 1000;
let templatesCache = null;
let templatesCacheAt = 0;

export const invalidateTemplatesCache = () => {
  templatesCache = null;
  templatesCacheAt = 0;
};

export const getTestTypes = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        {
          type: TEST_TYPES.FULL,
          name: '50 savollik test',
          duration: TEST_DURATIONS[50] / 60,
          description: 'Barcha savollardan tasodifiy tanlangan 50 ta savol',
        },
        {
          type: TEST_TYPES.TEMPLATE,
          name: '20 savollik test',
          duration: TEST_DURATIONS[20] / 60,
          description: 'Tanlangan shablondan 20 ta savol',
        },
        {
          type: TEST_TYPES.IMAGELESS_20,
          name: 'Rasmsiz savollar (20 ta)',
          duration: TEST_DURATIONS['imageless20'] / 60,
          description: 'Rasmsiz savollardan tasodifiy tanlangan 20 ta savol',
        },
        {
          type: TEST_TYPES.IMAGELESS_100,
          name: 'Rasmsiz savollar (100 ta)',
          duration: TEST_DURATIONS['imageless100'] / 60,
          description: 'Rasmsiz savollardan tasodifiy tanlangan 100 ta savol',
        },
      ],
    },
  });
});

export const getTemplates = asyncHandler(async (req, res) => {
  if (templatesCache && Date.now() - templatesCacheAt < TEMPLATES_CACHE_TTL_MS) {
    return res.json(templatesCache);
  }

  const templates = await Template.find({ status: 1 }).sort({ templateId: 1 }).lean();
  const templateIds = templates.map((t) => t.templateId);

  const counts = await Question.aggregate([
    { $match: { status: 1, 'templates.id': { $in: templateIds } } },
    {
      $project: {
        langId: 1,
        uniqueTemplateIds: {
          $setUnion: [
            { $map: { input: '$templates', as: 't', in: '$$t.id' } },
            [],
          ],
        },
      },
    },
    { $unwind: '$uniqueTemplateIds' },
    { $match: { uniqueTemplateIds: { $in: templateIds } } },
    {
      $group: {
        _id: { template: '$uniqueTemplateIds', lang: '$langId' },
        count: { $sum: 1 },
      },
    },
  ]);

  const lookup = {};
  for (const c of counts) {
    if (!lookup[c._id.template]) lookup[c._id.template] = {};
    lookup[c._id.template][c._id.lang] = c.count;
  }

  const templatesWithCounts = templates.map((t) => ({
    ...t,
    questionCounts: {
      uzbek: lookup[t.templateId]?.[LANGUAGES.UZBEK] || 0,
      russian: lookup[t.templateId]?.[LANGUAGES.RUSSIAN] || 0,
      uzbekCyrillic: lookup[t.templateId]?.[LANGUAGES.CYRILLIC_UZBEK] || 0,
    },
  }));

  templatesCache = {
    success: true,
    count: templatesWithCounts.length,
    data: templatesWithCounts,
  };
  templatesCacheAt = Date.now();

  res.json(templatesCache);
});

export const startTest = asyncHandler(async (req, res, next) => {
  const { type, templateId, langId } = req.body;

  if (!type || !langId) {
    return next(new AppError('Please provide test type and language', 400));
  }

  if (![TEST_TYPES.FULL, TEST_TYPES.TEMPLATE, TEST_TYPES.IMAGELESS_20, TEST_TYPES.IMAGELESS_100].includes(type)) {
    return next(new AppError('Invalid test type', 400));
  }

  if (![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(langId)) {
    return next(new AppError('Invalid language', 400));
  }

  if (type === TEST_TYPES.TEMPLATE && !templateId) {
    return next(new AppError('Template ID is required for 20-question test', 400));
  }

  let questions = [];

  if (type === TEST_TYPES.IMAGELESS_20 || type === TEST_TYPES.IMAGELESS_100) {
    // Rasmsiz savollar - body da type=2 (rasm) bo'lmagan savollarni olish
    const questionCount = type === TEST_TYPES.IMAGELESS_20 ? 20 : 100;
    console.log(`🔍 Finding ${questionCount} imageless questions for lang ${langId}`);

    // Aggregation pipeline: rasmi yo'q savollarni topish va random tanlash
    questions = await Question.aggregate([
      { $match: { langId, status: 1 } },
      // body arrayda type=2 (rasm) bor yoki yo'qligini tekshirish
      {
        $addFields: {
          hasImage: {
            $anyElementTrue: {
              $map: {
                input: '$body',
                as: 'item',
                in: { $eq: ['$$item.type', 2] }
              }
            }
          }
        }
      },
      // Faqat rasmi yo'q savollarni olish
      { $match: { hasImage: false } },
      // hasImage fieldni olib tashlash
      { $project: { hasImage: 0 } },
      // Random tanlash
      { $sample: { size: questionCount } }
    ]);

    console.log(`📊 Found ${questions.length} imageless questions`);

    if (questions.length < questionCount) {
      return next(new AppError(`Rasmsiz savollar yetarli emas. Mavjud: ${questions.length} ta`, 400));
    }
  } else if (type === TEST_TYPES.FULL) {
    // Get random 50 questions from all questions in selected language
    const totalCount = await Question.countDocuments({ langId, status: 1 });

    if (totalCount < 50) {
      return next(new AppError('Not enough questions available for 50-question test', 400));
    }

    // Random 50 ta savol olish
    questions = await Question.aggregate([
      { $match: { langId, status: 1 } },
      { $sample: { size: 50 } },
    ]);
  } else {
    // Get questions from specific template
    console.log(`🔍 Finding questions for template ${templateId}, lang ${langId}`);

    const templateQuestions = await Question.find({
      langId,
      status: 1,
      'templates.id': templateId,
    }).lean();

    console.log(`📊 Found ${templateQuestions.length} questions for template ${templateId}`);

    if (templateQuestions.length === 0) {
      console.error(`❌ No questions found for template ${templateId}`);
      return next(
        new AppError('No questions available for this template', 400)
      );
    }

    // Agar 20 tadan kam bo'lsa ham, mavjud barcha savollarni qaytarish
    const questionCount = Math.min(templateQuestions.length, 20);

    // Har doim bir xil tartibda (questionId bo'yicha)
    questions = templateQuestions
      .sort((a, b) => a.questionId - b.questionId)
      .slice(0, questionCount);

    console.log(`✅ Returning ${questions.length} questions for template ${templateId}`);
  }

  // Shablon nomini olish (agar templateId bor bo'lsa)
  let templateName = null;
  if (templateId) {
    const template = await Template.findOne({ templateId });
    templateName = template ? template.name : null;
  }

  res.json({
    success: true,
    data: {
      testType: type,
      templateId: templateId || null,
      templateName,
      langId,
      questions: questions,
      duration: TEST_DURATIONS[type] || 25 * 60, // savol soniga qarab
      startedAt: new Date(),
    },
  });
});

export const submitAnswer = asyncHandler(async (req, res, next) => {
  const { questionId, langId, answerId } = req.body;

  if (!questionId || !langId || !answerId) {
    return next(new AppError('Please provide questionId, langId, and answerId', 400));
  }

  const question = await Question.findOne({ questionId, langId })
    .select('answers answerDescription answerVideo')
    .lean();

  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  const correctAnswer = question.answers.find((a) => a.check === 1);
  const isCorrect = correctAnswer && correctAnswer.id === answerId;

  res.json({
    success: true,
    data: {
      isCorrect,
      correctAnswerId: correctAnswer?.id,
      answerDescription: question.answerDescription,
      answerVideo: question.answerVideo,
    },
  });
});

export const finishTest = asyncHandler(async (req, res, next) => {
  const { testType, templateId, questions, startedAt } = req.body;

  if (!testType || !questions || !startedAt) {
    return next(new AppError('Please provide all required fields', 400));
  }

  const completedAt = new Date();
  const duration = Math.floor((completedAt - new Date(startedAt)) / 1000);

  let correctCount = 0;
  let incorrectCount = 0;

  // Verify each answer
  for (const q of questions) {
    if (q.isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  }

  const totalQuestions = questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);

  // 10% xato qoidasi: agar 10% dan 1 ga teng bo'lmasa, 0 xatoga ruxsat beriladi
  const maxAllowedErrors = Math.floor(totalQuestions * 0.1);
  const actualMaxErrors = maxAllowedErrors < 1 ? 0 : maxAllowedErrors;

  // O'tish sharti: xato javoblar ruxsat berilgan maksimum xatodan kam yoki teng bo'lishi kerak
  const passed = incorrectCount <= actualMaxErrors;

  // Save test result
  const testResult = await TestResult.create({
    userId: req.user._id,
    testType,
    templateId: templateId || null,
    questions,
    correctCount,
    incorrectCount,
    score,
    duration,
    startedAt: new Date(startedAt),
    completedAt,
    passed,
  });

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
    },
  });
});

export const getTestHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const total = await TestResult.countDocuments({ userId: req.user._id });

  const results = await TestResult.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-questions');

  res.json({
    success: true,
    count: results.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: results,
  });
});

export const getTestResult = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await TestResult.findById(id);

  if (!result) {
    return next(new AppError('Test result not found', 404));
  }

  if (result.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return next(new AppError('Not authorized to view this result', 403));
  }

  res.json({
    success: true,
    data: result,
  });
});

export const changeLanguage = asyncHandler(async (req, res, next) => {
  const { questionIds, langId } = req.body;

  if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
    return next(new AppError('Please provide question IDs array', 400));
  }

  if (![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(langId)) {
    return next(new AppError('Invalid language', 400));
  }

  console.log(`🔄 Changing language to ${langId} for ${questionIds.length} questions`);

  // Fetch the same questions but in the new language
  const questions = await Question.find({
    questionId: { $in: questionIds },
    langId,
    status: 1,
  }).lean();

  console.log(`📊 Found ${questions.length}/${questionIds.length} questions in language ${langId}`);

  if (questions.length === 0) {
    return next(
      new AppError('No questions available in the selected language', 400)
    );
  }

  // Sort questions to match the original order
  const questionMap = new Map(questions.map((q) => [q.questionId, q]));
  const sortedQuestions = questionIds.map((id) => questionMap.get(id)).filter(Boolean);

  console.log(`✅ Returning ${sortedQuestions.length} questions in new language`);

  res.json({
    success: true,
    data: {
      questions: sortedQuestions,
      langId,
    },
  });
});