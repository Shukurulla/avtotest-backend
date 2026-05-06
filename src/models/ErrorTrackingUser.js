import mongoose from 'mongoose';

const wrongQuestionSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true,
    },
    langId: {
      type: Number,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    testResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ErrorTrackingTestResult',
    },
    learned: {
      type: Boolean,
      default: false,
    },
    learnedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const savedQuestionSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true,
    },
    langId: {
      type: Number,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const errorTrackingUserSchema = new mongoose.Schema(
  {
    odamId: {
      type: String,
      required: [true, '5 xonali ID kiritilishi shart'],
      trim: true,
      minlength: [5, 'ID 5 ta raqamdan iborat bo\'lishi kerak'],
      maxlength: [5, 'ID 5 ta raqamdan iborat bo\'lishi kerak'],
      match: [/^\d{5}$/, 'ID faqat 5 ta raqamdan iborat bo\'lishi kerak'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Admin ID kiritilishi shart'],
    },
    firstName: {
      type: String,
      required: [true, 'Ism kiritilishi shart'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Familiya kiritilishi shart'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Telefon raqam kiritilishi shart'],
      trim: true,
    },
    wrongQuestions: [wrongQuestionSchema],
    savedQuestions: [savedQuestionSchema],
    // Kurs vaqtlari
    courseStartDate: {
      type: Date,
    },
    courseEndDate: {
      type: Date,
    },
    // Kunlik dars vaqtlari (HH:mm formatda)
    dailyStartTime: {
      type: String,
      default: '09:00',
    },
    dailyEndTime: {
      type: String,
      default: '18:00',
    },
    defaultLangId: {
      type: Number,
      default: 1,
    },
    coursePrice: {
      type: Number,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    currentSession: {
      sessionId: { type: String, default: null },
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      createdAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
// odamId va createdBy birgalikda unique bo'lishi kerak
// Har bir admin o'z userlarida unique odamId ishlatishi kerak
errorTrackingUserSchema.index({ odamId: 1, createdBy: 1 }, { unique: true });
errorTrackingUserSchema.index({ phoneNumber: 1 });
errorTrackingUserSchema.index({ createdBy: 1 });

const ErrorTrackingUser = mongoose.model('ErrorTrackingUser', errorTrackingUserSchema);

export default ErrorTrackingUser;
