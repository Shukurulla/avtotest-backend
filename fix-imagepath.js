import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "./src/models/Question.js";

dotenv.config();

async function fixImagePaths() {
  console.log("═".repeat(60));
  console.log("🔧 IMAGEPATH TO'G'IRLASH");
  console.log("═".repeat(60));

  try {
    // MongoDB ulanish
    console.log("\n📦 MongoDB ga ulanish...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB ga ulandi!");

    // Body ichida order: 2 (rasm) bo'lmagan savollarni topish
    // ya'ni body massivida type: 2 yoki order: 2 bo'lgan element yo'q
    const questionsWithoutImage = await Question.find({
      $and: [
        { "body.order": { $ne: 2 } }, // order: 2 yo'q
        { imagePath: { $ne: null } }, // imagePath null emas
      ],
    }).countDocuments();

    console.log(`\n📊 Rasmsiz savollar soni: ${questionsWithoutImage}`);

    // Yangilash
    console.log("\n🔄 imagePath larni null ga o'zgartirish...");

    const result = await Question.updateMany(
      {
        // body ichida order: 2 bo'lgan element yo'q
        "body.order": { $ne: 2 },
      },
      {
        $set: { imagePath: null },
      }
    );

    console.log(`✅ ${result.modifiedCount} ta savol yangilandi!`);

    // Tekshirish
    const remaining = await Question.countDocuments({
      imagePath: { $ne: null },
    });
    const nullImagePath = await Question.countDocuments({
      imagePath: null,
    });

    console.log("\n📊 NATIJA:");
    console.log(`   Rasmli savollar (imagePath bor): ${remaining}`);
    console.log(`   Rasmsiz savollar (imagePath null): ${nullImagePath}`);
  } catch (error) {
    console.error("\n❌ XATO:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Tugadi!");
  }
}

fixImagePaths();
