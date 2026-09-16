// Load environment variables FIRST — before any other module reads process.env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const loadEnv = require("./config/env");
const env = loadEnv();
const connectDB = require("./config/db");
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
const analyticsRoutes = require("./routes/analytics.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();


// Database
connectDB();

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
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
app.use("/api/mastery", masteryRoutes);
app.use("/api/growth", growthRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);

app.use(errorMiddleware);

// Server
const startServer = () => {
  const server = app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });

  // Start background document processing worker
  startDocumentWorker();

  return server;
};

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeDocumentWorker().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDocumentWorker().catch(() => {});
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
