import mongoose from 'mongoose';

const questionResultSchema = new mongoose.Schema({
  questionId: Number,
  userAnswer: Number,
  correctAnswerId: Number,
  isCorrect: Boolean,
}, { _id: false });

const konkursParticipantSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['registered', 'started', 'completed'],
      default: 'registered',
    },
    langId: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
    questions: [{
      questionId: Number,
      langId: Number,
    }],
    answers: [questionResultSchema],
    correctCount: {
      type: Number,
      default: 0,
    },
    incorrectCount: {
      type: Number,
      default: 0,
    },
    score: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number, // seconds
      default: 0,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
konkursParticipantSchema.index({ phoneNumber: 1 });
konkursParticipantSchema.index({ status: 1 });
konkursParticipantSchema.index({ createdAt: -1 });

const KonkursParticipant = mongoose.model('KonkursParticipant', konkursParticipantSchema);

export default KonkursParticipant;
