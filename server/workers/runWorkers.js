require("dotenv").config();
const connectDB = require("../config/db");
const { startDocumentWorker, closeDocumentWorker } = require("./document.worker");

/**
 * Dedicated Background Worker Process Entry Point
 * Runs the BullMQ workers decoupled from the HTTP API server.
 */
const start = async () => {
  console.log("[Worker Process] Starting standalone background worker process...");
  await connectDB();
  startDocumentWorker();
  console.log("[Worker Process] All background workers successfully initialized and listening for jobs.");
};

process.on("SIGINT", async () => {
  console.log("[Worker Process] Shutting down workers (SIGINT)...");
  await closeDocumentWorker().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker Process] Shutting down workers (SIGTERM)...");
  await closeDocumentWorker().catch(() => {});
  process.exit(0);
});

start().catch((err) => {
  console.error("[Worker Process] Failed to initialize background workers:", err);
  process.exit(1);
});
