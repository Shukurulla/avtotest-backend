import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import Admin from '../models/Admin.js';

// Admin login
export const adminLogin = asyncHandler(async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new AppError('Username va parolni kiriting', 400));
  }

  // Find admin
  const admin = await Admin.findOne({ username: username.toLowerCase() });

  if (!admin) {
    return next(new AppError('Username yoki parol noto\'g\'ri', 401));
  }

  // Check password
  const isPasswordMatch = await admin.matchPassword(password);

  if (!isPasswordMatch) {
    return next(new AppError('Username yoki parol noto\'g\'ri', 401));
  }

  // Check if admin is active
  if (!admin.isActive) {
    return next(new AppError('Hisob o\'chirilgan', 403));
  }

  // Generate tokens
  const token = generateToken(admin._id);
  const refreshToken = generateRefreshToken(admin._id);

  res.json({
    success: true,
    data: {
      admin: {
        id: admin._id,
        username: admin.username,
      },
      token,
      refreshToken,
    },
  });
});

// Admin refresh token
export const adminRefreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError('Refresh token talab qilinadi', 400));
  }

  const decoded = verifyRefreshToken(refreshToken);

  if (!decoded) {
    return next(new AppError('Refresh token yaroqsiz', 401));
  }

  const admin = await Admin.findById(decoded.id);

  if (!admin) {
    return next(new AppError('Admin topilmadi', 404));
  }

  if (!admin.isActive) {
    return next(new AppError('Hisob o\'chirilgan', 403));
  }

  const newToken = generateToken(admin._id);
  const newRefreshToken = generateRefreshToken(admin._id);

  res.json({
    success: true,
    data: {
      token: newToken,
      refreshToken: newRefreshToken,
    },
  });
});

// Get current admin info
export const getAdminMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      admin: {
        id: req.admin._id,
        username: req.admin.username,
      },
    },
  });
});
