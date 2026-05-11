import crypto from "crypto";
import { asyncHandler, AppError } from "../utils/errorHandler.js";
import ErrorTrackingUser from "../models/ErrorTrackingUser.js";
import ErrorTrackingTestResult from "../models/ErrorTrackingTestResult.js";
import Question from "../models/Question.js";
import Template from "../models/Template.js";
import ActiveTest from "../models/ActiveTest.js";
import PausedFullTest from "../models/PausedFullTest.js";
import {
  TEST_TYPES,
  LANGUAGES,
  TEST_DURATIONS,
  getTestDurationByCount,
} from "../config/constants.js";
import {
  emitTestStarted,
  emitTestProgress,
  emitTestFinished,
  emitInternalTestStarted,
  emitInternalTestProgress,
  emitInternalTestFinished,
} from "../config/socket.js";

const TEMPLATES_CACHE_TTL_MS = 5 * 60 * 1000;
let templatesCache = null;
let templatesCacheAt = 0;

export const invalidateTemplatesCache = () => {
  templatesCache = null;
  templatesCacheAt = 0;
};

const SESSION_CACHE_TTL_MS = 10 * 1000;
const sessionCache = new Map();
let sessionCacheAccesses = 0;

const EXAM_CACHE_TTL_MS = 2 * 60 * 1000;
const examQuestionsCache = new Map();

const maybeCleanupSessionCache = () => {
  if (++sessionCacheAccesses % 1000 !== 0) return;
  const now = Date.now();
  for (const [k, v] of sessionCache) {
    if (v.expiresAt <= now) sessionCache.delete(k);
  }
};

export const invalidateSessionCache = (odamId) => {
  if (odamId) sessionCache.delete(odamId);
};

// ==================== ADMIN FUNCTIONS ====================

// Get all error tracking users (admin) - faqat o'z yaratgan userlari
export const getUsers = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;

  // Aggregation: count'ni MongoDB'da hisoblab, og'ir arraylarni qaytarmaydi
  const usersWithCounts = await ErrorTrackingUser.aggregate([
    { $match: { createdBy: adminId } },
    {
      $addFields: {
        wrongQuestionsCount: {
          $size: {
            $filter: {
              input: { $ifNull: ["$wrongQuestions", []] },
              as: "q",
              cond: { $ne: ["$$q.learned", true] },
            },
          },
        },
      },
    },
    { $project: { wrongQuestions: 0, savedQuestions: 0 } },
    { $sort: { createdAt: -1 } },
  ]);

  res.json({
    success: true,
    count: usersWithCounts.length,
    data: usersWithCounts,
  });
});

// Create new user (admin)
export const createUser = asyncHandler(async (req, res, next) => {
  const {
    odamId,
    firstName,
    lastName,
    phoneNumber,
    courseStartDate,
    courseEndDate,
    dailyStartTime,
    dailyEndTime,
    coursePrice,
  } = req.body;
  const adminId = req.admin._id;

  if (!odamId || !firstName || !lastName || !phoneNumber) {
    return next(new AppError("Barcha maydonlarni to'ldiring", 400));
  }

  // Check if odamId already exists FOR THIS ADMIN
  // Boshqa adminlarda bir xil odamId bo'lishi mumkin
  const existingUser = await ErrorTrackingUser.findOne({
    odamId,
    createdBy: adminId,
  });
  if (existingUser) {
    return next(new AppError("Bu ID allaqachon mavjud", 400));
  }

  const user = await ErrorTrackingUser.create({
    odamId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phoneNumber: phoneNumber.trim(),
    courseStartDate: courseStartDate || null,
    courseEndDate: courseEndDate || null,
    dailyStartTime: dailyStartTime || "09:00",
    dailyEndTime: dailyEndTime || "18:00",
    coursePrice: coursePrice !== undefined && coursePrice !== "" ? Number(coursePrice) : null,
    createdBy: adminId,
  });

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      odamId: user.odamId,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      courseStartDate: user.courseStartDate,
      courseEndDate: user.courseEndDate,
      dailyStartTime: user.dailyStartTime,
      dailyEndTime: user.dailyEndTime,
      coursePrice: user.coursePrice,
      wrongQuestionsCount: 0,
      createdAt: user.createdAt,
    },
  });
});

// Update user (admin)
export const updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    firstName,
    lastName,
    phoneNumber,
    courseStartDate,
    courseEndDate,
    dailyStartTime,
    dailyEndTime,
    coursePrice,
  } = req.body;
  const adminId = req.admin._id;

  const user = await ErrorTrackingUser.findById(id);
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Admin faqat o'zi yaratgan userlarni tahrirlashi mumkin
  if (user.createdBy.toString() !== adminId.toString()) {
    return next(
      new AppError("Bu foydalanuvchini tahrirlash huquqingiz yo'q", 403),
    );
  }

  // Update fields
  if (firstName) user.firstName = firstName.trim();
  if (lastName) user.lastName = lastName.trim();
  if (phoneNumber) user.phoneNumber = phoneNumber.trim();
  if (courseStartDate !== undefined)
    user.courseStartDate = courseStartDate || null;
  if (courseEndDate !== undefined) user.courseEndDate = courseEndDate || null;
  if (dailyStartTime) user.dailyStartTime = dailyStartTime;
  if (dailyEndTime) user.dailyEndTime = dailyEndTime;
  if (coursePrice !== undefined)
    user.coursePrice = coursePrice !== "" && coursePrice !== null ? Number(coursePrice) : null;

  await user.save();

  res.json({
    success: true,
    data: {
      _id: user._id,
      odamId: user.odamId,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      courseStartDate: user.courseStartDate,
      courseEndDate: user.courseEndDate,
      dailyStartTime: user.dailyStartTime,
      dailyEndTime: user.dailyEndTime,
      coursePrice: user.coursePrice,
      wrongQuestionsCount:
        user.wrongQuestions?.filter((q) => !q.learned)?.length || 0,
      createdAt: user.createdAt,
    },
  });
});

// Delete user (admin)
export const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const adminId = req.admin._id;

  const user = await ErrorTrackingUser.findById(id);
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Admin faqat o'zi yaratgan userlarni o'chirishi mumkin
  if (user.createdBy.toString() !== adminId.toString()) {
    return next(
      new AppError("Bu foydalanuvchini o'chirish huquqingiz yo'q", 403),
    );
  }

  // Delete all test results for this user
  await ErrorTrackingTestResult.deleteMany({ odamId: user.odamId });

  // Delete user
  await ErrorTrackingUser.findByIdAndDelete(id);

  res.json({
    success: true,
    message: "Foydalanuvchi o'chirildi",
  });
});

