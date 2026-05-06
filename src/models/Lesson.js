import mongoose from 'mongoose';

const lessonNameSchema = new mongoose.Schema({
  uz: { type: String, required: true },
  ru: { type: String, default: '' },
  kiril: { type: String, default: '' },
}, { _id: false });

const lessonSchema = new mongoose.Schema(
  {
    externalId: {
      type: Number,
      required: true,
      unique: true,
    },
    lessonId: {
      type: Number,
      required: true,
    },
    name: lessonNameSchema,
    shortName: {
      type: String,
      default: '',
    },
    status: {
      type: Number,
      default: 1,
    },
    topicCount: {
      type: Number,
      default: 0,
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

lessonSchema.index({ externalId: 1 });
lessonSchema.index({ lessonId: 1 });
lessonSchema.index({ status: 1 });

const Lesson = mongoose.model('Lesson', lessonSchema);

export default Lesson;
