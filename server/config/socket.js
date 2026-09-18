const { Server } = require("socket.io");

let io = null;

/**
 * Initialize Socket.io with HTTP server
 *
 * @param {import("http").Server} httpServer
 * @returns {Server}
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Allow client to join room for specific project updates
    socket.on("join:project", (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
        console.log(`[Socket.io] Socket ${socket.id} joined room project:${projectId}`);
      }
    });

    socket.on("leave:project", (projectId) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Get current Socket.io instance
 *
 * @returns {Server|null}
 */
const getIO = () => {
  return io;
};

/**
 * Broadcast material status change to rooms and globally
 *
 * @param {Object} payload - { projectId, materialId, status, stage, pageCount, originalName, error }
 */
const emitMaterialUpdate = ({
  projectId,
  materialId,
  status,
  stage = null,
  pageCount = null,
  originalName = null,
  error = null,
}) => {
  if (!io) return;

  const data = {
    projectId: projectId ? projectId.toString() : null,
    materialId: materialId ? materialId.toString() : null,
    status, // "QUEUED" | "PROCESSING" | "READY" | "FAILED"
    stage,  // e.g. "Extracting text", "Generating concepts", etc.
    pageCount,
    originalName,
    error,
    timestamp: new Date().toISOString(),
  };

  if (projectId) {
    io.to(`project:${projectId}`).emit("material:status", data);
  }
  // Also emit globally for any project-agnostic dashboard listeners
  io.emit("material:status", data);
};

module.exports = {
  initSocket,
  getIO,
  emitMaterialUpdate,
};
