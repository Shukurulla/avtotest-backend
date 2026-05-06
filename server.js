import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import cron from "node-cron";
import multer from "multer";
import connectDB from "./src/config/database.js";
import { errorHandler } from "./src/utils/errorHandler.js";
// import syncService from "./src/services/syncService.js";
import { initSocket } from "./src/config/socket.js";

// Routes
import authRoutes from "./src/routes/authRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import testRoutes from "./src/routes/testRoutes.js";
import imageRoutes from "./src/routes/imageRoutes.js";
import setupRoutes from "./src/routes/setupRoutes.js";
import konkursRoutes from "./src/routes/konkursRoutes.js";
import errorTrackingRoutes from "./src/routes/errorTrackingRoutes.js";
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import monitoringRoutes from "./src/routes/monitoringRoutes.js";
import topicTestRoutes from "./src/routes/topicTestRoutes.js";
import nukusMonitoringRoutes from "./src/routes/nukusMonitoringRoutes.js";
import intensiveAdminRoutes from "./src/routes/intensiveAdminRoutes.js";
import Template from "./src/models/Template.js";
import Question from "./src/models/Question.js";
import KonkursQuestionPool from "./src/models/KonkursQuestionPool.js";

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Serve static files from images directory
app.use("/images", express.static("images"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/konkurs", konkursRoutes);
app.use("/api/error-tracking", errorTrackingRoutes);
app.use("/api/admin-auth", adminAuthRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/topic-test", topicTestRoutes);
app.use("/api/nukus-monitoring", nukusMonitoringRoutes);
app.use("/api/intensive-admin", intensiveAdminRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});
app.get("/questions", async (req, res) => {
  try {
    const questions = await Question.countDocuments({ langId: 1 });
    res.json({ data: questions });
  } catch (error) {
    res.json({ error });
  }
});

// Images API - rasm nomlarini olish
const imagesDir = path.resolve("images");

app.get("/api/images/list", (req, res) => {
  try {
    const files = fs.readdirSync(imagesDir).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
    });
    res.json({ success: true, count: files.length, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Images API - rasm yuklash (mavjud bo'lsa qabul qilmaydi)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
  fileFilter: (req, file, cb) => {
    const filePath = path.join(imagesDir, file.originalname);
    if (fs.existsSync(filePath)) {
      req.skippedFiles = req.skippedFiles || [];
      req.skippedFiles.push(file.originalname);
      return cb(null, false); // qabul qilma
    }
    cb(null, true);
  },
});

app.post("/api/images/upload", upload.array("images", 100), (req, res) => {
  const saved = (req.files || []).map((f) => f.originalname);
  const skipped = req.skippedFiles || [];
  res.json({
    success: true,
    saved: saved.length,
    skipped: skipped.length,
    savedFiles: saved,
    skippedFiles: skipped,
  });
});

// Images SYNC API - yo'q bo'lsa qo'shadi, bor bo'lsa ustiga yozadi
const uploadSync = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

app.post("/api/images/sync", (req, res, next) => {
  // Multer ishga tushishidan oldin mavjud fayllar ro'yxatini olish
  const existingFiles = new Set(fs.readdirSync(imagesDir));
  req._existingFiles = existingFiles;
  next();
}, uploadSync.array("images", 200), (req, res) => {
  const newFiles = [];
  const replacedFiles = [];

  for (const file of req.files || []) {
    if (req._existingFiles.has(file.originalname)) {
      replacedFiles.push(file.originalname);
    } else {
      newFiles.push(file.originalname);
    }
  }

  res.json({
    success: true,
    total: (req.files || []).length,
    new: newFiles.length,
    replaced: replacedFiles.length,
    newFiles,
    replacedFiles,
  });
});

// Error handler
app.use(errorHandler);

// Cron job for daily synchronization at 02:00 AM

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1";

// HTTP server va Socket.IO
const server = createServer(app);
const io = initSocket(server);

// Socket.IO ni global qilish
app.set("io", io);

server.listen(PORT, HOST, () => {
  console.log(
    `🚀 Server running on ${HOST}:${PORT} in ${process.env.NODE_ENV} mode`,
  );
  console.log(`📡 Socket.IO ready for real-time connections`);
});
