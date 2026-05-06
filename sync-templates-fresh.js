import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./src/models/Question.js";
import Template from "./src/models/Template.js";
import eavtoService from "./src/services/eavtoService.js";

dotenv.config();

const LANGUAGES = { UZBEK: 1, RUSSIAN: 2, CYRILLIC_UZBEK: 3 };
const LANGUAGE_NAMES = { 1: "O'zbek", 2: "Rus", 3: "Kirill" };
const TOTAL_TEMPLATES = 60;

const stats = { deleted: 0, inserted: 0, errors: [] };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncTemplateLanguage(templateId, langId) {
  const langName = LANGUAGE_NAMES[langId];

  console.log(
    `   📥 ${templateId}-shablon ${langName} eavtotalimdan olinmoqda...`
  );

  try {
    const eavtoQuestions = await eavtoService.getTemplateQuestions(
      templateId,
      langId
    );
    const eavtoCount = eavtoQuestions?.length || 0;

    if (eavtoCount === 0) {
      console.log(
        `   ⚠️  ${templateId}-shablon ${langName} - eavtotalimda 0 ta savol`
      );
      return;
    }

    // Transform - faqat so'ralgan templateId ni qo'shamiz
    const questions = eavtoQuestions.map((q) => {
      return {
        questionId: q.id,
        langId: langId,
        body: q.body || [],
        answers: q.answers || [],
        answerDescription: q.answer_description || null,
        answerVideo: q.answer_video || null,
        comment: typeof q.comment === "string" ? q.comment : "",
        staticOrderAnswers: q.static_order_answers || 0,
        isNew: q.is_new || false,
        lessonId: q.lesson_id || null,
        status: q.status || 1,
        eduTypes: q.edu_types || [],
        imagePath: `images/${q.id}.jpg`,
        syncedAt: new Date(),
      };
    });

    // Bulkwrite - faqat templateId ni qo'shamiz (duplicate bo'lmasligi uchun)
    const bulkOps = questions.map((q) => {
      return {
        updateOne: {
          filter: { questionId: q.questionId, langId: q.langId },
          update: {
            $set: q,
            $addToSet: { templates: { id: templateId } },
          },
          upsert: true,
        },
      };
    });

    const result = await Question.bulkWrite(bulkOps);
    const insertedCount = result.upsertedCount + result.modifiedCount;
    stats.inserted += insertedCount;

    console.log(
      `   ✅ ${templateId}-shablon ${langName}: eavto=${eavtoCount}, bazaga=${insertedCount}`
    );
  } catch (error) {
    console.error(
      `   ❌ ${templateId}-shablon ${langName} xato: ${error.message}`
    );
    stats.errors.push({ templateId, langId, error: error.message });
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("🚀 EAVTOTALIM SINXRONIZATSIYA");
  console.log("═".repeat(60));

  const startTime = Date.now();

  try {
    // MongoDB ulanish
    console.log("\n📦 MongoDB ga ulanish...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB ga ulandi!");

    // BARCHA SAVOLLARNI O'CHIRISH
    console.log("\n🗑️  BARCHA SAVOLLARNI O'CHIRISH...");
    const deleteResult = await Question.deleteMany({});
    stats.deleted = deleteResult.deletedCount;
    console.log(`✅ ${stats.deleted} ta savol o'chirildi!\n`);

    // EAVTO login
    console.log("🔐 EAVTO API ga kirish...");
    await eavtoService.login();

    // Har bir shablon
    for (let templateId = 1; templateId <= TOTAL_TEMPLATES; templateId++) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(
        `📦 ${templateId}-SHABLON (${templateId}/${TOTAL_TEMPLATES})`
      );

      for (const langId of [
        LANGUAGES.UZBEK,
        LANGUAGES.RUSSIAN,
        LANGUAGES.CYRILLIC_UZBEK,
      ]) {
        await syncTemplateLanguage(templateId, langId);
        await delay(800);
      }

      // Har 10 ta shablonda token yangilash
      if (templateId % 10 === 0 && templateId < TOTAL_TEMPLATES) {
        console.log("\n🔄 Token yangilanmoqda...");
        await eavtoService.login();
      }

      // Template recordni yangilash
      const qCount = await Question.countDocuments({
        "templates.id": templateId,
        langId: 1,
        status: 1,
      });
      await Template.findOneAndUpdate(
        { templateId },
        {
          templateId,
          name: String(templateId),
          status: 1,
          questionCount: qCount,
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error("\n❌ XATO:", error.message);
  } finally {
    const duration = Math.floor((Date.now() - startTime) / 1000);

    console.log("\n" + "═".repeat(60));
    console.log("📊 NATIJA");
    console.log("═".repeat(60));
    console.log(`🗑️  O'chirilgan: ${stats.deleted}`);
    console.log(`📥 Yuklangan: ${stats.inserted}`);
    console.log(`❌ Xatolar: ${stats.errors.length}`);
    console.log(`⏱️  Vaqt: ${Math.floor(duration / 60)}m ${duration % 60}s`);

    if (stats.errors.length > 0) {
      console.log("\n❌ XATOLAR RO'YXATI:");
      stats.errors.forEach((e, i) =>
        console.log(
          `   ${i + 1}. Shablon ${e.templateId} ${LANGUAGE_NAMES[e.langId]}: ${
            e.error
          }`
        )
      );
    }

    await mongoose.disconnect();
    console.log("\n✅ Tugadi!");
  }
}

main();
