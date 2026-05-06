import mongoose from 'mongoose';

const testResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    testType: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: function(v) {
          return [50, 20, 'imageless20', 'imageless100'].includes(v);
        },
        message: 'Invalid test type'
      }
    },
    templateId: {
      type: Number,
      default: null,
    },
    questions: [
      {
        questionId: Number,
        langId: Number,
        userAnswer: Number, // answer id that user selected
        isCorrect: Boolean,
      },
    ],
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
      type: Number, // in seconds
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
testResultSchema.index({ userId: 1, createdAt: -1 });

const TestResult = mongoose.model('TestResult', testResultSchema);

export default TestResult;
