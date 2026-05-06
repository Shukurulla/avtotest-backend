import mongoose from 'mongoose';
import Question from './src/models/Question.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/avto-test';

async function migrateImagePaths() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Barcha questionlarni olish
    const questions = await Question.find({});
    console.log(`📊 Found ${questions.length} questions to process`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const question of questions) {
      try {
        // Body arraydan type=2 (image) bo'lgan elementni topish
        const imageBodyItem = question.body.find(item => item.type === 2);

        if (imageBodyItem && imageBodyItem.value) {
          // Value dan file extension olish
          const imagePath = imageBodyItem.value;
          const match = imagePath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

          if (match) {
            const extension = match[0]; // .jpg, .png, etc.
            const newImagePath = `images/${question.questionId}${extension}`;

            // Agar imagePath allaqachon to'g'ri bo'lsa, o'tkazib yuborish
            if (question.imagePath === newImagePath) {
              skippedCount++;
              continue;
            }

            // ImagePath ni yangilash
            question.imagePath = newImagePath;
            await question.save();

            updatedCount++;
            console.log(`✅ Updated question ${question.questionId}: ${newImagePath}`);
          } else {
            console.log(`⚠️  Question ${question.questionId}: No valid image extension found in "${imagePath}"`);
            skippedCount++;
          }
        } else {
          // Agar body da rasm yo'q bo'lsa, imagePath ni null qilish
          if (question.imagePath !== null) {
            question.imagePath = null;
            await question.save();
            updatedCount++;
            console.log(`✅ Updated question ${question.questionId}: Set imagePath to null (no image in body)`);
          } else {
            skippedCount++;
          }
        }
      } catch (err) {
        console.error(`❌ Error processing question ${question.questionId}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total questions: ${questions.length}`);
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped (already correct): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    console.log('\n✅ Migration completed!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrateImagePaths();