// Generate random 5-digit ID (admin) - faqat shu admin uchun unique
export const generateId = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  let odamId;
  let isUnique = false;

  while (!isUnique) {
    odamId = Math.floor(10000 + Math.random() * 90000).toString();
    // Faqat shu admin uchun unique bo'lishi kerak
    const existing = await ErrorTrackingUser.findOne({
      odamId,
      createdBy: adminId,
    });
    if (!existing) {
      isUnique = true;
    }
  }

  res.json({
    success: true,
    data: { odamId },
  });
});

// ==================== USER FUNCTIONS ====================

// Login with odamId
export const login = asyncHandler(async (req, res, next) => {
  const { odamId, forceLogin } = req.body;

  if (!odamId) {
    return next(new AppError("ID kiritilishi shart", 400));
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });

  if (!user) {
    return next(new AppError("Bunday ID topilmadi", 404));
  }

  // Agar aktiv session mavjud bo'lsa va forceLogin emas
  if (user.currentSession && user.currentSession.sessionId && !forceLogin) {
    return res.json({
      success: true,
      data: {
        needConfirm: true,
        activeSession: {
          ip: user.currentSession.ip,
          userAgent: user.currentSession.userAgent,
          createdAt: user.currentSession.createdAt,
        },
      },
    });
  }

  // Yangi session yaratish
  const sessionId = crypto.randomUUID();
  const clientIp =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";
  user.currentSession = {
    sessionId,
    ip: clientIp,
    userAgent: req.headers["user-agent"] || "",
    createdAt: new Date(),
  };
  await user.save();
  sessionCache.delete(odamId);

  res.json({
    success: true,
    data: {
      odamId: user.odamId,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      defaultLangId: user.defaultLangId || 1,
      wrongQuestionsCount: user.wrongQuestions?.length || 0,
      sessionId,
    },
  });
});

// Check session validity (polling endpoint)
export const checkSession = asyncHandler(async (req, res) => {
  const { odamId } = req.params;
  const sessionId = req.headers["x-et-session-id"];

  if (!odamId || !sessionId) {
    return res.json({ success: true, data: { valid: false } });
  }

  maybeCleanupSessionCache();

  const cached = sessionCache.get(odamId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({
      success: true,
      data: { valid: cached.sessionId === sessionId },
    });
  }

  const user = await ErrorTrackingUser.findOne({
    odamId,
    isActive: true,
  })
    .select("currentSession")
    .lean();

  const realSessionId = user?.currentSession?.sessionId || null;
  sessionCache.set(odamId, {
    sessionId: realSessionId,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });

  res.json({
    success: true,
    data: { valid: realSessionId !== null && realSessionId === sessionId },
  });
});

// Get test types
export const getTestTypes = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        {
          type: TEST_TYPES.FULL,
          name: "50 savollik test",
          duration: TEST_DURATIONS[50] / 60,
          description: "Barcha savollardan tasodifiy tanlangan 50 ta savol",
        },
        {
          type: TEST_TYPES.TEMPLATE,
          name: "20 savollik test",
          duration: TEST_DURATIONS[20] / 60,
          description: "Tanlangan shablondan 20 ta savol",
        },
      ],
    },
  });
});

