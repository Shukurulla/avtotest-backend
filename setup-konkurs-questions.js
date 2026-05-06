import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Question from './src/models/Question.js';
import KonkursQuestionPool from './src/models/KonkursQuestionPool.js';

// Template.Position formatidagi savollar
// 10.5 = template 10, 5-savol (tartib bo'yicha)
const QUESTION_PAIRS = [
  { templateId: 10, position: 5 },
  { templateId: 45, position: 20 },
  { templateId: 26, position: 3 },
  { templateId: 21, position: 3 },
  { templateId: 49, position: 12 },
  { templateId: 44, position: 9 },
  { templateId: 17, position: 3 },
  { templateId: 52, position: 1 },
  { templateId: 23, position: 11 },
  { templateId: 46, position: 20 },
  { templateId: 47, position: 12 },
  { templateId: 15, position: 5 },
  { templateId: 34, position: 6 },
  { templateId: 31, position: 7 },
  { templateId: 9, position: 13 },
  { templateId: 25, position: 4 },
  { templateId: 24, position: 2 },
  { templateId: 44, position: 13 },
  { templateId: 8, position: 6 },
  { templateId: 62, position: 2 },
];

async function setupKonkursQuestions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB ulandi');

    // Har bir til uchun alohida questionId larni yig'amiz
    const allQuestionIds = [];
    const errors = [];

    for (const langId of [1, 2, 3]) {
      const langNames = { 1: "O'zbekcha (lotin)", 2: 'Ruscha', 3: "O'zbekcha (kirill)" };
      console.log(`\n📝 ${langNames[langId]} tilida savollar qidirilmoqda...`);

      for (const pair of QUESTION_PAIRS) {
        const questions = await Question.find({
          'templates.id': pair.templateId,
          langId: langId,
          status: 1,
        })
          .select('questionId')
          .sort({ questionId: 1 })
          .lean();

        if (questions.length === 0) {
          errors.push(`[Lang ${langId}] Template ${pair.templateId}: savollar topilmadi`);
          continue;
        }

        if (pair.position > questions.length) {
          errors.push(
            `[Lang ${langId}] Template ${pair.templateId}: ${pair.position}-savol yo'q (jami: ${questions.length})`
          );
          continue;
        }

        // Position 1-indexed, array 0-indexed
        const question = questions[pair.position - 1];

        // Dublikatlarni oldini olish
        if (!allQuestionIds.includes(question.questionId)) {
          allQuestionIds.push(question.questionId);
        }

        console.log(
          `  ✅ Template ${pair.templateId}, savol ${pair.position} → questionId: ${question.questionId}`
        );
      }
    }

    if (errors.length > 0) {
      console.log('\n⚠️  Xatolar:');
      errors.forEach((e) => console.log(`  - ${e}`));
    }

    if (allQuestionIds.length === 0) {
      console.log('❌ Hech qanday savol topilmadi!');
      process.exit(1);
    }

    // Natijani ko'rsatish
    console.log(`\n📊 Jami noyob questionId lar: ${allQuestionIds.length}`);

    // Har bir tilda nechta savol borligini tekshirish
    for (const langId of [1, 2, 3]) {
      const langNames = { 1: "O'zbekcha (lotin)", 2: 'Ruscha', 3: "O'zbekcha (kirill)" };
      const found = await Question.countDocuments({
        questionId: { $in: allQuestionIds },
        langId,
        status: 1,
      });
      console.log(`   ${langNames[langId]}: ${found} savol`);
    }

    // Eski poollarni o'chirish va yangi yaratish
    await KonkursQuestionPool.updateMany({}, { isActive: false });

    const newPool = await KonkursQuestionPool.create({
      questionIds: allQuestionIds,
      isActive: true,
      createdBy: 'intensive_admin',
    });

    console.log(`\n✅ Konkurs savollari o'rnatildi!`);
    console.log(`   Pool ID: ${newPool._id}`);
    console.log(`   Savollar soni: ${allQuestionIds.length}`);
    console.log(`   QuestionIds: ${allQuestionIds.join(', ')}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
}

setupKonkursQuestions();
