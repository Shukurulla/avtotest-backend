import mongoose from "mongoose";

const nukusActiveTestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    login: {
      type: String,
      required: true,
    },
    computerNumber: {
      type: String,
      default: null,
    },
    testType: {
      type: String,
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
    finishedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
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

nukusActiveTestSchema.index({ status: 1 });
nukusActiveTestSchema.index({ userId: 1, status: 1 });
nukusActiveTestSchema.index({ startedAt: -1 });
nukusActiveTestSchema.index({ finishedAt: -1 });

const NukusActiveTest = mongoose.model("NukusActiveTest", nukusActiveTestSchema);

export default NukusActiveTest;
