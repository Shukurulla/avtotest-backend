import mongoose from 'mongoose';

const syncLogSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['started', 'in_progress', 'completed', 'failed'],
      required: true,
    },
    totalTemplates: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    newQuestions: {
      type: Number,
      default: 0,
    },
    updatedQuestions: {
      type: Number,
      default: 0,
    },
    errors: [
      {
        templateId: Number,
        langId: Number,
        error: String,
      },
    ],
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    duration: {
      type: Number, // in seconds
    },
  },
  {
    timestamps: true,
  }
);

const SyncLog = mongoose.model('SyncLog', syncLogSchema);

export default SyncLog;
