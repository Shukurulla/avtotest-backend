import mongoose from 'mongoose';

const pausedFullTestSchema = new mongoose.Schema({
  odamId: {
    type: String,
    required: true,
    unique: true,
  },
  langId: {
    type: Number,
    required: true,
  },
  order: {
    type: String,
    enum: ['template', 'random'],
    default: 'random',
  },
  questions: {
    type: Array,
    required: true,
  },
  answers: {
    type: Array,
    required: true,
  },
  currentQuestionIndex: {
    type: Number,
    default: 0,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  answeredCount: {
    type: Number,
    default: 0,
  },
  correctCount: {
    type: Number,
    default: 0,
  },
  incorrectCount: {
    type: Number,
    default: 0,
  },
  startedAt: {
    type: Date,
    required: true,
  },
  pausedAt: {
    type: Date,
    default: Date.now,
  },
  activeTestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActiveTest',
  },
  shuffleVariants: {
    type: Boolean,
    default: false,
  },
  lockedShuffleOrders: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  savedQuestions: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

pausedFullTestSchema.index({ odamId: 1 }, { unique: true });

const PausedFullTest = mongoose.model('PausedFullTest', pausedFullTestSchema);

export default PausedFullTest;
