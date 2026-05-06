import mongoose from 'mongoose';

const questionAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true,
    },
    langId: {
      type: Number,
      required: true,
    },
    userAnswer: {
      type: Number,
      default: null,
    },
    isCorrect: {
      type: Boolean,
      required: true,
    },
    correctAnswerId: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

const errorTrackingTestResultSchema = new mongoose.Schema(
  {
    odamId: {
      type: String,
      required: true,
      ref: 'ErrorTrackingUser',
    },
    testType: {
      type: mongoose.Schema.Types.Mixed, // Number yoki String qabul qiladi
      required: true,
    },
    templateId: {
      type: Number,
      default: null,
    },
    langId: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
    },
    questions: [questionAnswerSchema],
    correctCount: {
      type: Number,
      required: true,
      default: 0,
    },
    incorrectCount: {
      type: Number,
      required: true,
      default: 0,
    },
    score: {
      type: Number,
      required: true,
      default: 0,
    },
    passed: {
      type: Boolean,
      required: true,
      default: false,
    },
    duration: {
      type: Number,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
errorTrackingTestResultSchema.index({ odamId: 1, createdAt: -1 });

const ErrorTrackingTestResult = mongoose.model('ErrorTrackingTestResult', errorTrackingTestResultSchema);

export default ErrorTrackingTestResult;
