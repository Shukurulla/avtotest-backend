import mongoose from "mongoose";

const activeTestSchema = new mongoose.Schema(
  {
    odamId: {
      type: String,
      required: true,
    },
    odamFullName: {
      type: String,
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    testType: {
      type: String,
      enum: ["template20", "random20", "random50", "random100", "exam", "wrong", "imageless20", "imageless100", "topic", "fullTest", "internal"],
      required: true,
    },
    templateName: {
      type: String,
      default: null,
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
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "finished"],
      default: "active",
    },
    // Test tugagandan keyin
    finishedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // sekundlarda
      default: null,
    },
    score: {
      type: Number,
      default: null,
    },
    passed: {
      type: Boolean,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indekslar
activeTestSchema.index({ adminId: 1, status: 1 });
activeTestSchema.index({ odamId: 1, status: 1 });
activeTestSchema.index({ startedAt: -1 });

const ActiveTest = mongoose.model("ActiveTest", activeTestSchema);

export default ActiveTest;
