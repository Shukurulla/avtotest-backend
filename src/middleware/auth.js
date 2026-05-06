import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import Admin from '../models/Admin.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Not authorized to access this route', 401));
  }

  try {
    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new AppError('Not authorized, token failed', 401));
    }

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return next(new AppError('User not found', 404));
    }

    if (!req.user.isActive) {
      return next(new AppError('User account is disabled', 403));
    }

    next();
  } catch (error) {
    return next(new AppError('Not authorized, token failed', 401));
  }
});

export const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    return next(new AppError('Not authorized as an admin', 403));
  }
};

// Admin panel uchun authentication middleware
export const protectAdmin = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Avtorizatsiya talab qilinadi', 401));
  }

  try {
    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new AppError('Token yaroqsiz', 401));
    }

    req.admin = await Admin.findById(decoded.id).select('-password');

    if (!req.admin) {
      return next(new AppError('Admin topilmadi', 404));
    }

    if (!req.admin.isActive) {
      return next(new AppError('Admin hisobi o\'chirilgan', 403));
    }

    next();
  } catch (error) {
    return next(new AppError('Token yaroqsiz', 401));
  }
});
