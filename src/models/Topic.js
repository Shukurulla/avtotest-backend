import mongoose from 'mongoose';

const topicNameSchema = new mongoose.Schema({
  uz: { type: String, required: true },
  ru: { type: String, default: '' },
  kiril: { type: String, default: '' },
}, { _id: false });

const topicActionLimitSchema = new mongoose.Schema({
  id: Number,
  topicId: Number,
  timeLimit: { type: Number, default: 600 },
}, { _id: false });

const topicSchema = new mongoose.Schema(
  {
    topicId: {
      type: Number,
      required: true,
      unique: true,
    },
    lessonExternalId: {
      type: Number,
      required: true,
    },
    type: {
      type: Number,
      default: 1,
    },
    name: topicNameSchema,
    topicActionLimit: topicActionLimitSchema,
    questionCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: Number,
      default: 1,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

topicSchema.index({ topicId: 1 });
topicSchema.index({ lessonExternalId: 1 });
topicSchema.index({ status: 1 });

const Topic = mongoose.model('Topic', topicSchema);

export default Topic;
