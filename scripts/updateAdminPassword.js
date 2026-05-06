import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Admin from '../src/models/Admin.js';

// Load environment variables
dotenv.config();

const updateAdminPassword = async () => {
  try {
    // Connect to MongoDB (VPS server)
    const MONGODB_URI = 'mongodb://root:SuperStrongPassword123@127.0.0.1:27017/avto-test?authSource=admin';
    console.log('Connecting to MongoDB...');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully');

    // Admin ID and new password
    const adminId = '695e399ae030170e64e76096';
    const newPassword = 'intensive_2222@!';

    // Find admin by ID
    const admin = await Admin.findById(adminId);

    if (!admin) {
      console.error('❌ Admin not found with ID:', adminId);
      process.exit(1);
    }

    console.log('📝 Found admin:', admin.username);

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password directly (bypass pre-save hook)
    await Admin.updateOne(
      { _id: adminId },
      { $set: { password: hashedPassword } }
    );

    console.log('✅ Password updated successfully!');
    console.log('Username:', admin.username);
    console.log('New password:', newPassword);

    // Verify the password
    const updatedAdmin = await Admin.findById(adminId);
    const isMatch = await bcrypt.compare(newPassword, updatedAdmin.password);

    if (isMatch) {
      console.log('✅ Password verification successful!');
    } else {
      console.error('❌ Password verification failed!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

// Run the script
updateAdminPassword();
