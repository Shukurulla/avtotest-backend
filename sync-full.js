import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import axios from 'axios';
import https from 'https';
import Lesson from './src/models/Lesson.js';
import Topic from './src/models/Topic.js';
import TopicQuestion from './src/models/TopicQuestion.js';

const API_BASE_URL = 'https://back.eavtotalim.uz/v2/api';

// TOKEN argument sifatida beriladi
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('❌ Token kerak! Ishlatish: node sync-full.js "YOUR_TOKEN"');
  process.exit(1);
}

const axiosInstance = axios.create({
  timeout: 60000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    family: 4,
  }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
  },
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function syncFull() {
  try {
    console.log('🔗 MongoDB ga ulanmoqda...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URI_ATLAS);
    console.log('✅ MongoDB ulandi\n');

    let totalLessons = 0;
    let totalTopics = 0;
    let totalQuestions = 0;
    let topicsWithQuestions = 0;
    let topicsWithoutQuestions = 0;

    // 1. LESSONS olish
    console.log('📚 Darsliklar olinmoqda...');
    const lessonsResponse = await axiosInstance.get(`${API_BASE_URL}/student-content/lessons`);

    if (lessonsResponse.data.status !== 1) {
      console.error('❌ Lessons API xatosi:', lessonsResponse.data.message);
      process.exit(1);
    }

    const lessons = lessonsResponse.data.data;
    console.log(`✅ ${lessons.length} ta darslik topildi\n`);

    for (const item of lessons) {
      // Sinov darsliklarni o'tkazib yuborish
      if (item.lesson.id === 1000 || item.lesson.id === 1001) {
        console.log(`⏭️  O'tkazildi: ${item.lesson.name.uz}`);
        continue;
      }

      console.log(`\n📖 DARSLIK: ${item.lesson.name.uz}`);

      // Lessonni saqlash
      await Lesson.findOneAndUpdate(
        { externalId: item.id },
        {
          externalId: item.id,
          lessonId: item.lesson.id,
          name: {
            uz: item.lesson.name.uz || '',
            ru: item.lesson.name.ru || '',
            kiril: item.lesson.name.kiril || '',
          },
          shortName: item.lesson.short_name || '',
          status: 1,
          syncedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      totalLessons++;

      // 2. TOPICS olish
      await delay(500);

      try {
        const topicsResponse = await axiosInstance.get(
          `${API_BASE_URL}/student-content/topics?edu_type_lesson_id=${item.id}&page=1&show_count=100`
        );

        if (topicsResponse.data.status === 1) {
          const topics = topicsResponse.data.data.data || [];
          console.log(`   📂 ${topics.length} ta mavzu topildi`);

          for (const topicItem of topics) {
            console.log(`      📌 Mavzu: ${topicItem.name?.uz || topicItem.id}`);

            // Topicni saqlash
            await Topic.findOneAndUpdate(
              { topicId: topicItem.id },
              {
                topicId: topicItem.id,
                lessonExternalId: item.id,
                type: topicItem.type || 1,
                name: {
                  uz: topicItem.name?.uz || '',
                  ru: topicItem.name?.ru || '',
                  kiril: topicItem.name?.kiril || '',
                },
                topicActionLimit: topicItem.topic_action_limit ? {
                  id: topicItem.topic_action_limit.id,
                  topicId: topicItem.topic_action_limit.topic_id,
                  timeLimit: topicItem.topic_action_limit.time_limit || 600,
                } : null,
                status: 1,
                syncedAt: new Date(),
              },
              { upsert: true, new: true }
            );
            totalTopics++;

            // 3. QUESTIONS olish (faqat O'zbekcha - langId=1)
            await delay(500);

            try {
              const questionsResponse = await axiosInstance.get(
                `${API_BASE_URL}/exam-topic-test/start/${topicItem.id}/1?template_id=${topicItem.id}&lang_id=1`
              );

              if (questionsResponse.data.status === 1 && questionsResponse.data.data) {
                const questions = questionsResponse.data.data;

                if (questions.length > 0) {
                  console.log(`         ✅ ${questions.length} ta savol`);
                  topicsWithQuestions++;

                  for (const qItem of questions) {
                    const questionData = qItem.question;

                    // Comment ni string ga o'zgartirish
                    let commentValue = questionData.comment;
                    if (commentValue && typeof commentValue === 'object') {
                      commentValue = commentValue.comment || JSON.stringify(commentValue);
                    }

                    await TopicQuestion.findOneAndUpdate(
                      { examTopicTestId: qItem.id, langId: 1 },
                      {
                        examTopicTestId: qItem.id,
                        topicId: topicItem.id,
                        questionId: questionData.id,
                        langId: 1,
                        body: questionData.body || [],
                        answers: questionData.answers || [],
                        comment: commentValue,
                        staticOrderAnswers: questionData.static_order_answers || 0,
                        order: qItem.order,
                        testType: qItem.test_type,
                        sourceId: qItem.source_id,
                        status: 1,
                        syncedAt: new Date(),
                      },
                      { upsert: true, new: true }
                    );
                    totalQuestions++;
                  }

                  // Topic questionCount yangilash
                  await Topic.findOneAndUpdate(
                    { topicId: topicItem.id },
                    { questionCount: questions.length }
                  );
                } else {
                  console.log(`         ⚠️ Savollar yo'q`);
                  topicsWithoutQuestions++;
                  await Topic.findOneAndUpdate(
                    { topicId: topicItem.id },
                    { questionCount: 0 }
                  );
                }
              } else {
                console.log(`         ⚠️ Savollar yo'q (API: ${questionsResponse.data.message || 'empty'})`);
                topicsWithoutQuestions++;
                await Topic.findOneAndUpdate(
                  { topicId: topicItem.id },
                  { questionCount: 0 }
                );
              }
            } catch (qErr) {
              if (qErr.response?.status === 429) {
                console.log(`         ⚠️ Rate limit! 30s kutilmoqda...`);
                await delay(30000);
              } else {
                console.log(`         ❌ Savol xatosi: ${qErr.message}`);
              }
              topicsWithoutQuestions++;
              await Topic.findOneAndUpdate(
                { topicId: topicItem.id },
                { questionCount: 0 }
              );
            }
          }

          // Lesson topicCount yangilash
          await Lesson.findOneAndUpdate(
            { externalId: item.id },
            { topicCount: topics.length }
          );
        } else {
          console.log(`   ❌ Topics xatosi: ${topicsResponse.data.message}`);
        }
      } catch (tErr) {
        if (tErr.response?.status === 429) {
          console.log(`   ⚠️ Rate limit! 30s kutilmoqda...`);
          await delay(30000);
        } else {
          console.log(`   ❌ Topics xatosi: ${tErr.message}`);
        }
      }
    }

    console.log('\n========================================');
    console.log('🎉 SYNC TUGADI!');
    console.log('========================================');
    console.log(`📚 Darsliklar: ${totalLessons}`);
    console.log(`📂 Mavzular: ${totalTopics}`);
    console.log(`   ✅ Savollar bilan: ${topicsWithQuestions}`);
    console.log(`   ⚠️ Savolsiz: ${topicsWithoutQuestions}`);
    console.log(`📝 Savollar: ${totalQuestions}`);
    console.log('========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

syncFull();
