import mongoose from 'mongoose';

const konkursQuestionPoolSchema = new mongoose.Schema(
  {
    questionIds: [{
      type: Number,
      required: true,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      default: 'admin',
    },
  },
  {
    timestamps: true,
  }
);

const KonkursQuestionPool = mongoose.model('KonkursQuestionPool', konkursQuestionPoolSchema);

export default KonkursQuestionPool;
