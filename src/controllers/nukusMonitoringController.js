import { asyncHandler } from "../utils/errorHandler.js";
import NukusActiveTest from "../models/NukusActiveTest.js";
import User from "../models/User.js";
import { emitNukusTestStarted, emitNukusTestProgress, emitNukusTestFinished } from "../config/socket.js";

// ==================== FRONTEND TRACKING (User auth) ====================

// Test boshlanganda tracking
export const trackTestStart = asyncHandler(async (req, res) => {
  const { testType, templateName, totalQuestions } = req.body;
  const user = req.user;

  // Avvalgi active testni tozalash
  await NukusActiveTest.deleteMany({ userId: user._id, status: "active" });

  const activeTest = await NukusActiveTest.create({
    userId: user._id,
    login: user.login,
    computerNumber: user.computerNumber,
    testType,
    templateName: templateName || null,
    totalQuestions,
    startedAt: new Date(),
  });

  const testData = {
    _id: activeTest._id,
    userId: user._id.toString(),
    login: user.login,
    computerNumber: user.computerNumber,
    testType,
    templateName: templateName || null,
    totalQuestions,
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    startedAt: activeTest.startedAt,
  };

  emitNukusTestStarted(testData);

  res.json({
    success: true,
    data: { activeTestId: activeTest._id },
  });
});

// Javob berilganda progress tracking
export const trackTestProgress = asyncHandler(async (req, res) => {
  const { activeTestId, isCorrect } = req.body;
  const user = req.user;

  const activeTest = await NukusActiveTest.findOne({
    _id: activeTestId,
    userId: user._id,
    status: "active",
  });

  if (!activeTest) {
    return res.json({ success: true });
  }

  activeTest.answeredCount += 1;
  if (isCorrect) {
    activeTest.correctCount += 1;
  } else {
    activeTest.incorrectCount += 1;
  }
  await activeTest.save();

  const progressData = {
    _id: activeTest._id,
    userId: user._id.toString(),
    login: activeTest.login,
    computerNumber: activeTest.computerNumber,
    testType: activeTest.testType,
    templateName: activeTest.templateName,
    totalQuestions: activeTest.totalQuestions,
    answeredCount: activeTest.answeredCount,
    correctCount: activeTest.correctCount,
    incorrectCount: activeTest.incorrectCount,
    startedAt: activeTest.startedAt,
  };

  emitNukusTestProgress(progressData);

  res.json({ success: true });
});

// Test tugaganda tracking
export const trackTestFinish = asyncHandler(async (req, res) => {
  const { activeTestId, score, passed, correctCount, incorrectCount, totalQuestions, duration } = req.body;
  const user = req.user;

  const activeTest = await NukusActiveTest.findOne({
    _id: activeTestId,
    userId: user._id,
    status: "active",
  });

  if (!activeTest) {
    return res.json({ success: true });
  }

  const now = new Date();
  activeTest.status = "finished";
  activeTest.finishedAt = now;
  activeTest.completedAt = now;
  activeTest.score = score;
  activeTest.passed = passed;
  activeTest.correctCount = correctCount;
  activeTest.incorrectCount = incorrectCount;
  activeTest.answeredCount = totalQuestions;
  activeTest.duration = duration;
  await activeTest.save();

  const finishedData = {
    _id: activeTest._id,
    userId: user._id.toString(),
    login: activeTest.login,
    computerNumber: activeTest.computerNumber,
    testType: activeTest.testType,
    templateName: activeTest.templateName,
    totalQuestions: activeTest.totalQuestions,
    answeredCount: totalQuestions,
    correctCount,
    incorrectCount,
    score,
    passed,
    duration,
    startedAt: activeTest.startedAt,
    completedAt: now,
  };

  emitNukusTestFinished(finishedData);

  res.json({ success: true });
});

// ==================== ADMIN MONITORING (Admin auth) ====================

// Faol testlar
export const getActiveTests = asyncHandler(async (req, res) => {
  const activeTests = await NukusActiveTest.find({ status: "active" })
    .sort({ startedAt: -1 });

  res.json({
    success: true,
    data: activeTests,
  });
});

// Tugallangan testlar (sana bo'yicha)
export const getFinishedTests = asyncHandler(async (req, res) => {
  const { date } = req.query;

  const dateStr = date || new Date().toISOString().split("T")[0];
  const startOfDay = new Date(dateStr);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateStr);
  endOfDay.setHours(23, 59, 59, 999);

  const finishedTests = await NukusActiveTest.find({
    status: "finished",
    finishedAt: { $gte: startOfDay, $lte: endOfDay },
  }).sort({ finishedAt: -1 });

  res.json({
    success: true,
    data: finishedTests,
  });
});

// Statistika
export const getStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = await NukusActiveTest.aggregate([
    {
      $match: {
        startedAt: { $gte: today },
      },
    },
    {
      $group: {
        _id: null,
        activeTests: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },
        totalFinished: {
          $sum: { $cond: [{ $eq: ["$status", "finished"] }, 1, 0] },
        },
        passedCount: {
          $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] },
        },
        failedCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$status", "finished"] }, { $eq: ["$passed", false] }] },
              1,
              0,
            ],
          },
        },
        avgScore: {
          $avg: {
            $cond: [{ $eq: ["$status", "finished"] }, "$score", null],
          },
        },
      },
    },
  ]);

  res.json({
    success: true,
    data: stats[0] || {
      activeTests: 0,
      totalFinished: 0,
      passedCount: 0,
      failedCount: 0,
      avgScore: 0,
    },
  });
});

// Foydalanuvchilar ro'yxati
export const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isAdmin: false })
    .select("login computerNumber createdAt")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: users,
  });
});
