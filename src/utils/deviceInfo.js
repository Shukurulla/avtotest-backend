import crypto from 'crypto';

export const generateDeviceId = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';

  // Create a hash from user agent and IP
  const hash = crypto
    .createHash('sha256')
    .update(userAgent + ip)
    .digest('hex');

  return hash;
};

export const extractDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const platform = req.body.platform || detectPlatform(userAgent);
  const deviceModel = req.body.deviceModel || extractDeviceModel(userAgent);

  return {
    deviceId: generateDeviceId(req),
    userAgent,
    platform,
    deviceModel,
  };
};

const detectPlatform = (userAgent) => {
  if (userAgent.includes('Win')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
};

const extractDeviceModel = (userAgent) => {
  // Simple extraction, can be enhanced
  if (userAgent.includes('Windows NT')) {
    return 'Windows PC';
  }
  if (userAgent.includes('Mac')) {
    return 'MacIntel';
  }
  return 'Unknown Device';
};

export const compareDeviceInfo = (stored, current) => {
  return stored.deviceId === current.deviceId;
};
