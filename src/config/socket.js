import { Server } from "socket.io";

let io = null;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const isDevConn = process.env.NODE_ENV !== "production";

  io.on("connection", (socket) => {
    if (isDevConn) console.log("🔌 Client connected:", socket.id);

    // Admin monitoring uchun room
    socket.on("join-admin-room", (adminId) => {
      socket.join(`admin-${adminId}`);
      if (isDevConn) console.log(`Admin ${adminId} joined monitoring room`);
    });

    // Ichki test monitoring uchun room
    socket.on("join-internal-room", () => {
      socket.join("internal-test-room");
      if (isDevConn) console.log("Admin joined internal test monitoring room");
    });

    // Nukus-2 admin monitoring uchun room
    socket.on("join-nukus-admin", () => {
      socket.join("nukus-admin-room");
      if (isDevConn) console.log("Nukus admin joined monitoring room");
    });

    socket.on("disconnect", () => {
      if (isDevConn) console.log("❌ Client disconnected:", socket.id);
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

const isDev = process.env.NODE_ENV !== "production";

// Test boshlanganda event yuborish
export const emitTestStarted = (adminId, testData) => {
  if (!io) return;
  if (isDev) console.log(`📤 test-started → admin-${adminId}: ${testData.odamFullName}`);
  io.to(`admin-${adminId}`).emit("test-started", testData);
};

// Test davomida javob berilganda (yuqori chastotali — log yo'q)
export const emitTestProgress = (adminId, progressData) => {
  if (!io) return;
  io.to(`admin-${adminId}`).emit("test-progress", progressData);
};

// Test tugaganda
export const emitTestFinished = (adminId, resultData) => {
  if (!io) return;
  if (isDev) console.log(`📤 test-finished → admin-${adminId}: ${resultData.odamFullName} (${resultData.score})`);
  io.to(`admin-${adminId}`).emit("test-finished", resultData);
};

// Ichki test boshlanganda (global room ga)
export const emitInternalTestStarted = (testData) => {
  if (!io) return;
  if (isDev) console.log(`📤 internal-test-started: ${testData.odamFullName}`);
  io.to("internal-test-room").emit("internal-test-started", testData);
};

// Ichki test progress (yuqori chastotali — log yo'q)
export const emitInternalTestProgress = (progressData) => {
  if (!io) return;
  io.to("internal-test-room").emit("internal-test-progress", progressData);
};

// Ichki test tugaganda (global room ga)
export const emitInternalTestFinished = (resultData) => {
  if (!io) return;
  if (isDev) console.log(`📤 internal-test-finished: ${resultData.odamFullName} (${resultData.score})`);
  io.to("internal-test-room").emit("internal-test-finished", resultData);
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
