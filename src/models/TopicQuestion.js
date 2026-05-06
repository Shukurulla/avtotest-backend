import mongoose from 'mongoose';

const bodyItemSchema = new mongoose.Schema({
  order: Number,
  type: Number, // 1=text, 2=image
  value: String,
}, { _id: false });

const answerBodyItemSchema = new mongoose.Schema({
  order: Number,
  type: Number,
  value: String,
}, { _id: false });

const answerSchema = new mongoose.Schema({
  id: Number,
  newtest_question_id: Number,
  body: [answerBodyItemSchema],
  check: Number, // 1=correct, 0=wrong
}, { _id: false });

const topicQuestionSchema = new mongoose.Schema(
  {
    examTopicTestId: {
      type: Number,
      required: true,
    },
    topicId: {
      type: Number,
      required: true,
    },
    questionId: {
      type: Number,
      required: true,
    },
    langId: {
      type: Number,
      required: true,
      enum: [1, 2, 3], // 1=Uzbek, 2=Russian, 3=Cyrillic Uzbek
    },
    body: [bodyItemSchema],
    answers: [answerSchema],
    comment: {
      type: mongoose.Schema.Types.Mixed, // String yoki Object bo'lishi mumkin
      default: null,
    },
    staticOrderAnswers: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: null,
    },
    testType: {
      type: String,
      default: null,
    },
    sourceId: {
      type: Number,
      default: null,
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

// Compound index for topic + langId queries
topicQuestionSchema.index({ topicId: 1, langId: 1 });
topicQuestionSchema.index({ examTopicTestId: 1 });
topicQuestionSchema.index({ questionId: 1, langId: 1 });

const TopicQuestion = mongoose.model('TopicQuestion', topicQuestionSchema);

export default TopicQuestion;
