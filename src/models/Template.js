import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    templateId: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    questionCount: {
      type: Number,
      default: 60,
    },
    status: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

const Template = mongoose.model('Template', templateSchema);

export default Template;
