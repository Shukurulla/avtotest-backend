import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "./src/models/Admin.js";
import ErrorTrackingUser from "./src/models/ErrorTrackingUser.js";

dotenv.config();

// ============================================================
// USER MIGRATION SCRIPTI
// ============================================================
// Bu script mavjud barcha ErrorTrackingUser larni
// intensive_admin ga bog'laydi
// ============================================================

const migrateUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    // intensive_admin ni topish
    const admin = await Admin.findOne({ username: "intensive_admin" });

    if (!admin) {
      console.log("❌ intensive_admin topilmadi!");
      console.log("Avval createAdmin.js ni ishga tushiring.");
      process.exit(1);
    }

    console.log(`✅ Admin topildi: ${admin.username} (${admin._id})`);

    // createdBy bo'lmagan barcha userlarni topish
    const usersWithoutAdmin = await ErrorTrackingUser.find({
      $or: [
        { createdBy: { $exists: false } },
        { createdBy: null }
      ]
    });

    if (usersWithoutAdmin.length === 0) {
      console.log("✅ Barcha userlar allaqachon adminga bog'langan!");
      process.exit(0);
    }

    console.log(`📊 ${usersWithoutAdmin.length} ta user topildi (adminsiz)`);

    // Userlarni intensive_admin ga bog'lash
    const result = await ErrorTrackingUser.updateMany(
      {
        $or: [
          { createdBy: { $exists: false } },
          { createdBy: null }
        ]
      },
      { $set: { createdBy: admin._id } }
    );

    console.log(`✅ ${result.modifiedCount} ta user intensive_admin ga bog'landi!`);

    process.exit(0);
  } catch (error) {
    console.error("Error during migration:", error.message);
    process.exit(1);
  }
};

migrateUsers();
