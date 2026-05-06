import { asyncHandler, AppError } from "../utils/errorHandler.js";
import Question from "../models/Question.js";
import KonkursParticipant from "../models/KonkursParticipant.js";
import KonkursQuestionPool from "../models/KonkursQuestionPool.js";
import Template from "../models/Template.js";
import { LANGUAGES, KONKURS_SETTINGS } from "../config/constants.js";

// Register for konkurs
export const registerParticipant = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, phoneNumber, langId } = req.body;

  if (!firstName || !lastName || !phoneNumber) {
    return next(
      new AppError("Ism, familiya va telefon raqami kiritilishi shart", 400)
    );
  }

  // Validate language
  const selectedLang = langId || LANGUAGES.UZBEK;
  if (
    ![LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK].includes(
      selectedLang
    )
  ) {
    return next(new AppError("Noto'g'ri til tanlandi", 400));
  }

  // Get active question pool for konkurs
  const activePool = await KonkursQuestionPool.findOne({ isActive: true });
  const selectedQuestionIds = activePool?.questionIds || [];

  let questions;

  if (selectedQuestionIds.length === 0) {
    // Hech narsa tanlanmagan - barcha savollardan random 20 ta
    questions = await Question.aggregate([
      { $match: { langId: selectedLang, status: 1 } },
      { $sample: { size: KONKURS_SETTINGS.QUESTION_COUNT } },
    ]);
  } else {
    // Admin savollarni tanlagan - barcha tanlangan savollarni olish
    questions = await Question.find({
      questionId: { $in: selectedQuestionIds },
      langId: selectedLang,
      status: 1,
    }).lean();

    // Savollarni aralashtirish
    questions = questions.sort(() => Math.random() - 0.5);
  }

  // Savollar borligini tekshirish
  if (!questions || questions.length === 0) {
    return next(
      new AppError("Tanlangan tilda savollar topilmadi", 400)
    );
  }

  // Create participant
  const participant = await KonkursParticipant.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phoneNumber: phoneNumber.trim(),
    langId: selectedLang,
    status: "registered",
    questions: questions.map((q) => ({
      questionId: q.questionId,
      langId: q.langId,
    })),
  });

  res.status(201).json({
    success: true,
    data: {
      participantId: participant._id,
      firstName: participant.firstName,
      lastName: participant.lastName,
      questions: questions,
      duration: KONKURS_SETTINGS.DURATION,
    },
  });
});

// Start test (update status to started)
export const startTest = asyncHandler(async (req, res, next) => {
  const { participantId } = req.body;

  if (!participantId) {
    return next(new AppError("Participant ID kiritilishi shart", 400));
  }

  const participant = await KonkursParticipant.findById(participantId);

  if (!participant) {
    return next(new AppError("Ishtirokchi topilmadi", 404));
  }

  if (participant.status === "completed") {
    return next(
      new AppError("Bu ishtirokchi allaqachon testni yakunlagan", 400)
    );
  }

  // Update status to started
  participant.status = "started";
  participant.startedAt = new Date();
  await participant.save();

  res.json({
    success: true,
    data: {
      participantId: participant._id,
      status: participant.status,
      startedAt: participant.startedAt,
    },
  });
});

// Submit answer
export const submitAnswer = asyncHandler(async (req, res, next) => {
  const { participantId, questionId, langId, answerId } = req.body;

  if (!participantId || !questionId || !langId || !answerId) {
    return next(new AppError("Barcha maydonlar to'ldirilishi shart", 400));
  }

  const participant = await KonkursParticipant.findById(participantId);

  if (!participant) {
    return next(new AppError("Ishtirokchi topilmadi", 404));
  }

  if (participant.status === "completed") {
    return next(new AppError("Test allaqachon yakunlangan", 400));
  }

  const question = await Question.findOne({ questionId, langId })
    .select("answers answerDescription answerVideo")
    .lean();

  if (!question) {
    return next(new AppError("Savol topilmadi", 404));
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

// Finish test
export const finishTest = asyncHandler(async (req, res, next) => {
  const { participantId, answers } = req.body;

  console.log(`📥 Konkurs finish so'rovi: participantId=${participantId}, answers=${Array.isArray(answers) ? answers.length : 'undefined'}`);

  if (!participantId || !answers) {
    return next(new AppError("Barcha maydonlar to'ldirilishi shart", 400));
  }

  const participant = await KonkursParticipant.findById(participantId);

  if (!participant) {
    return next(new AppError("Ishtirokchi topilmadi", 404));
  }

  if (participant.status === "completed") {
    return next(new AppError("Test allaqachon yakunlangan", 400));
  }

  const completedAt = new Date();
  // Backend'da saqlangan startedAt dan foydalanish
  const startedAt = participant.startedAt || completedAt;
  const duration = Math.floor((completedAt - new Date(startedAt)) / 1000);

  let correctCount = 0;
  let incorrectCount = 0;

  for (const answer of answers) {
    if (answer.isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  }

  const totalQuestions = participant.questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);

  // Chegirma tizimi
  // 15+ to'g'ri = 100% chegirma, 10-14 = 50% chegirma, <10 = o'tmagan
  // 3 ta xato = test tugaydi
  const maxAllowedErrors = 3;
  let discount = 0;
  let passed = false;

  if (correctCount >= 15) {
    discount = 100;
    passed = true;
  } else if (correctCount >= 10) {
    discount = 50;
    passed = true;
  } else {
    discount = 0;
    passed = false;
  }

  // Update participant
  participant.status = "completed";
  participant.answers = answers;
  participant.correctCount = correctCount;
  participant.incorrectCount = incorrectCount;
  participant.score = score;
  participant.duration = duration;
  participant.passed = passed;
  participant.completedAt = completedAt;
  await participant.save();

  res.json({
    success: true,
    data: {
      participantId: participant._id,
      correctCount,
      incorrectCount,
      score,
      totalQuestions,
      duration,
      passed,
      discount,
      maxAllowedErrors,
    },
  });
});

// Get all participants (for admin)
export const getParticipants = asyncHandler(async (req, res) => {
  const participants = await KonkursParticipant.find()
    .select("-questions -answers")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: participants.length,
    data: participants,
  });
});

// Get participant by ID (for admin)
export const getParticipantById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const participant = await KonkursParticipant.findById(id);

  if (!participant) {
    return next(new AppError("Ishtirokchi topilmadi", 404));
  }

  res.json({
    success: true,
    data: participant,
  });
});

