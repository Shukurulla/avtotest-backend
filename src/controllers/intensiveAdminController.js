import { asyncHandler, AppError } from "../utils/errorHandler.js";
import Admin from "../models/Admin.js";
import ErrorTrackingUser from "../models/ErrorTrackingUser.js";
import ActiveTest from "../models/ActiveTest.js";
import ErrorTrackingTestResult from "../models/ErrorTrackingTestResult.js";

const getIntensiveAdminId = async () => {
  const admin = await Admin.findOne({ username: "intensive_admin" });
  return admin?._id;
};

// Eng uzun test 90 daqiqa + 5 daqiqa buffer
const MAX_TEST_DURATION_MS = 95 * 60 * 1000;

// Dashboard stats
export const getStats = asyncHandler(async (req, res, next) => {
  const intensiveAdminId = await getIntensiveAdminId();
  if (!intensiveAdminId) {
    return next(new AppError("intensive_admin topilmadi", 404));
  }

  const totalUsers = await ErrorTrackingUser.countDocuments({
    createdBy: intensiveAdminId,
  });

  const onlineUsers = await ErrorTrackingUser.countDocuments({
    createdBy: intensiveAdminId,
    "currentSession.sessionId": { $ne: null },
  });

  const intensiveUsers = await ErrorTrackingUser.find({
    createdBy: intensiveAdminId,
  }).select("odamId");
  const odamIds = intensiveUsers.map((u) => u.odamId);

  const cutoff = new Date(Date.now() - MAX_TEST_DURATION_MS);

  // Unikal foydalanuvchilar soni (bir userni bir marta hisoblash)
  const activeOdamIds = await ActiveTest.distinct("odamId", {
    odamId: { $in: odamIds },
    status: "active",
    startedAt: { $gte: cutoff },
  });
  const activeTestsCount = activeOdamIds.length;

  const priceAgg = await ErrorTrackingUser.aggregate([
    { $match: { createdBy: intensiveAdminId, coursePrice: { $ne: null } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$coursePrice" },
        paidUsersCount: { $sum: 1 },
      },
    },
  ]);

  const revenue = priceAgg[0] || { totalRevenue: 0, paidUsersCount: 0 };

  res.json({
    success: true,
    data: {
      totalUsers,
      onlineUsers,
      activeTestsCount,
      totalRevenue: revenue.totalRevenue,
      paidUsersCount: revenue.paidUsersCount,
    },
  });
});

// Barcha intensive_admin foydalanuvchilari
export const getUsers = asyncHandler(async (req, res, next) => {
  const intensiveAdminId = await getIntensiveAdminId();
  if (!intensiveAdminId) {
    return next(new AppError("intensive_admin topilmadi", 404));
  }

  const cutoff = new Date(Date.now() - MAX_TEST_DURATION_MS);

  // Aggregation: wrongQuestionsCount'ni MongoDB'da hisoblab, og'ir arraylar transferi yo'q
  const users = await ErrorTrackingUser.aggregate([
    { $match: { createdBy: intensiveAdminId } },
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
        isOnline: {
          $cond: [{ $ifNull: ["$currentSession.sessionId", false] }, true, false],
        },
      },
    },
    { $project: { wrongQuestions: 0, savedQuestions: 0 } },
    { $sort: { createdAt: -1 } },
  ]);

  // Active test'larni bitta queryda olib, JS'da map qilish (N ta findOne o'rniga 1 ta find)
  const odamIds = users.map((u) => u.odamId);
  const activeTests = await ActiveTest.find({
    odamId: { $in: odamIds },
    status: "active",
    startedAt: { $gte: cutoff },
  })
    .sort({ startedAt: -1 })
    .lean();

  const activeTestByOdamId = new Map();
  for (const t of activeTests) {
    if (!activeTestByOdamId.has(t.odamId)) {
      activeTestByOdamId.set(t.odamId, t);
    }
  }

  const usersWithStats = users.map((user) => {
    const activeTest = activeTestByOdamId.get(user.odamId);
    return {
      ...user,
      isTakingTest: !!activeTest,
      activeTestType: activeTest?.testType || null,
    };
  });

  res.json({
    success: true,
    count: usersWithStats.length,
    data: usersWithStats,
  });
});