// Get templates
export const getTemplates = asyncHandler(async (req, res) => {
  if (templatesCache && Date.now() - templatesCacheAt < TEMPLATES_CACHE_TTL_MS) {
    return res.json(templatesCache);
  }

  const templates = await Template.find({ status: 1 }).sort({ templateId: 1 }).lean();
  const templateIds = templates.map((t) => t.templateId);

  const counts = await Question.aggregate([
    { $match: { status: 1, "templates.id": { $in: templateIds } } },
    {
      $project: {
        langId: 1,
        uniqueTemplateIds: {
          $setUnion: [
            { $map: { input: "$templates", as: "t", in: "$$t.id" } },
            [],
          ],
        },
      },
    },
    { $unwind: "$uniqueTemplateIds" },
    { $match: { uniqueTemplateIds: { $in: templateIds } } },
    {
      $group: {
        _id: { template: "$uniqueTemplateIds", lang: "$langId" },
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

// Start test
export const startTest = asyncHandler(async (req, res, next) => {
  const { odamId, type, templateId, langId } = req.body;

  if (!odamId || !type || !langId) {
    return next(
      new AppError("odamId, test type va til kiritilishi shart", 400),
    );
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (![TEST_TYPES.FULL, TEST_TYPES.TEMPLATE].includes(type)) {
    return next(new AppError("Noto'g'ri test turi", 400));
  }

  if (
    ![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(
      langId,
    )
  ) {
    return next(new AppError("Noto'g'ri til", 400));
  }

  if (type === TEST_TYPES.TEMPLATE && !templateId) {
    return next(
      new AppError("20 savollik test uchun shablon tanlash shart", 400),
    );
  }

  let questions = [];

  if (type === TEST_TYPES.FULL) {
    const totalCount = await Question.countDocuments({ langId, status: 1 });

    if (totalCount < 50) {
      return next(
        new AppError("50 savollik test uchun yetarli savol yo'q", 400),
      );
    }

    questions = await Question.aggregate([
      { $match: { langId, status: 1 } },
      { $sample: { size: 50 } },
    ]);
  } else {
    const templateQuestions = await Question.find({
      langId,
      status: 1,
      "templates.id": templateId,
    }).lean();

    if (templateQuestions.length === 0) {
      return next(new AppError("Bu shablon uchun savollar topilmadi", 400));
    }

    const questionCount = Math.min(templateQuestions.length, 20);
    // Savollarni tasodifiy aralashtirish (Fisher-Yates shuffle)
    const shuffled = [...templateQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    questions = shuffled.slice(0, questionCount);
  }

  let templateName = null;
  if (templateId) {
    const template = await Template.findOne({ templateId });
    templateName = template ? template.name : null;
  }

  const startedAt = new Date();
  const testTypeForMonitor =
    type === TEST_TYPES.FULL ? "random50" : "template20";

  // ActiveTest yaratish (real-time monitoring uchun)
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType: testTypeForMonitor,
    templateName,
    totalQuestions: questions.length,
    startedAt,
  });

  // Socket orqali adminga xabar yuborish
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType: testTypeForMonitor,
    templateName,
    totalQuestions: questions.length,
    startedAt,
    status: "active",
  });

  res.json({
    success: true,
    data: {
      testType: type,
      templateId: templateId || null,
      templateName,
      langId,
      questions,
      duration:
        TEST_DURATIONS[type] || getTestDurationByCount(questions.length),
      startedAt,
      activeTestId: activeTest._id,
    },
  });
});

// Submit answer
export const submitAnswer = asyncHandler(async (req, res, next) => {
  const { questionId, langId, answerId, odamId, testType } = req.body;

  if (!questionId || !langId || !answerId) {
    return next(
      new AppError("questionId, langId va answerId kiritilishi shart", 400),
    );
  }

  const question = await Question.findOne({ questionId, langId })
    .select("answers answerDescription answerVideo")
    .lean();

  if (!question) {
    return next(new AppError("Savol topilmadi", 404));
  }

  const correctAnswer = question.answers.find((a) => a.check === 1);
  const isCorrect = correctAnswer && correctAnswer.id === answerId;

  // Xato javob bo'lsa, darhol wrongQuestions ga saqlash (ichki testdan tashqari)
  if (!isCorrect && odamId && testType !== 'internal') {
    const qId = parseInt(questionId);
    const lId = parseInt(langId);
    const now = new Date();

    // 1) Agar yozuv bor va learned=true bo'lsa — false ga qaytarish
    const flipped = await ErrorTrackingUser.updateOne(
      { odamId, isActive: true },
      {
        $set: {
          "wrongQuestions.$[elem].learned": false,
          "wrongQuestions.$[elem].addedAt": now,
        },
      },
      {
        arrayFilters: [
          { "elem.questionId": qId, "elem.langId": lId, "elem.learned": true },
        ],
      },
    );

    // 2) Yozuv umuman yo'q bo'lsa — yangi qo'shish (learned=false bo'lsa hech narsa qilmaymiz)
    if (flipped.modifiedCount === 0) {
      await ErrorTrackingUser.updateOne(
        {
          odamId,
          isActive: true,
          wrongQuestions: {
            $not: { $elemMatch: { questionId: qId, langId: lId } },
          },
        },
        {
          $push: {
            wrongQuestions: {
              questionId: qId,
              langId: lId,
              addedAt: now,
              learned: false,
            },
          },
        },
      );
    }
  }

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

// Finish test
export const finishTest = asyncHandler(async (req, res, next) => {
  const {
    odamId,
    testType,
    templateId,
    templateName,
    langId,
    questions,
    startedAt,
    activeTestId,
  } = req.body;

  if (!odamId || !testType || !langId || !questions || !startedAt) {
    return next(new AppError("Barcha maydonlar to'ldirilishi shart", 400));
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  const completedAt = new Date();
  const duration = Math.floor((completedAt - new Date(startedAt)) / 1000);

  let correctCount = 0;
  let incorrectCount = 0;

  for (const q of questions) {
    if (q.isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  }

  const totalQuestions = questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);

  const maxAllowedErrors = Math.floor(totalQuestions * 0.1);
  const actualMaxErrors = maxAllowedErrors < 1 ? 0 : maxAllowedErrors;
  const passed = incorrectCount <= actualMaxErrors;

  // templateName ni aniqlash
  let resolvedTemplateName = templateName || null;

  // Save test result
  const testResult = await ErrorTrackingTestResult.create({
    odamId,
    testType,
    templateId: templateId || null,
    templateName: resolvedTemplateName,
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

  // Xato javoblarni user.wrongQuestions ga atomik qo'shish (ichki testdan tashqari)
  // Bu submitAnswer per-question chaqirilmagan holatlar uchun backup mexanizmi
  if (testType !== 'internal') {
    const seen = new Set();
    const ops = [];
    const now = new Date();

    for (const q of questions) {
      if (q.isCorrect) continue;
      if (q.userAnswer === null || q.userAnswer === undefined) continue;
      const qId = parseInt(q.questionId);
      const lId = parseInt(q.langId);
      if (Number.isNaN(qId) || Number.isNaN(lId)) continue;
      const key = `${qId}-${lId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 1) Mavjud yozuvni learned=true → false ga qaytarish
      ops.push({
        updateOne: {
          filter: { odamId, isActive: true },
          update: {
            $set: {
              "wrongQuestions.$[elem].learned": false,
              "wrongQuestions.$[elem].addedAt": now,
              "wrongQuestions.$[elem].testResultId": testResult._id,
            },
          },
          arrayFilters: [
            { "elem.questionId": qId, "elem.langId": lId, "elem.learned": true },
          ],
        },
      });
      // 2) Yozuv yo'q bo'lsa — yangi qo'shish
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

    if (ops.length > 0) {
      await ErrorTrackingUser.bulkWrite(ops, { ordered: false });
    }
  }

  // ActiveTest ni yangilash va socket event yuborish
  if (activeTestId) {
    const activeTest = await ActiveTest.findById(activeTestId);
    if (activeTest) {
      // Agar templateName frontend dan kelmagan bo'lsa, ActiveTest dan olish
      if (!resolvedTemplateName && activeTest.templateName) {
        resolvedTemplateName = activeTest.templateName;
        testResult.templateName = resolvedTemplateName;
        await testResult.save();
      }
      activeTest.status = "finished";
      activeTest.finishedAt = completedAt;
      activeTest.duration = duration;
      activeTest.correctCount = correctCount;
      activeTest.incorrectCount = incorrectCount;
      activeTest.answeredCount = totalQuestions;
      activeTest.score = score;
      activeTest.passed = passed;
      await activeTest.save();

      // Socket orqali adminga xabar yuborish
      const finishedEventData = {
        _id: activeTest._id,
        odamId,
        odamFullName: `${user.firstName} ${user.lastName}`,
        testType: activeTest.testType,
        templateName: activeTest.templateName,
        totalQuestions,
        correctCount,
        incorrectCount,
        score,
        duration,
        passed,
        finishedAt: completedAt,
        status: "finished",
      };

      emitTestFinished(user.createdBy.toString(), finishedEventData);

      // Ichki test uchun global roomga ham yuborish
      if (testType === 'internal') {
        emitInternalTestFinished(finishedEventData);
      }
    }
  }

  // Ichki test uchun xato savollarning to'liq ma'lumotlarini qaytarish
  let wrongQuestionDetails = [];
  if (testType === 'internal') {
    const wrongQs = questions.filter(
      (q) => !q.isCorrect && q.userAnswer !== null && q.userAnswer !== undefined,
    );
    if (wrongQs.length > 0) {
      wrongQuestionDetails = await Promise.all(
        wrongQs.map(async (wq) => {
          const fullQ = await Question.findOne({
            questionId: wq.questionId,
            langId: wq.langId,
          }).lean();
          if (fullQ) {
            return {
              questionId: fullQ.questionId,
              langId: fullQ.langId,
              body: fullQ.body,
              answers: fullQ.answers,
            };
          }
          return null;
        }),
      );
      wrongQuestionDetails = wrongQuestionDetails.filter(Boolean);
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
      ...(testType === 'internal' && { wrongQuestionDetails }),
    },
  });
});

// Get wrong questions for user (only unlearned)
export const getWrongQuestions = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Filter only unlearned questions
  const unlearnedQuestions =
    user.wrongQuestions?.filter((q) => !q.learned) || [];

  if (unlearnedQuestions.length === 0) {
    return res.json({
      success: true,
      count: 0,
      data: [],
    });
  }

  // Bitta queryda barcha savollarni olish (N ta findOne o'rniga 1 ta)
  const questionIds = unlearnedQuestions.map((wq) => ({
    questionId: wq.questionId,
    langId: wq.langId,
  }));

  const fetched = await Question.find({
    $or: questionIds.map(({ questionId, langId }) => ({ questionId, langId })),
  }).lean();

  const map = new Map(fetched.map((q) => [`${q.questionId}-${q.langId}`, q]));
  const validQuestions = questionIds
    .map((p) => map.get(`${p.questionId}-${p.langId}`))
    .filter(Boolean);

  res.json({
    success: true,
    count: validQuestions.length,
    data: validQuestions,
  });
});

// Mark question as learned (set learned: true instead of removing)
export const markLearned = asyncHandler(async (req, res, next) => {
  const { odamId, questionId, langId } = req.body;

  console.log("markLearned called with:", { odamId, questionId, langId });

  if (!odamId || !questionId || !langId) {
    return next(
      new AppError("odamId, questionId va langId kiritilishi shart", 400),
    );
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Convert to numbers for comparison
  const qId = parseInt(questionId);
  const lId = parseInt(langId);

  console.log("Looking for question:", { qId, lId });

  // Find the question in wrongQuestions array
  const questionIndex = user.wrongQuestions.findIndex(
    (wq) => parseInt(wq.questionId) === qId && parseInt(wq.langId) === lId,
  );

  if (questionIndex === -1) {
    console.log("Question not found in wrongQuestions!");
    return next(new AppError("Bu savol xatolar ro'yxatida topilmadi", 404));
  }

  // Mark as learned instead of removing
  user.wrongQuestions[questionIndex].learned = true;
  user.wrongQuestions[questionIndex].learnedAt = new Date();
  await user.save();

  // Count remaining unlearned questions
  const remainingCount = user.wrongQuestions.filter((q) => !q.learned).length;

  console.log(
    "User updated. Remaining unlearned wrongQuestions count:",
    remainingCount,
  );

  res.json({
    success: true,
    message: "Savol o'rganildi deb belgilandi",
    data: {
      remainingWrongQuestions: remainingCount,
    },
  });
});

// Start test with wrong questions only (only unlearned)
export const startWrongTest = asyncHandler(async (req, res, next) => {
  const { odamId } = req.body;

  if (!odamId) {
    return next(new AppError("odamId kiritilishi shart", 400));
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Filter only unlearned questions
  const unlearnedQuestions =
    user.wrongQuestions?.filter((q) => !q.learned) || [];

  if (unlearnedQuestions.length === 0) {
    return next(new AppError("Xato savollar topilmadi", 400));
  }

  // Get full question data
  const questions = await Promise.all(
    unlearnedQuestions.map(async ({ questionId, langId }) => {
      const q = await Question.findOne({ questionId, langId }).lean();
      return q;
    }),
  );

  const validQuestions = questions.filter(Boolean);

  if (validQuestions.length === 0) {
    return next(new AppError("Xato savollar ma'lumotlari topilmadi", 400));
  }

  // Get the primary langId from the first question
  const primaryLangId = validQuestions[0]?.langId || 1;
  const startedAt = new Date();

  // ActiveTest yaratish (real-time monitoring uchun)
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType: "wrong",
    templateName: null,
    totalQuestions: validQuestions.length,
    startedAt,
  });

  // Socket orqali adminga xabar yuborish
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType: "wrong",
    templateName: null,
    totalQuestions: validQuestions.length,
    startedAt,
    status: "active",
  });

  res.json({
    success: true,
    data: {
      testType: "wrong",
      langId: primaryLangId,
      templateId: null,
      questions: validQuestions,
      duration: getTestDurationByCount(validQuestions.length),
      startedAt,
      activeTestId: activeTest._id,
    },
  });
});

// Get test result by ID
export const getTestResult = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await ErrorTrackingTestResult.findById(id);

  if (!result) {
    return next(new AppError("Natija topilmadi", 404));
  }

  const resultObj = result.toObject();

  // Xato savollarning to'liq ma'lumotlarini qo'shish
  const wrongQs = resultObj.questions.filter(
    (q) => !q.isCorrect && q.userAnswer !== null && q.userAnswer !== undefined,
  );
  if (wrongQs.length > 0) {
    let wrongQuestionDetails = await Promise.all(
      wrongQs.map(async (wq) => {
        const fullQ = await Question.findOne({
          questionId: wq.questionId,
          langId: wq.langId,
        }).lean();
        if (fullQ) {
          return {
            questionId: fullQ.questionId,
            langId: fullQ.langId,
            body: fullQ.body,
            answers: fullQ.answers,
          };
        }
        return null;
      }),
    );
    resultObj.wrongQuestionDetails = wrongQuestionDetails.filter(Boolean);
  } else {
    resultObj.wrongQuestionDetails = [];
  }

  res.json({
    success: true,
    data: resultObj,
  });
});

// Get user info by odamId
export const getUserInfo = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  res.json({
    success: true,
    data: {
      odamId: user.odamId,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      defaultLangId: user.defaultLangId || 1,
      courseStartDate: user.courseStartDate,
      courseEndDate: user.courseEndDate,
      dailyStartTime: user.dailyStartTime,
      dailyEndTime: user.dailyEndTime,
      wrongQuestionsCount:
        user.wrongQuestions?.filter((q) => !q.learned)?.length || 0,
    },
  });
});

// Update default language
export const updateDefaultLang = asyncHandler(async (req, res, next) => {
  const { odamId, langId } = req.body;

  if (!odamId || !langId) {
    return next(new AppError("odamId va langId kiritilishi shart", 400));
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  user.defaultLangId = parseInt(langId);
  await user.save();

  res.json({
    success: true,
    data: { defaultLangId: user.defaultLangId },
  });
});

// Save question to wrongQuestions (manual save = add to wrong questions)
export const saveQuestion = asyncHandler(async (req, res, next) => {
  const { odamId, questionId, langId } = req.body;

  if (!odamId || !questionId || !langId) {
    return next(
      new AppError("odamId, questionId va langId kiritilishi shart", 400),
    );
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  const qId = parseInt(questionId);
  const lId = parseInt(langId);

  // Check if already in wrongQuestions
  const exists = user.wrongQuestions?.some(
    (q) => parseInt(q.questionId) === qId && parseInt(q.langId) === lId,
  );

  if (exists) {
    return res.json({
      success: true,
      message: "Bu savol allaqachon xato savollarda mavjud",
      data: {
        wrongQuestionsCount: user.wrongQuestions.filter((q) => !q.learned)
          .length,
      },
    });
  }

  // Add to wrongQuestions
  user.wrongQuestions.push({
    questionId: qId,
    langId: lId,
    addedAt: new Date(),
    learned: false,
  });

  await user.save();

  res.json({
    success: true,
    message: "Savol xato savollarga qo'shildi",
    data: {
      wrongQuestionsCount: user.wrongQuestions.filter((q) => !q.learned).length,
    },
  });
});

// Remove saved question
export const removeSavedQuestion = asyncHandler(async (req, res, next) => {
  const { odamId, questionId, langId } = req.body;

  if (!odamId || !questionId || !langId) {
    return next(
      new AppError("odamId, questionId va langId kiritilishi shart", 400),
    );
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  const qId = parseInt(questionId);
  const lId = parseInt(langId);

  const updatedUser = await ErrorTrackingUser.findOneAndUpdate(
    { odamId, isActive: true },
    { $pull: { savedQuestions: { questionId: qId, langId: lId } } },
    { new: true },
  );

  res.json({
    success: true,
    message: "Savol o'chirildi",
    data: {
      savedQuestionsCount: updatedUser.savedQuestions?.length || 0,
    },
  });
});

// Get saved questions for user
export const getSavedQuestions = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (!user.savedQuestions || user.savedQuestions.length === 0) {
    return res.json({
      success: true,
      count: 0,
      data: [],
    });
  }

  // Bitta queryda barcha saqlangan savollarni olish (N ta findOne o'rniga 1 ta)
  const fetched = await Question.find({
    $or: user.savedQuestions.map((sq) => ({
      questionId: sq.questionId,
      langId: sq.langId,
    })),
  }).lean();
  const qMap = new Map(fetched.map((q) => [`${q.questionId}-${q.langId}`, q]));

  const validQuestions = user.savedQuestions
    .map((sq) => {
      const q = qMap.get(`${sq.questionId}-${sq.langId}`);
      return q
        ? { ...q, savedIsCorrect: sq.isCorrect, savedAt: sq.addedAt }
        : null;
    })
    .filter(Boolean);

  res.json({
    success: true,
    count: validQuestions.length,
    data: validQuestions,
  });
});

// Start test with saved questions
export const startSavedTest = asyncHandler(async (req, res, next) => {
  const { odamId } = req.body;

  if (!odamId) {
    return next(new AppError("odamId kiritilishi shart", 400));
  }

  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (!user.savedQuestions || user.savedQuestions.length === 0) {
    return next(new AppError("Saqlangan savollar topilmadi", 400));
  }

  // Get full question data
  const questions = await Promise.all(
    user.savedQuestions.map(async ({ questionId, langId }) => {
      const q = await Question.findOne({ questionId, langId }).lean();
      return q;
    }),
  );

  const validQuestions = questions.filter(Boolean);

  if (validQuestions.length === 0) {
    return next(new AppError("Saqlangan savollar ma'lumotlari topilmadi", 400));
  }

  // Get the primary langId from the first question
  const savedPrimaryLangId = validQuestions[0]?.langId || 1;

  res.json({
    success: true,
    data: {
      testType: "saved",
      langId: savedPrimaryLangId,
      templateId: null,
      questions: validQuestions,
      duration: getTestDurationByCount(validQuestions.length),
      startedAt: new Date(),
    },
  });
});

// Get exam questions (top 20 most wrong questions from all users)
// Eng ko'p xato qilingan top-20 savolni topish (aggregation, lean, cache)
const computeTopWrongQuestions = async (targetLangId) => {
  const cached = examQuestionsCache.get(targetLangId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // MongoDB ichida hisoblash — JS loop yo'q, butun userlar RAM'ga yuklanmaydi
  const sorted = await ErrorTrackingUser.aggregate([
    { $match: { isActive: true } },
    { $unwind: "$wrongQuestions" },
    { $match: { "wrongQuestions.langId": targetLangId } },
    {
      $group: {
        _id: "$wrongQuestions.questionId",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);

  if (sorted.length === 0) {
    examQuestionsCache.set(targetLangId, {
      data: [],
      expiresAt: Date.now() + EXAM_CACHE_TTL_MS,
    });
    return [];
  }

  const ids = sorted.map((s) => s._id);
  const questionDocs = await Question.find({
    questionId: { $in: ids },
    langId: targetLangId,
  }).lean();

  const byId = new Map(questionDocs.map((q) => [q.questionId, q]));
  const result = sorted
    .map((s) => {
      const q = byId.get(s._id);
      return q ? { ...q, errorCount: s.count } : null;
    })
    .filter(Boolean);

  examQuestionsCache.set(targetLangId, {
    data: result,
    expiresAt: Date.now() + EXAM_CACHE_TTL_MS,
  });
  return result;
};

export const invalidateExamCache = (langId) => {
  if (langId === undefined) examQuestionsCache.clear();
  else examQuestionsCache.delete(langId);
};

export const getExamQuestions = asyncHandler(async (req, res) => {
  const targetLangId = parseInt(req.query.langId) || 1;
  const validQuestions = await computeTopWrongQuestions(targetLangId);

  res.json({
    success: true,
    count: validQuestions.length,
    data: validQuestions,
  });
});

// Start exam test (top 20 most wrong questions)
export const startExamTest = asyncHandler(async (req, res, next) => {
  const { langId, odamId } = req.body;
  const targetLangId = parseInt(langId) || 1;

  // Verify user exists (odamId agar kelsa)
  let user = null;
  if (odamId) {
    user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
    if (!user) {
      return next(new AppError("Foydalanuvchi topilmadi", 404));
    }
  }

  // Cache + aggregation orqali top-20 ni olish
  const validQuestions = await computeTopWrongQuestions(targetLangId);

  if (validQuestions.length === 0) {
    return next(
      new AppError(
        "Imtihon savollari topilmadi. Hech kim hali xato qilmagan.",
        400,
      ),
    );
  }

  const startedAt = new Date();
  let activeTestId = null;

  // ActiveTest yaratish (agar user mavjud bo'lsa)
  if (user) {
    const activeTest = await ActiveTest.create({
      odamId,
      odamFullName: `${user.firstName} ${user.lastName}`,
      adminId: user.createdBy,
      testType: "exam",
      templateName: null,
      totalQuestions: validQuestions.length,
      startedAt,
    });

    activeTestId = activeTest._id;

    // Socket orqali adminga xabar yuborish
    emitTestStarted(user.createdBy.toString(), {
      _id: activeTest._id,
      odamId,
      odamFullName: `${user.firstName} ${user.lastName}`,
      testType: "exam",
      templateName: null,
      totalQuestions: validQuestions.length,
      startedAt,
      status: "active",
    });
  }

  res.json({
    success: true,
    data: {
      testType: "exam",
      langId: targetLangId,
      templateId: null,
      questions: validQuestions,
      duration: getTestDurationByCount(validQuestions.length),
      startedAt,
      activeTestId,
    },
  });
});

// Ichki test uchun savollar ro'yxati (shablon.savol formati)
const INTERNAL_TEST_QUESTIONS = [
  "52.1",
  "42.6",
  "55.9",
  "18.9",
  "18.12",
  "45.8",
  "57.11",
  "9.17",
  "58.19",
  "20.8",
  "45.9",
  "37.17",
  "21.19",
  "42.8",
  "8.6",
  "50.16",
  "44.10",
  "21.1",
  "53.8",
  "51.12",
  "3.5",
  "41.8",
  "34.5",
  "44.5",
  "57.10",
  "12.20",
  "20.15",
  "7.10",
  "27.9",
  "23.17",
  "47.12",
  "45.14",
  "49.11",
  "27.14",
  "2.8",
  "20.11",
  "31.3",
  "42.4",
  "33.1",
  "8.16",
  "20.18",
  "23.2",
  "38.19",
  "43.4",
  "42.10",
  "27.10",
  "43.5",
  "15.17",
  "47.2",
  "8.2",
  "22.4",
  "7.2",
  "48.20",
  "41.7",
  "44.4",
  "12.2",
  "20.20",
  "34.11",
  "8.13",
  "22.3",
  "13.20",
  "61.6",
  "5.13",
  "47.18",
  "58.1",
  "17.7",
  "10.16",
  "51.9",
  "20.7",
  "28.16",
  "4.20",
  "46.6",
  "29.2",
  "1.9",
  "27.1",
  "7.6",
  "50.8",
  "34.9",
  "39.2",
];

const INTERNAL_TEST_PASSWORD = "72";

// Start internal test (ichki test - maxsus savollar ro'yxatidan 50 ta)
export const startInternalTest = asyncHandler(async (req, res, next) => {
  const { langId, odamId, password } = req.body;
  const targetLangId = parseInt(langId) || 1;

  // Parolni tekshirish
  if (password !== INTERNAL_TEST_PASSWORD) {
    return next(new AppError("Parol noto'g'ri", 401));
  }

  // Foydalanuvchini tekshirish
  let user = null;
  if (odamId) {
    user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
    if (!user) {
      return next(new AppError("Foydalanuvchi topilmadi", 404));
    }
  }

  // Har bir shablon uchun savollarni olish va kerakli tartibdagi savolni tanlash
  // Format: "52.1" = shablon 52 ning 1-savoli (questionId bo'yicha tartiblanganda)
  const templateGroups = {};
  for (const spec of INTERNAL_TEST_QUESTIONS) {
    const [templateId, order] = spec.split(".").map(Number);
    if (!templateGroups[templateId]) {
      templateGroups[templateId] = [];
    }
    templateGroups[templateId].push(order);
  }

  // Har bir shablondan savollarni olish
  const allQuestions = [];
  for (const [templateId, orders] of Object.entries(templateGroups)) {
    const templateQuestions = await Question.find({
      "templates.id": parseInt(templateId),
      langId: targetLangId,
      status: 1,
    })
      .sort({ questionId: 1 })
      .lean();

    for (const order of orders) {
      const idx = order - 1; // 1-based -> 0-based
      if (idx >= 0 && idx < templateQuestions.length) {
        allQuestions.push(templateQuestions[idx]);
      }
    }
  }

  if (allQuestions.length === 0) {
    return next(new AppError("Ichki test savollari topilmadi", 400));
  }

  // 50 ta random tanlash (Fisher-Yates shuffle)
  const shuffled = [...allQuestions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selectedQuestions = shuffled.slice(0, 50);

  const startedAt = new Date();
  let activeTestId = null;

  if (user) {
    const activeTest = await ActiveTest.create({
      odamId,
      odamFullName: `${user.firstName} ${user.lastName}`,
      adminId: user.createdBy,
      testType: "internal",
      templateName: "Ichki test",
      totalQuestions: selectedQuestions.length,
      startedAt,
    });

    activeTestId = activeTest._id;

    const testEventData = {
      _id: activeTest._id,
      odamId,
      odamFullName: `${user.firstName} ${user.lastName}`,
      testType: "internal",
      templateName: "Ichki test",
      totalQuestions: selectedQuestions.length,
      startedAt,
      status: "active",
    };

    emitTestStarted(user.createdBy.toString(), testEventData);
    emitInternalTestStarted(testEventData);
  }

  res.json({
    success: true,
    data: {
      testType: "internal",
      langId: targetLangId,
      templateId: null,
      questions: selectedQuestions,
      duration: 30 * 60, // 30 daqiqa
      startedAt,
      activeTestId,
      maxErrors: 2, // 2 ta xatogacha ruxsat, 3-xatoda test tugatiladi
    },
  });
});

// Get test history for error tracking
export const getTestHistory = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const results = await ErrorTrackingTestResult.find({ odamId })
    .sort({ createdAt: -1 })
    .select("-questions")
    .limit(50)
    .lean();

  // Eski natijalar uchun templateName ni Template kolleksiyasidan to'ldirish
  const needsTemplateName = results.filter(
    (r) => r.templateId && !r.templateName,
  );
  if (needsTemplateName.length > 0) {
    const templateIds = [
      ...new Set(needsTemplateName.map((r) => r.templateId)),
    ];
    const templates = await Template.find({ templateId: { $in: templateIds } })
      .select("templateId name")
      .lean();
    const templateMap = {};
    templates.forEach((t) => {
      templateMap[t.templateId] = t.name;
    });

    for (const result of results) {
      if (
        result.templateId &&
        !result.templateName &&
        templateMap[result.templateId]
      ) {
        result.templateName = templateMap[result.templateId];
      }
    }
  }

  res.json({
    success: true,
    count: results.length,
    data: results,
  });
});

// Start imageless test (rasmsiz savollar - 20 ta yoki 100 ta)
export const startImagelessTest = asyncHandler(async (req, res, next) => {
  const { odamId, langId, count } = req.body;

  if (!odamId || !langId) {
    return next(new AppError("odamId va langId kiritilishi shart", 400));
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (
    ![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(
      langId,
    )
  ) {
    return next(new AppError("Noto'g'ri til", 400));
  }

  // Default 20 ta, agar count=100 bo'lsa 100 ta
  const questionCount = count === 100 ? 100 : 20;
  const testType = questionCount === 100 ? "imageless100" : "imageless20";
  console.log(
    `🔍 Finding ${questionCount} imageless questions for lang ${langId}`,
  );

  // Pre-computed hasImage field + compound index ishlatadi (langId, status, hasImage)
  const questions = await Question.aggregate([
    { $match: { langId, status: 1, hasImage: false } },
    { $sample: { size: questionCount } },
  ]);

  console.log(`📊 Found ${questions.length} imageless questions`);

  if (questions.length < questionCount) {
    return next(
      new AppError(
        `Rasmsiz savollar yetarli emas. Mavjud: ${questions.length} ta`,
        400,
      ),
    );
  }

  const startedAt = new Date();

  // ActiveTest yaratish (real-time monitoring uchun)
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType,
    templateName: null,
    totalQuestions: questions.length,
    startedAt,
  });

  // Socket orqali adminga xabar yuborish
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType,
    templateName: null,
    totalQuestions: questions.length,
    startedAt,
    status: "active",
  });

  res.json({
    success: true,
    data: {
      testType,
      langId,
      templateId: null,
      questions,
      duration: getTestDurationByCount(questions.length),
      startedAt,
      activeTestId: activeTest._id,
    },
  });
});

// Start full test (all questions from all templates)
export const startFullTest = asyncHandler(async (req, res, next) => {
  const { odamId, langId, order = "random" } = req.body;

  if (!odamId || !langId) {
    return next(new AppError("odamId va langId kiritilishi shart", 400));
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (
    ![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(
      langId,
    )
  ) {
    return next(new AppError("Noto'g'ri til", 400));
  }

  // Get all questions from all templates for the selected language
  const questions = await Question.find({
    langId,
    status: 1,
    "templates.0": { $exists: true },
  })
    .sort({ questionId: 1 })
    .lean();

  console.log(
    `📊 Found ${questions.length} unique questions for full test (lang ${langId})`,
  );

  if (questions.length === 0) {
    return next(new AppError("Bu til uchun savollar topilmadi", 400));
  }

  // Har bir savolni shablonlari bo'yicha kengaytirish (duplicate)
  // Agar savol 2 ta shablonga tegishli bo'lsa, 2 marta qo'shiladi
  const expandedQuestions = [];
  for (const question of questions) {
    for (const template of question.templates) {
      expandedQuestions.push({
        ...question,
        _templateId: template.id,
        _templateName: template.name,
      });
    }
  }

  // Shablon bo'yicha tartiblash (savol raqamini aniqlash uchun)
  expandedQuestions.sort((a, b) => {
    if (a._templateId !== b._templateId) return a._templateId - b._templateId;
    return a.questionId - b.questionId;
  });

  // Har bir shablondagi savol tartib raqamini belgilash
  let currentTplId = null;
  let orderInTemplate = 0;
  for (const q of expandedQuestions) {
    if (q._templateId !== currentTplId) {
      currentTplId = q._templateId;
      orderInTemplate = 1;
    }
    q._questionOrder = orderInTemplate;
    orderInTemplate++;
  }

  // Faqat random tartibda bo'lsa shuffle qilish
  if (order !== "template") {
    // Fisher-Yates shuffle - random tartib
    for (let i = expandedQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [expandedQuestions[i], expandedQuestions[j]] = [
        expandedQuestions[j],
        expandedQuestions[i],
      ];
    }
  }

  console.log(
    `📊 Expanded to ${expandedQuestions.length} questions (with duplicates) for full test`,
  );

  const startedAt = new Date();
  const duration = getTestDurationByCount(expandedQuestions.length);

  // ActiveTest yaratish (real-time monitoring uchun)
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType: "fullTest",
    templateName: "Barcha shablonlar",
    totalQuestions: expandedQuestions.length,
    startedAt,
  });

  // Socket orqali adminga xabar yuborish
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType: "fullTest",
    templateName: "Barcha shablonlar",
    totalQuestions: expandedQuestions.length,
    startedAt,
    status: "active",
  });

  res.json({
    success: true,
    data: {
      testType: "fullTest",
      langId,
      templateId: null,
      templateName: "Barcha shablonlar",
      questions: expandedQuestions,
      duration,
      startedAt,
      activeTestId: activeTest._id,
      order,
    },
  });
});

// Start random test (random 20 or 100 questions)
export const startRandomTest = asyncHandler(async (req, res, next) => {
  const { odamId, count, langId } = req.body;

  if (!odamId || !count || !langId) {
    return next(new AppError("odamId, count va langId kiritilishi shart", 400));
  }

  // Verify user exists
  const user = await ErrorTrackingUser.findOne({ odamId, isActive: true });
  if (!user) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  if (
    ![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(
      langId,
    )
  ) {
    return next(new AppError("Noto'g'ri til", 400));
  }

  const questionCount = parseInt(count);
  if (![20, 50, 100].includes(questionCount)) {
    return next(
      new AppError(
        "Noto'g'ri savollar soni. 20, 50 yoki 100 bo'lishi kerak",
        400,
      ),
    );
  }

  // Get total available questions
  const totalCount = await Question.countDocuments({ langId, status: 1 });

  if (totalCount < questionCount) {
    return next(
      new AppError(
        `${questionCount} savollik test uchun yetarli savol yo'q. Mavjud: ${totalCount}`,
        400,
      ),
    );
  }

  // Get random questions
  const questions = await Question.aggregate([
    { $match: { langId, status: 1 } },
    { $sample: { size: questionCount } },
  ]);

  const startedAt = new Date();
  const testTypeForMonitor = `random${questionCount}`;

  // ActiveTest yaratish (real-time monitoring uchun)
  const activeTest = await ActiveTest.create({
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    adminId: user.createdBy,
    testType: testTypeForMonitor,
    templateName: null,
    totalQuestions: questions.length,
    startedAt,
  });

  // Socket orqali adminga xabar yuborish
  emitTestStarted(user.createdBy.toString(), {
    _id: activeTest._id,
    odamId,
    odamFullName: `${user.firstName} ${user.lastName}`,
    testType: testTypeForMonitor,
    templateName: null,
    totalQuestions: questions.length,
    startedAt,
    status: "active",
  });

  res.json({
    success: true,
    data: {
      testType: testTypeForMonitor,
      langId,
      templateId: null,
      questions,
      duration: getTestDurationByCount(questions.length),
      startedAt,
      activeTestId: activeTest._id,
    },
  });
});

// ==================== PAUSED FULL TEST FUNCTIONS ====================

// Pause full test - vaqtincha to'xtatish
export const pauseFullTest = asyncHandler(async (req, res, next) => {
  const {
    odamId,
    langId,
    order,
    questions,
    answers,
    currentQuestionIndex,
    startedAt,
    activeTestId,
    shuffleVariants,
    lockedShuffleOrders,
    savedQuestions,
  } = req.body;

  if (!odamId || !questions || !answers) {
    return next(
      new AppError("odamId, questions va answers kiritilishi shart", 400),
    );
  }

  // Verify user exists
  const userExists = await ErrorTrackingUser.exists({ odamId, isActive: true });
  if (!userExists) {
    return next(new AppError("Foydalanuvchi topilmadi", 404));
  }

  // Javoblardan statistikani hisoblash
  let answeredCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  for (const answer of answers) {
    if (answer !== null) {
      answeredCount++;
      if (answer.isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }
  }

  // Xato javoblarni atomik tarzda wrongQuestions ga qo'shish (bulkWrite)
  const seen = new Set();
  const wrongPairs = [];
  for (const answer of answers) {
    if (answer !== null && !answer.isCorrect) {
      const key = `${answer.questionId}-${answer.langId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wrongPairs.push({
        qId: parseInt(answer.questionId),
        lId: parseInt(answer.langId),
      });
    }
  }

  if (wrongPairs.length > 0) {
    const now = new Date();
    const ops = [];
    for (const { qId, lId } of wrongPairs) {
      // 1) Mavjud yozuvni learned=true → false ga qaytarish
      ops.push({
        updateOne: {
          filter: { odamId, isActive: true },
          update: {
            $set: {
              "wrongQuestions.$[elem].learned": false,
              "wrongQuestions.$[elem].addedAt": now,
            },
          },
          arrayFilters: [
            { "elem.questionId": qId, "elem.langId": lId, "elem.learned": true },
          ],
        },
      });
      // 2) Yozuv umuman yo'q bo'lsa — yangi qo'shish
      ops.push({
        updateOne: {
          filter: {
            odamId,
            isActive: true,
            wrongQuestions: { $not: { $elemMatch: { questionId: qId, langId: lId } } },
          },
          update: {
            $push: {
              wrongQuestions: { questionId: qId, langId: lId, addedAt: now, learned: false },
            },
          },
        },
      });
    }
    await ErrorTrackingUser.bulkWrite(ops, { ordered: false });
  }

  // Upsert - mavjud pauzani yangilash yoki yangi yaratish
  const pausedTest = await PausedFullTest.findOneAndUpdate(
    { odamId },
    {
      odamId,
      langId,
      order: order || "random",
      questions,
      answers,
      currentQuestionIndex: currentQuestionIndex || 0,
      totalQuestions: questions.length,
      answeredCount,
      correctCount,
      incorrectCount,
      startedAt: new Date(startedAt),
      pausedAt: new Date(),
      activeTestId,
      shuffleVariants: shuffleVariants || false,
      lockedShuffleOrders: lockedShuffleOrders || {},
      savedQuestions: savedQuestions || [],
    },
    { upsert: true, new: true },
  );

  // ActiveTest statusini paused qilish
  if (activeTestId) {
    const activeTest = await ActiveTest.findById(activeTestId);
    if (activeTest) {
      activeTest.answeredCount = answeredCount;
      activeTest.correctCount = correctCount;
      activeTest.incorrectCount = incorrectCount;
      activeTest.status = "paused";
      await activeTest.save();
    }
  }

  res.json({
    success: true,
    message: "Test vaqtincha saqlandi",
    data: {
      answeredCount,
      correctCount,
      incorrectCount,
      totalQuestions: questions.length,
    },
  });
});

// Get paused full test - pauzadagi testni olish
export const getPausedFullTest = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const pausedTest = await PausedFullTest.findOne({ odamId }).lean();

  res.json({
    success: true,
    data: pausedTest || null,
  });
});

// Delete paused full test - pauzadagi testni o'chirish
export const deletePausedFullTest = asyncHandler(async (req, res, next) => {
  const { odamId } = req.params;

  const deleted = await PausedFullTest.findOneAndDelete({ odamId });

  // Agar activeTestId bo'lsa, ActiveTest ni ham o'chirish
  if (deleted && deleted.activeTestId) {
    await ActiveTest.findByIdAndDelete(deleted.activeTestId);
  }

  res.json({
    success: true,
    message: deleted ? "Pauzadagi test o'chirildi" : "Pauzadagi test topilmadi",
  });
});
