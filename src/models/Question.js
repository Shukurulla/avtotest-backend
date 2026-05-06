import mongoose from "mongoose";

// Define subdocument schemas separately to avoid casting issues
const bodyItemSchema = new mongoose.Schema(
  {
    order: Number,
    type: Number, // 1=text, 2=image
    value: String,
  },
  { _id: false },
);

const answerBodyItemSchema = new mongoose.Schema(
  {
    order: Number,
    type: Number,
    value: String,
  },
  { _id: false },
);

const answerSchema = new mongoose.Schema(
  {
    id: Number,
    newtest_question_id: Number,
    body: [answerBodyItemSchema],
    check: Number, // 1=correct, 0=wrong
  },
  { _id: false },
);

const templateSchema = new mongoose.Schema(
  {
    id: Number,
    name: String,
    status: Number,
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true,
      unique: true,
    },
    langId: {
      type: Number,
      required: true,
      enum: [1, 2, 3], // 1=Uzbek, 2=Russian, 3=Cyrillic Uzbek
    },
    body: [bodyItemSchema],
    answers: [answerSchema],
    answerDescription: {
      type: String,
      default: null,
    },
    answerVideo: {
      type: String,
      default: null,
    },
    comment: {
      type: String,
      default: null,
    },
    staticOrderAnswers: {
      type: Number,
      default: 0,
    },
    isNew: {
      type: Boolean,
      default: false,
    },
    lessonId: {
      type: Number,
      default: null,
    },
    status: {
      type: Number,
      default: 1,
    },
    templates: [templateSchema],
    eduTypes: [mongoose.Schema.Types.Mixed],
    imagePath: {
      type: String,
      default: null,
    },
    hasImage: {
      type: Boolean,
      default: false,
      index: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// hasImage'ni body'dan avtomatik hisoblash (har save'da)
questionSchema.pre("save", function (next) {
  if (this.isModified("body")) {
    this.hasImage = (this.body || []).some((item) => item.type === 2);
  }
  next();
});

// Create compound index for questionId and langId (unique combination)
questionSchema.index({ questionId: 1, langId: 1 }, { unique: true });

// Create index on questionId for faster lookups
questionSchema.index({ questionId: 1 });

// Create index on templates.id for faster template-based queries
questionSchema.index({ "templates.id": 1 });

// Compound index for template + langId queries
questionSchema.index({ "templates.id": 1, langId: 1, status: 1 });

// Imageless test uchun compound index
questionSchema.index({ langId: 1, status: 1, hasImage: 1 });

const Question = mongoose.model("Question", questionSchema);

export default Question;