// Statistika
export const getStatistics = asyncHandler(async (req, res, next) => {
  const intensiveAdminId = await getIntensiveAdminId();
  if (!intensiveAdminId) {
    return next(new AppError("intensive_admin topilmadi", 404));
  }

  const intensiveUsers = await ErrorTrackingUser.find({
    createdBy: intensiveAdminId,
  }).select("odamId createdAt isActive coursePrice courseStartDate courseEndDate");

  const odamIds = intensiveUsers.map((u) => u.odamId);
  const totalUsers = intensiveUsers.length;
  const activeUsers = intensiveUsers.filter((u) => u.isActive !== false).length;
  const paidUsers = intensiveUsers.filter((u) => u.coursePrice != null).length;

  // So'nggi 12 oy uchun sana chegarasi
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  // Oylik yangi studentlar (createdAt bo'yicha)
  const monthlyUsers = await ErrorTrackingUser.aggregate([
    {
      $match: {
        createdBy: intensiveAdminId,
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Oylik test natijalari
  const monthlyTests = await ErrorTrackingTestResult.aggregate([
    {
      $match: {
        odamId: { $in: odamIds },
        completedAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$completedAt" },
          month: { $month: "$completedAt" },
        },
        total: { $sum: 1 },
        passed: { $sum: { $cond: ["$passed", 1, 0] } },
        failed: { $sum: { $cond: ["$passed", 0, 1] } },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Jami test statistikasi
  const totalTestsAgg = await ErrorTrackingTestResult.aggregate([
    { $match: { odamId: { $in: odamIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passed: { $sum: { $cond: ["$passed", 1, 0] } },
        failed: { $sum: { $cond: ["$passed", 0, 1] } },
      },
    },
  ]);
  const totalTests = totalTestsAgg[0] || { total: 0, passed: 0, failed: 0 };

  // Test turi bo'yicha taqsimot
  const testTypeStats = await ErrorTrackingTestResult.aggregate([
    { $match: { odamId: { $in: odamIds } } },
    {
      $group: {
        _id: "$testType",
        count: { $sum: 1 },
        passed: { $sum: { $cond: ["$passed", 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.json({
    success: true,
    data: {
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        paidUsers,
        unpaidUsers: totalUsers - paidUsers,
        totalTests: totalTests.total,
        passedTests: totalTests.passed,
        failedTests: totalTests.failed,
      },
      monthlyUsers,
      monthlyTests,
      testTypeStats,
    },
  });
});

// O'chirilgan studentlar (test natijalarida bor, lekin hozirgi ro'yxatda yo'q)

// Hozirda test yechayotganlar
export const getActiveTests = asyncHandler(async (req, res, next) => {
  const intensiveAdminId = await getIntensiveAdminId();
  if (!intensiveAdminId) {
    return next(new AppError("intensive_admin topilmadi", 404));
  }

  const intensiveUsers = await ErrorTrackingUser.find({
    createdBy: intensiveAdminId,
  }).select("odamId firstName lastName phoneNumber");

  const userMap = new Map();
  intensiveUsers.forEach((u) => userMap.set(u.odamId, u));

  const odamIds = intensiveUsers.map((u) => u.odamId);

  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const skip = (page - 1) * limit;

  const cutoff = new Date(Date.now() - MAX_TEST_DURATION_MS);

  // Har bir foydalanuvchi uchun faqat eng oxirgi active testni ol
  const activeTests = await ActiveTest.aggregate([
    {
      $match: {
        odamId: { $in: odamIds },
        status: "active",
        startedAt: { $gte: cutoff },
      },
    },
    { $sort: { startedAt: -1 } },
    { $group: { _id: "$odamId", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
    { $sort: { startedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  const totalAgg = await ActiveTest.aggregate([
    {
      $match: {
        odamId: { $in: odamIds },
        status: "active",
        startedAt: { $gte: cutoff },
      },
    },
    { $group: { _id: "$odamId" } },
    { $count: "total" },
  ]);
  const total = totalAgg[0]?.total || 0;

  const enriched = activeTests.map((t) => {
    const u = userMap.get(t.odamId);
    return {
      ...t,
      userFirstName: u?.firstName || "",
      userLastName: u?.lastName || "",
      userPhone: u?.phoneNumber || "",
    };
  });

  res.json({
    success: true,
    count: enriched.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: enriched,
  });
});



export const getDeletedUsers = asyncHandler(async (req, res, next) => {
  const intensiveAdminId = await getIntensiveAdminId();
  if (!intensiveAdminId) return next(new AppError("intensive_admin topilmadi", 404));
  const currentUsers = await ErrorTrackingUser.find({ createdBy: intensiveAdminId }).select("odamId").lean();
  const currentOdamIds = new Set(currentUsers.map((u) => u.odamId));
  const activeTestUsers = await ActiveTest.aggregate([
    { $match: { adminId: intensiveAdminId } },
    { $sort: { startedAt: -1 } },
    { $group: { _id: "$odamId", odamFullName: { $first: "$odamFullName" }, lastTestAt: { $first: "$startedAt" } } },
  ]);
  const deletedOdamIds = activeTestUsers.filter((u) => !currentOdamIds.has(u._id)).map((u) => u._id);
  if (deletedOdamIds.length === 0) return res.json({ success: true, count: 0, data: [] });
  const testStats = await ActiveTest.aggregate([
    { $match: { odamId: { $in: deletedOdamIds }, adminId: intensiveAdminId } },
    { $group: { _id: "$odamId", firstTestAt: { $min: "$startedAt" }, lastTestAt: { $max: "$startedAt" } } },
  ]);
  const statsMap = new Map(testStats.map((s) => [s._id, s]));
  const nameMap = new Map(activeTestUsers.map((u) => [u._id, u.odamFullName]));
  const result = deletedOdamIds.map((odamId) => {
    const stats = statsMap.get(odamId) || {};
    return { odamId, odamFullName: nameMap.get(odamId) || "Noma'lum", firstTestAt: stats.firstTestAt || null, lastTestAt: stats.lastTestAt || null };
  });
  result.sort((a, b) => new Date(b.lastTestAt) - new Date(a.lastTestAt));
  res.json({ success: true, count: result.length, data: result });
});
