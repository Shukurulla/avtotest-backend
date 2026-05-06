export const LANGUAGES = {
  UZBEK: 1,
  RUSSIAN: 2,
  CYRILLIC_UZBEK: 3,
};

export const LANGUAGE_NAMES = {
  1: 'Ozbekcha',
  2: 'Русский',
  3: 'Кирилча',
};

export const TEST_TYPES = {
  FULL: 50,
  TEMPLATE: 20,
  IMAGELESS_20: 'imageless20', // Rasmsiz savollar testi - 20 ta
  IMAGELESS_100: 'imageless100', // Rasmsiz savollar testi - 100 ta
};

export const TEST_DURATIONS = {
  50: 45 * 60, // 45 daqiqa
  20: 25 * 60, // 25 daqiqa
  imageless20: 25 * 60, // 25 daqiqa
  imageless100: 90 * 60, // 90 daqiqa
};

// Savol soniga qarab vaqtni hisoblash (sekundlarda)
export const getTestDurationByCount = (count) => {
  if (count <= 20) return 25 * 60; // 25 daqiqa
  if (count <= 50) return 45 * 60; // 45 daqiqa
  return 90 * 60; // 90 daqiqa
};

export const QUESTION_BODY_TYPES = {
  TEXT: 1,
  IMAGE: 2,
};

export const ANSWER_FEEDBACK_DURATION = 1000; // 1 second in milliseconds

export const TOTAL_TEMPLATES = 60;

// Konkurs settings
export const KONKURS_SETTINGS = {
  QUESTION_COUNT: 20,
  DURATION: 25 * 60, // 25 daqiqa
};
