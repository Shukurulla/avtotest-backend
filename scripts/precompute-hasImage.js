import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "../src/models/Question.js";

dotenv.config();

const BATCH_SIZE = 1000;

const precomputeHasImage = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI .env'da topilmadi");
    process.exit(1);
  }

  console.log("🔌 MongoDB ga ulanmoqda...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Ulandi\n");

  const total = await Question.countDocuments();
  console.log(`📊 Jami savollar: ${total}`);

  let processed = 0;
  let withImage = 0;
  let withoutImage = 0;
  let lastId = null;

  while (true) {
    const filter = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Question.find(filter)
      .select("_id body")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (batch.length === 0) break;

    const ops = batch.map((q) => {
      const hasImage = (q.body || []).some((item) => item.type === 2);
      if (hasImage) withImage++;
      else withoutImage++;
      return {
        updateOne: {
          filter: { _id: q._id },
          update: { $set: { hasImage } },
        },
      };
    });

    await Question.bulkWrite(ops, { ordered: false });

    processed += batch.length;
    lastId = batch[batch.length - 1]._id;
    console.log(`   ✓ ${processed}/${total} ishlandi`);
  }

  console.log(`\n📈 Natija:`);
  console.log(`   Rasm bilan: ${withImage}`);
  console.log(`   Rasmsiz: ${withoutImage}`);
  console.log(`   Jami: ${processed}`);
  console.log(`\n✅ Tayyor`);

  await mongoose.disconnect();
  process.exit(0);
};

precomputeHasImage().catch((err) => {
  console.error("❌ Xatolik:", err.message);
  process.exit(1);
});
