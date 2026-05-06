import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import Lesson from './src/models/Lesson.js';
import Topic from './src/models/Topic.js';
import TopicQuestion from './src/models/TopicQuestion.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_ATLAS;

async function importManualData() {
  try {
    console.log('🔗 MongoDB ga ulanmoqda...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB ulandi\n');

    // 1. Eski ma'lumotlarni o'chirish
    console.log("🗑️  Eski ma'lumotlar o'chirilmoqda...");
    await Lesson.deleteMany({});
    await Topic.deleteMany({});
    await TopicQuestion.deleteMany({});
    console.log("✅ Eski ma'lumotlar o'chirildi\n");

    // 2. JSON faylni o'qish
    console.log("📖 JSON fayl o'qilmoqda...");
    const jsonData = JSON.parse(fs.readFileSync('/Users/shukurulla/Desktop/projects/intensiv-avto-test-samarqand/qolda_scraping.json', 'utf8'));
    console.log(`✅ ${jsonData.lessons.length} ta darslik topildi\n`);

    let totalLessons = 0;
    let totalTopics = 0;
    let totalQuestions = 0;

    // 3. Import qilish
    for (let i = 0; i < jsonData.lessons.length; i++) {
      const lessonData = jsonData.lessons[i];
      console.log(`📚 ${i + 1}. ${lessonData.lessonName}`);

      // Lesson yaratish
      const lesson = await Lesson.create({
        externalId: i + 1,
        lessonId: i + 1,
        name: {
          uz: lessonData.lessonName,
          ru: lessonData.lessonName,
          kiril: lessonData.lessonName,
        },
        shortName: lessonData.lessonName.substring(0, 10),
        topicCount: lessonData.topics.length,
        status: 1,
        syncedAt: new Date(),
      });
      totalLessons++;

      // Topics
      for (const topicData of lessonData.topics) {
        const questionCount = topicData.tests ? topicData.tests.length : 0;
        console.log(`   📂 ${topicData.name.uz} (${questionCount} savol)`);

        const topic = await Topic.create({
          topicId: topicData.id,
          lessonExternalId: lesson.externalId,
          type: topicData.type || 1,
          name: {
            uz: topicData.name.uz || '',
            ru: topicData.name.ru || '',
            kiril: topicData.name.kiril || '',
          },
          topicActionLimit: topicData.topic_action_limit ? {
            id: topicData.topic_action_limit.id,
            topicId: topicData.topic_action_limit.topic_id,
            timeLimit: topicData.topic_action_limit.time_limit || 600,
          } : null,
          questionCount: questionCount,
          status: 1,
          syncedAt: new Date(),
        });
        totalTopics++;

        // Questions
        if (topicData.tests && topicData.tests.length > 0) {
          for (const testItem of topicData.tests) {
            const questionData = testItem.question;

            // Comment ni tekshirish
            let commentValue = questionData.comment;
            if (commentValue && typeof commentValue === 'object') {
              commentValue = commentValue.comment || JSON.stringify(commentValue);
            }

            await TopicQuestion.create({
              examTopicTestId: testItem.id,
              topicId: topicData.id,
              questionId: questionData.id,
              langId: questionData.lang_id || 1,
              body: questionData.body || [],
              answers: questionData.answers || [],
              comment: commentValue,
              staticOrderAnswers: questionData.static_order_answers || 0,
              order: testItem.order,
              testType: testItem.test_type,
              sourceId: testItem.source_id,
              status: 1,
              syncedAt: new Date(),
            });
            totalQuestions++;
          }
        }
      }
    }

    console.log('\n========================================');
    console.log('🎉 IMPORT TUGADI!');
    console.log('========================================');
    console.log(`📚 Darsliklar: ${totalLessons}`);
    console.log(`📂 Mavzular: ${totalTopics}`);
    console.log(`📝 Savollar: ${totalQuestions}`);
    console.log('========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    console.error(error);
    process.exit(1);
  }
}

importManualData();
