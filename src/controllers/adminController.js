import { asyncHandler, AppError } from '../utils/errorHandler.js';
import User from '../models/User.js';
import Template from '../models/Template.js';
import Question from '../models/Question.js';
import { LANGUAGES } from '../config/constants.js';
import syncService from '../services/syncService.js';

export const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isAdmin: false })
    .select('-password')
    .sort({ createdAt: -1 });

  // Include plainPassword for admin panel display
  const usersWithPassword = users.map((user) => ({
    ...user.toObject(),
    password: user.plainPassword || '****',
  }));

  res.json({
    success: true,
    count: usersWithPassword.length,
    data: usersWithPassword,
  });
});

export const createUser = asyncHandler(async (req, res, next) => {
  const { login, password, computerNumber } = req.body;

  if (!login || !password || !computerNumber) {
    return next(new AppError('Please provide login, password, and computer number', 400));
  }

  const userExists = await User.findOne({ login });

  if (userExists) {
    return next(new AppError('User with this login already exists', 400));
  }

  const user = await User.create({
    login,
    password,
    computerNumber,
    isAdmin: false,
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id,
      login: user.login,
      computerNumber: user.computerNumber,
    },
  });
});

export const createMultipleUsers = asyncHandler(async (req, res, next) => {
  const { baseLogin, password, count } = req.body;

  if (!baseLogin || !password || !count) {
    return next(new AppError('Please provide baseLogin, password, and count', 400));
  }

  if (count < 1 || count > 100) {
    return next(new AppError('Count must be between 1 and 100', 400));
  }

  const users = [];
  const errors = [];

  for (let i = 1; i <= count; i++) {
    const login = `${baseLogin}${i}`;
    const computerNumber = `${i}`;

    try {
      const userExists = await User.findOne({ login });

      if (userExists) {
        errors.push({ login, error: 'User already exists' });
        continue;
      }

      const user = await User.create({
        login,
        password,
        computerNumber,
        isAdmin: false,
      });

      users.push({
        id: user._id,
        login: user.login,
        computerNumber: user.computerNumber,
      });
    } catch (error) {
      errors.push({ login, error: error.message });
    }
  }

  res.status(201).json({
    success: true,
    data: {
      created: users.length,
      users,
      errors,
    },
  });
});

export const updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { login, password, computerNumber, isActive } = req.body;

  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  if (user.isAdmin) {
    return next(new AppError('Cannot update admin user', 400));
  }

  if (login) user.login = login;
  if (password) user.password = password;
  if (computerNumber) user.computerNumber = computerNumber;
  if (typeof isActive !== 'undefined') user.isActive = isActive;

  await user.save();

  res.json({
    success: true,
    data: {
      id: user._id,
      login: user.login,
      computerNumber: user.computerNumber,
      isActive: user.isActive,
    },
  });
});

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('Foydalanuvchi topilmadi', 404));
  }

  if (user.isAdmin) {
    return next(new AppError('Admin foydalanuvchini o\'chirib bo\'lmaydi', 400));
  }

  await User.findByIdAndDelete(id);

  res.json({
    success: true,
    message: 'Foydalanuvchi o\'chirildi',
  });
});

export const resetUserDevice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('Foydalanuvchi topilmadi', 404));
  }

  if (user.isAdmin) {
    return next(new AppError('Admin qurilmasini reset qilib bo\'lmaydi', 400));
  }

  // Reset device info
  user.deviceId = null;
  user.deviceModel = null;
  user.platform = null;
  user.userAgent = null;
  await user.save();

  res.json({
    success: true,
    message: 'Qurilma muvaffaqiyatli reset qilindi',
  });
});

export const triggerSync = asyncHandler(async (req, res, next) => {
  try {
    console.log('🚀 Manual sync triggered by admin');

    // Run sync in background (don't await)
    syncService.syncAll()
      .then((result) => {
        console.log('✅ Background sync completed:', result);
      })
      .catch((error) => {
        console.error('❌ Background sync error:', error);
      });

    res.json({
      success: true,
      message: 'Sinxronizatsiya boshlandi. Jarayon bir necha daqiqa davom etishi mumkin.',
    });
  } catch (error) {
    return next(new AppError('Failed to start synchronization', 500));
  }
});

export const syncSingleTemplate = asyncHandler(async (req, res, next) => {
  const { templateId, langId } = req.body;

  if (!templateId || !langId) {
    return next(new AppError('Please provide templateId and langId', 400));
  }

  try {
    console.log(`🚀 Single template sync triggered: Template ${templateId}, Language ${langId}`);

    const result = await syncService.syncSingleTemplate(templateId, langId);

    res.json({
      success: true,
      message: `Shablon ${templateId} uchun sinxronlash muvaffaqiyatli yakunlandi!`,
      data: result,
    });
  } catch (error) {
    console.error('❌ Sync error:', error);
    return next(new AppError(`Sinxronlashda xatolik: ${error.message}`, 500));
  }
});

export const getSyncStatus = asyncHandler(async (req, res) => {
  const lastSync = await syncService.getLastSyncStatus();

  res.json({
    success: true,
    data: lastSync,
  });
});

export const getSyncHistory = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const history = await syncService.getSyncHistory(limit);

  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

export const getStats = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments({ isAdmin: false });
  const activeUsers = await User.countDocuments({ isAdmin: false, isActive: true });

  res.json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
    },
  });
});

export const getTemplates = asyncHandler(async (req, res) => {
  const templates = await Template.find({ status: 1 }).sort({ templateId: 1 });

  // For each template, count questions by language
  const templatesWithCounts = await Promise.all(
    templates.map(async (template) => {
      const templateObj = template.toObject();

      // Count questions for each language (1=Uzb lotin, 2=Rus, 3=Uzb kiril)
      const [uzbekCount, russianCount, uzbekCyrillicCount] = await Promise.all([
        Question.countDocuments({
          'templates.id': template.templateId,
          langId: LANGUAGES.UZBEK,
          status: 1,
        }),
        Question.countDocuments({
          'templates.id': template.templateId,
          langId: LANGUAGES.RUSSIAN,
          status: 1,
        }),
        Question.countDocuments({
          'templates.id': template.templateId,
          langId: LANGUAGES.CYRILLIC_UZBEK,
          status: 1,
        }),
      ]);

      return {
        ...templateObj,
        questionCounts: {
          uzbek: uzbekCount,
          russian: russianCount,
          uzbekCyrillic: uzbekCyrillicCount,
        },
      };
    })
  );

  res.json({
    success: true,
    count: templatesWithCounts.length,
    data: templatesWithCounts,
  });
});
