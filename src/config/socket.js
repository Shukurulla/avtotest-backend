import { Server } from "socket.io";

let io = null;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Admin monitoring uchun room
    socket.on("join-admin-room", (adminId) => {
      socket.join(`admin-${adminId}`);
      console.log(`Admin ${adminId} joined monitoring room`);
    });

    // Ichki test monitoring uchun room
    socket.on("join-internal-room", () => {
      socket.join("internal-test-room");
      console.log("Admin joined internal test monitoring room");
    });

    // Nukus-2 admin monitoring uchun room
    socket.on("join-nukus-admin", () => {
      socket.join("nukus-admin-room");
      console.log("Nukus admin joined monitoring room");
    });

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

// Test boshlanganda event yuborish
export const emitTestStarted = (adminId, testData) => {
  console.log(`📤 Emitting test-started to admin-${adminId}:`, testData.odamFullName);
  if (io) {
    io.to(`admin-${adminId}`).emit("test-started", testData);
  }
};

// Test davomida javob berilganda
export const emitTestProgress = (adminId, progressData) => {
  console.log(`📤 Emitting test-progress to admin-${adminId}`);
  if (io) {
    io.to(`admin-${adminId}`).emit("test-progress", progressData);
  }
};

// Test tugaganda
export const emitTestFinished = (adminId, resultData) => {
  console.log(`📤 Emitting test-finished to admin-${adminId}:`, resultData.odamFullName, resultData.score);
  if (io) {
    io.to(`admin-${adminId}`).emit("test-finished", resultData);
  }
};

// Ichki test boshlanganda (global room ga)
export const emitInternalTestStarted = (testData) => {
  console.log(`📤 Emitting internal-test-started:`, testData.odamFullName);
  if (io) {
    io.to("internal-test-room").emit("internal-test-started", testData);
  }
};

// Ichki test progress
export const emitInternalTestProgress = (progressData) => {
  console.log(`📤 Emitting internal-test-progress`);
  if (io) {
    io.to("internal-test-room").emit("internal-test-progress", progressData);
  }
};

// Ichki test tugaganda (global room ga)
export const emitInternalTestFinished = (resultData) => {
  console.log(`📤 Emitting internal-test-finished:`, resultData.odamFullName, resultData.score);
  if (io) {
    io.to("internal-test-room").emit("internal-test-finished", resultData);
  }
};

// Nukus-2 test boshlanganda
export const emitNukusTestStarted = (testData) => {
  if (io) {
    io.to("nukus-admin-room").emit("nukus-test-started", testData);
  }
};

// Nukus-2 test progress
export const emitNukusTestProgress = (progressData) => {
  if (io) {
    io.to("nukus-admin-room").emit("nukus-test-progress", progressData);
  }
};

// Nukus-2 test tugaganda
export const emitNukusTestFinished = (resultData) => {
  if (io) {
    io.to("nukus-admin-room").emit("nukus-test-finished", resultData);
  }
};

export default { initSocket, getIO, emitTestStarted, emitTestProgress, emitTestFinished, emitInternalTestStarted, emitInternalTestProgress, emitInternalTestFinished, emitNukusTestStarted, emitNukusTestProgress, emitNukusTestFinished };
