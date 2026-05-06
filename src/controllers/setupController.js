import { asyncHandler, AppError } from '../utils/errorHandler.js';
import User from '../models/User.js';

export const createDefaultAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ login: 'admin' });

    if (existingAdmin) {
      return res.json({
        success: true,
        message: 'Default admin user already exists',
        data: {
          login: 'admin',
          password: 'admin123',
          exists: true,
        },
      });
    }

    // Create default admin user
    const admin = await User.create({
      login: 'admin',
      password: 'admin123', // Will be hashed automatically
      computerNumber: 'admin',
      isAdmin: true,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Default admin user created successfully',
      data: {
        login: 'admin',
        password: 'admin123',
        exists: false,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to create default admin user', 500));
  }
});

export const createDefaultStudent = asyncHandler(async (req, res, next) => {
  try {
    // Check if default student already exists
    const existingStudent = await User.findOne({ login: 'student1' });

    if (existingStudent) {
      return res.json({
        success: true,
        message: 'Default student user already exists',
        data: {
          login: 'student1',
          password: 'student123',
          computerNumber: '1',
          exists: true,
        },
      });
    }

    // Create default student user
    const student = await User.create({
      login: 'student1',
      password: 'student123',
      computerNumber: '1',
      isAdmin: false,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Default student user created successfully',
      data: {
        login: 'student1',
        password: 'student123',
        computerNumber: '1',
        exists: false,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to create default student user', 500));
  }
});

export const createAllDefaults = asyncHandler(async (req, res, next) => {
  const results = {
    admin: null,
    student: null,
  };

  try {
    // Create admin
    const existingAdmin = await User.findOne({ login: 'admin' });
    if (!existingAdmin) {
      await User.create({
        login: 'admin',
        password: 'admin123',
        computerNumber: 'admin',
        isAdmin: true,
        isActive: true,
      });
      results.admin = { created: true, login: 'admin', password: 'admin123' };
    } else {
      results.admin = { created: false, login: 'admin', message: 'Already exists' };
    }

    // Create student
    const existingStudent = await User.findOne({ login: 'student1' });
    if (!existingStudent) {
      await User.create({
        login: 'student1',
        password: 'student123',
        computerNumber: '1',
        isAdmin: false,
        isActive: true,
      });
      results.student = { created: true, login: 'student1', password: 'student123', computerNumber: '1' };
    } else {
      results.student = { created: false, login: 'student1', message: 'Already exists' };
    }

    res.status(201).json({
      success: true,
      message: 'Default users setup completed',
      data: results,
    });
  } catch (error) {
    return next(new AppError('Failed to create default users', 500));
  }
});
