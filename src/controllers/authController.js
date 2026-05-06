import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { extractDeviceInfo } from '../utils/deviceInfo.js';
import User from '../models/User.js';

export const login = asyncHandler(async (req, res, next) => {
  const { login, password, computerNumber } = req.body;

  // Validate input
  if (!login || !password) {
    return next(new AppError('Login va parolni kiriting', 400));
  }

  // Find user
  const user = await User.findOne({ login });

  if (!user) {
    return next(new AppError('Login yoki parol noto\'g\'ri', 401));
  }

  // Check password
  const isPasswordMatch = await user.matchPassword(password);

  if (!isPasswordMatch) {
    return next(new AppError('Login yoki parol noto\'g\'ri', 401));
  }

  // Check computer number (only for non-admin users)
  if (!user.isAdmin) {
    if (!computerNumber) {
      return next(new AppError('Kompyuter raqamini kiriting', 400));
    }
    if (user.computerNumber !== computerNumber) {
      return next(new AppError('Kompyuter raqami noto\'g\'ri', 401));
    }
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new AppError('Hisob o\'chirilgan', 403));
  }

  // Device info ni saqlash (faqat ma'lumot uchun, bloklash yo'q)
  if (!user.isAdmin) {
    const deviceInfo = extractDeviceInfo(req);
    user.deviceModel = deviceInfo.deviceModel;
    user.platform = deviceInfo.platform;
    user.userAgent = deviceInfo.userAgent;
    user.lastLoginAt = new Date();
    await user.save();
  }

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        login: user.login,
        computerNumber: user.computerNumber,
        isAdmin: user.isAdmin,
      },
      token,
      refreshToken,
    },
  });
});

export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError('Refresh token talab qilinadi', 400));
  }

  const decoded = verifyRefreshToken(refreshToken);

  if (!decoded) {
    return next(new AppError('Refresh token yaroqsiz', 401));
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    return next(new AppError('Foydalanuvchi topilmadi', 404));
  }

  if (!user.isActive) {
    return next(new AppError('Hisob o\'chirilgan', 403));
  }

  const newToken = generateToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  res.json({
    success: true,
    data: {
      token: newToken,
      refreshToken: newRefreshToken,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        login: req.user.login,
        computerNumber: req.user.computerNumber,
        isAdmin: req.user.isAdmin,
        deviceInfo: {
          deviceModel: req.user.deviceModel,
          platform: req.user.platform,
        },
      },
    },
  });
});
