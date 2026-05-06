import { AppError } from '../utils/errorHandler.js';
import { extractDeviceInfo, compareDeviceInfo } from '../utils/deviceInfo.js';

export const checkDeviceBinding = (req, res, next) => {
  // Skip device check for admin users
  if (req.user && req.user.isAdmin) {
    return next();
  }

  const currentDevice = extractDeviceInfo(req);

  // If user has no device registered, they can proceed (first login)
  if (!req.user.deviceId) {
    return next();
  }

  // Compare stored device info with current
  const storedDevice = {
    deviceId: req.user.deviceId,
    userAgent: req.user.userAgent,
    platform: req.user.platform,
    deviceModel: req.user.deviceModel,
  };

  const isDeviceMatch = compareDeviceInfo(storedDevice, currentDevice);

  if (!isDeviceMatch) {
    return next(
      new AppError(
        'Ruxsat berilmadi. Bu hisob boshqa qurilmaga biriktirilgan.',
        403
      )
    );
  }

  next();
};
