import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "./src/models/Admin.js";

dotenv.config();

// ============================================================
// ADMIN YARATISH SCRIPTI
// ============================================================
// Yangi admin yaratish uchun quyidagi qiymatlarni o'zgartiring:
const ADMIN_USERNAME = "auto_nur";
const ADMIN_PASSWORD = "AutoNur123";
// ============================================================

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      username: ADMIN_USERNAME.toLowerCase(),
    });

    if (existingAdmin) {
      console.log(`❌ Admin "${ADMIN_USERNAME}" already exists!`);
      console.log(
        "Agar yangi admin yaratmoqchi bo'lsangiz, ADMIN_USERNAME va ADMIN_PASSWORD ni o'zgartiring."
      );
      process.exit(0);
    }

    // Create admin user
    const admin = await Admin.create({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD, // Will be hashed automatically by pre-save hook
      isActive: true,
    });

    console.log("✅ Admin user created successfully!");
    console.log(`Username: ${ADMIN_USERNAME}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`Admin ID: ${admin._id}`);

    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error.message);
    process.exit(1);
  }
};

createAdminUser();
