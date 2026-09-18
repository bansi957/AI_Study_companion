// Load environment variables FIRST — before any other module reads process.env
require("dotenv").config();
// Firebase Auth enabled

const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const loadEnv = require("./config/env");
const env = loadEnv();
const connectDB = require("./config/db");
const { initSocket } = require("./config/socket");
const errorMiddleware = require("./middleware/error.middleware");
const { startDocumentWorker, closeDocumentWorker } = require("./workers/document.worker");

const authRoutes = require("./routes/auth.routes");
const spaceRoutes = require("./routes/space.routes");
const projectRoutes = require("./routes/project.routes");
const materialRoutes = require("./routes/material.routes");
const tutorRoutes = require("./routes/tutor.routes");
const quizRoutes = require("./routes/quiz.routes");
const masteryRoutes = require("./routes/mastery.routes");
const growthRoutes = require("./routes/growth.routes");
const recommendationRoutes = require("./routes/recommendation.routes");
const activityRoutes = require("./routes/activity.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const adminRoutes = require("./routes/admin.routes");
const retrievalRoutes = require("./routes/retrieval.routes");
const retrievalService = require("./services/retrieval/retrieval.service");

const app = express();


// Database
connectDB().then(() => {
  // Non-blocking initialization of Atlas Vector Search index (does not hold up server startup)
  retrievalService.ensureVectorIndex().catch(() => {});
});

// Middleware
app.use(express.json());

app.use(
  cors({
    origin:"https://ai-study-companion-2uzu.onrender.com",
    credentials: true,
  })
);

app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/spaces", spaceRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/tutor", tutorRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/mastery", masteryRoutes);
app.use("/api/growth", growthRoutes);
app.use("/api/recommendation", recommendationRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/retrieval", retrievalRoutes);

app.use(errorMiddleware);

// Server
const startServer = () => {
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  const server = httpServer.listen(env.port, () => {
    console.log(`Server running on port ${env.port} with Socket.io active`);
  });

  // Start background document processing worker unless RUN_WORKER=false (decoupled worker deployment)
  if (process.env.RUN_WORKER !== "false") {
    startDocumentWorker();
  }

  return server;
};

// Graceful shutdown
process.on("SIGINT", async () => {
  if (process.env.RUN_WORKER !== "false") {
    await closeDocumentWorker().catch(() => {});
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (process.env.RUN_WORKER !== "false") {
    await closeDocumentWorker().catch(() => {});
  }
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
