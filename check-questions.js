import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Question from './src/models/Question.js';
import { LANGUAGES } from './src/config/constants.js';

dotenv.config();

async function checkQuestions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Get one sample question
    const sampleQuestion = await Question.findOne({ status: 1 });

    if (sampleQuestion) {
      console.log('\n📝 Sample Question:');
      console.log('Question ID:', sampleQuestion.questionId);
      console.log('Lang ID:', sampleQuestion.langId);
      console.log('Templates:', JSON.stringify(sampleQuestion.templates, null, 2));

      // Try to count with templates.id query
      const templateId = sampleQuestion.templates[0]?.id;
      if (templateId) {
        console.log(`\n🔍 Testing query for template ID: ${templateId}`);

        const count1 = await Question.countDocuments({
          'templates.id': templateId,
          langId: LANGUAGES.UZBEK,
          status: 1,
        });
        console.log(`Count with 'templates.id': ${count1}`);

        // Alternative query
        const count2 = await Question.countDocuments({
          templates: { $elemMatch: { id: templateId } },
          langId: LANGUAGES.UZBEK,
          status: 1,
        });
        console.log(`Count with $elemMatch: ${count2}`);
      }
    } else {
      console.log('❌ No questions found in database');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkQuestions();
