// Load environment variables FIRST — before any other module reads process.env
require("dotenv").config();

const connectDB = require("./config/db");
const { startDocumentWorker, closeDocumentWorker } = require("./workers/document.worker");

/**
 * Dedicated Background Worker Process Entry File.
 *
 * Runs decoupled BullMQ workers:
 *  1. document-extraction worker (Extraction & semantic chunking)
 *  2. embedding worker (Vector embeddings via local ONNX model)
 *  3. knowledge-extraction worker (Pedagogical concepts via Groq/Heuristic)
 *
 * Separating workers from the web server (server.js) prevents memory exhaustion
 * on constrained hosting environments (e.g. Render 512MB RAM tier).
 */
const startWorker = async () => {
  console.log("[Worker Process] Starting background worker process...");

  // 1. Connect to MongoDB using existing environment configuration
  await connectDB();

  // 2. Start existing decoupled workers with concurrency 1
  const activeWorkers = startDocumentWorker();

  console.log("[Worker Process] All background workers successfully initialized and listening for jobs.");
  return activeWorkers;
};

// Graceful shutdown handling
const handleShutdown = async (signal) => {
  console.log(`[Worker Process] Received ${signal}. Gracefully stopping all workers...`);
  try {
    await closeDocumentWorker();
    console.log("[Worker Process] All workers stopped cleanly.");
  } catch (err) {
    console.error("[Worker Process] Error stopping workers:", err.message);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

if (require.main === module) {
  startWorker().catch((err) => {
    console.error("[Worker Process] Fatal error starting workers:", err);
    process.exit(1);
  });
}

module.exports = { startWorker };
