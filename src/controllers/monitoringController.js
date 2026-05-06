import { asyncHandler } from "../utils/errorHandler.js";
import ActiveTest from "../models/ActiveTest.js";
import ErrorTrackingTestResult from "../models/ErrorTrackingTestResult.js";
import Question from "../models/Question.js";

// Faol testlarni olish
export const getActiveTests = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;

  const activeTests = await ActiveTest.find({
    adminId,
    status: "active",
  }).sort({ startedAt: -1 });

  res.json({
    success: true,
    data: activeTests,
  });
});

// Tugallangan testlarni olish (so'nggi 24 soat yoki limit bilan)
export const getFinishedTests = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const limit = parseInt(req.query.limit) || 50;
  const hours = parseInt(req.query.hours) || 24;

  const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000);

  const finishedTests = await ActiveTest.find({
    adminId,
    status: "finished",
    finishedAt: { $gte: timeAgo },
  })
    .sort({ finishedAt: -1 })
    .limit(limit);

  res.json({
    success: true,
    data: finishedTests,
  });
});

// Sana bo'yicha tugallangan testlarni olish
export const getFinishedTestsByDate = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: "Sana kiritilishi shart",
    });
  }

  // Sana boshlanishi va tugashi
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const finishedTests = await ActiveTest.find({
    adminId,
    status: "finished",
    finishedAt: { $gte: startOfDay, $lte: endOfDay },
  }).sort({ finishedAt: -1 });

  res.json({
    success: true,
    data: finishedTests,
  });
});

// Bitta faol testni o'chirish
export const deleteActiveTest = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const { id } = req.params;

  const test = await ActiveTest.findOneAndDelete({
    _id: id,
    adminId,
    status: "active",
  });

  if (!test) {
    return res.status(404).json({
      success: false,
      error: "Test topilmadi",
    });
  }

  res.json({
    success: true,
    message: "Test o'chirildi",
  });
});

// Bitta tugallangan testni o'chirish
export const deleteFinishedTest = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const { id } = req.params;

  const test = await ActiveTest.findOneAndDelete({
    _id: id,
    adminId,
    status: "finished",
  });

  if (!test) {
    return res.status(404).json({
      success: false,
      error: "Test topilmadi",
    });
  }

  res.json({
    success: true,
    message: "Test o'chirildi",
  });
});

// Barcha faol testlarni o'chirish
export const deleteAllActiveTests = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;

  const result = await ActiveTest.deleteMany({
    adminId,
    status: "active",
  });

  res.json({
    success: true,
    message: `${result.deletedCount} ta test o'chirildi`,
    deletedCount: result.deletedCount,
  });
});

// Sana bo'yicha barcha tugallangan testlarni o'chirish
export const deleteAllFinishedTests = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: "Sana kiritilishi shart",
    });
  }

  // Sana boshlanishi va tugashi
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await ActiveTest.deleteMany({
    adminId,
    status: "finished",
    finishedAt: { $gte: startOfDay, $lte: endOfDay },
  });

  res.json({
    success: true,
    message: `${result.deletedCount} ta test o'chirildi`,
    deletedCount: result.deletedCount,
  });
});

// Statistika
export const getTestStats = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Bugungi statistika
  const todayStats = await ActiveTest.aggregate([
    {
      $match: {
        adminId: adminId,
        startedAt: { $gte: today },
      },
    },
    {
      $group: {
        _id: null,
        totalTests: { $sum: 1 },
        finishedTests: {
          $sum: { $cond: [{ $eq: ["$status", "finished"] }, 1, 0] },
        },
        activeTests: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },
        passedTests: {
          $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] },
        },
        failedTests: {
          $sum: { $cond: [{ $eq: ["$passed", false] }, 1, 0] },
        },
        avgScore: { $avg: "$score" },
      },
    },
  ]);

  // Test turlariga ko'ra statistika
  const byTestType = await ActiveTest.aggregate([
    {
      $match: {
        adminId: adminId,
        startedAt: { $gte: today },
        status: "finished",
      },
    },
    {
      $group: {
        _id: "$testType",
        count: { $sum: 1 },
        avgScore: { $avg: "$score" },
        passed: { $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] } },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      today: todayStats[0] || {
        totalTests: 0,
        finishedTests: 0,
        activeTests: 0,
        passedTests: 0,
        failedTests: 0,
        avgScore: 0,
      },
      byTestType,
    },
  });
});

// ==================== INTERNAL TEST MONITORING ====================

// Barcha faol ichki testlarni olish (adminId filtersiz)
export const getInternalActiveTests = asyncHandler(async (req, res) => {
  const activeTests = await ActiveTest.find({
    testType: "internal",
    status: "active",
  }).sort({ startedAt: -1 });

  res.json({
    success: true,
    data: activeTests,
  });
});

// Sana bo'yicha tugallangan ichki testlarni olish
export const getInternalFinishedTests = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: "Sana kiritilishi shart",
    });
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const finishedTests = await ActiveTest.find({
    testType: "internal",
    status: "finished",
    finishedAt: { $gte: startOfDay, $lte: endOfDay },
  }).sort({ finishedAt: -1 });

  res.json({
    success: true,
    data: finishedTests,
  });
});

// Ichki test natijasini xato savollari bilan olish
export const getInternalTestResult = asyncHandler(async (req, res) => {
  const { odamId, activeTestId } = req.query;

  // ActiveTest dan startedAt olish
  const activeTest = await ActiveTest.findById(activeTestId);
  if (!activeTest) {
    return res.status(404).json({ success: false, error: "Test topilmadi" });
  }

  // ErrorTrackingTestResult dan natijani topish
  const result = await ErrorTrackingTestResult.findOne({
    odamId,
    testType: "internal",
    startedAt: activeTest.startedAt,
  });

  if (!result) {
    return res.status(404).json({ success: false, error: "Natija topilmadi" });
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