// Get statistics (for admin dashboard)
export const getStatistics = asyncHandler(async (req, res) => {
  const [total, registered, started, completed] = await Promise.all([
    KonkursParticipant.countDocuments(),
    KonkursParticipant.countDocuments({ status: "registered" }),
    KonkursParticipant.countDocuments({ status: "started" }),
    KonkursParticipant.countDocuments({ status: "completed" }),
  ]);

  const passedCount = await KonkursParticipant.countDocuments({
    status: "completed",
    passed: true,
  });

  const topParticipants = await KonkursParticipant.find({ status: "completed" })
    .select("firstName lastName phoneNumber score duration passed")
    .sort({ score: -1, duration: 1 })
    .limit(10);

  res.json({
    success: true,
    data: {
      total,
      registered,
      started,
      completed,
      passed: passedCount,
      failed: completed - passedCount,
      topParticipants,
    },
  });
});

// Get all templates with their questions (for admin question manager)
export const getTemplatesWithQuestions = asyncHandler(async (req, res) => {
  // Til parametrini olish (default: Uzbek)
  const langId = parseInt(req.query.langId) || LANGUAGES.UZBEK;

  // Get all templates
  const templates = await Template.find({ status: 1 })
    .sort({ templateId: 1 })
    .lean();

  // Get questions for each template
  const templatesWithQuestions = await Promise.all(
    templates.map(async (template) => {
      const questions = await Question.find({
        "templates.id": template.templateId,
        langId: langId,
        status: 1,
      })
        .select("questionId body answers imagePath answerDescription answerVideo")
        .sort({ questionId: 1 })
        .lean();

      return {
        ...template,
        questions,
      };
    })
  );

  res.json({
    success: true,
    data: templatesWithQuestions,
  });
});

// Get current selected questions for konkurs
export const getSelectedQuestions = asyncHandler(async (req, res) => {
  const activePool = await KonkursQuestionPool.findOne({ isActive: true });

  res.json({
    success: true,
    data: {
      questionIds: activePool ? activePool.questionIds : [],
      count: activePool ? activePool.questionIds.length : 0,
    },
  });
});

// Save selected questions for konkurs
export const saveSelectedQuestions = asyncHandler(async (req, res, next) => {
  const { questionIds } = req.body;

  if (!questionIds || !Array.isArray(questionIds)) {
    return next(new AppError("Savollar ro'yxati kiritilishi shart", 400));
  }

  // 0 ta ham bo'lishi mumkin (barcha savollardan random tanlash uchun)
  // Hech qanday minimum cheklov yo'q

  // Deactivate all existing pools
  await KonkursQuestionPool.updateMany({}, { isActive: false });

  // Create new active pool
  const newPool = await KonkursQuestionPool.create({
    questionIds,
    isActive: true,
  });

  res.json({
    success: true,
    data: {
      poolId: newPool._id,
      questionIds: newPool.questionIds,
      count: newPool.questionIds.length,
    },
  });
});

// Delete all konkurs participants (clear results)
export const deleteAllParticipants = asyncHandler(async (req, res) => {
  const result = await KonkursParticipant.deleteMany({});

  res.json({
    success: true,
    data: {
      deletedCount: result.deletedCount,
    },
  });
});

// Delete single participant
export const deleteParticipant = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const participant = await KonkursParticipant.findByIdAndDelete(id);

  if (!participant) {
    return next(new AppError("Ishtirokchi topilmadi", 404));
  }

  res.json({
    success: true,
    data: { id },
  });
});
