const mongoose = require("mongoose");
const User = require("../../models/User");
const Space = require("../../models/Space");
const Project = require("../../models/Project");
const Material = require("../../models/Material");
const Activity = require("../../models/Activity");
const AIUsage = require("../../models/AIUsage");
const { documentQueue } = require("../../queues/document.queue");
const { documentWorker } = require("../../workers/document.worker");
const redisConfig = require("../../config/redis");
const { Redis } = require("ioredis");

let _healthRedisClient = null;
const getHealthRedisClient = () => {
  if (!_healthRedisClient) {
    _healthRedisClient = new Redis(redisConfig.connection);
  }
  return _healthRedisClient;
};


/**
 * Get top-level platform overview metrics.
 */
const getDashboardOverview = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUserIds,
    totalSpaces,
    totalProjects,
    totalMaterials,
    queuedMaterials,
    processingMaterials,
    readyMaterials,
    failedMaterials,
    totalAIRequests,
    successfulAIRequests,
    failedAIRequests,
  ] = await Promise.all([
    User.countDocuments({}),
    Activity.distinct("userId", { createdAt: { $gte: thirtyDaysAgo } }).catch(() => []),
    Space.countDocuments({}),
    Project.countDocuments({}),
    Material.countDocuments({}),
    Material.countDocuments({ status: "QUEUED" }),
    Material.countDocuments({ status: "PROCESSING" }),
    Material.countDocuments({ status: "READY" }),
    Material.countDocuments({ status: "FAILED" }),
    AIUsage.countDocuments({}),
    AIUsage.countDocuments({ success: true }),
    AIUsage.countDocuments({ success: false }),
  ]);

  return {
    totalUsers,
    totalActiveUsers: activeUserIds.length,
    totalSpaces,
    totalProjects,
    totalMaterials,
    materialsStatus: {
      queued: queuedMaterials,
      processing: processingMaterials,
      ready: readyMaterials,
      failed: failedMaterials,
    },
    aiRequests: {
      total: totalAIRequests,
      successful: successfulAIRequests,
      failed: failedAIRequests,
    },
  };
};

/**
 * Get paginated list of users with spaces and projects counts.
 */
const getUsers = async ({ page = 1, limit = 20, search, role } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (role) {
    query.role = role;
  }
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [total, rawUsers] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  // Enrich users with counts and last activity
  const users = await Promise.all(
    rawUsers.map(async (u) => {
      const [spacesCount, projectsCount, materialsCount, lastActivity] = await Promise.all([
        Space.countDocuments({ userId: u._id }),
        Project.countDocuments({ userId: u._id }),
        Material.countDocuments({ userId: u._id }),
        Activity.findOne({ userId: u._id }).sort({ createdAt: -1 }).select("createdAt").lean(),
      ]);

      return {
        ...u,
        spacesCount,
        projectsCount,
        materialsCount,
        lastActivityAt: lastActivity ? lastActivity.createdAt : null,
      };
    })
  );

  return {
    users,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get full user details for inspection.
 */
const getUserById = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user) {
    return null;
  }

  const [spacesCount, projectsCount, materialsCount, recentActivity, aiAgg] = await Promise.all([
    Space.countDocuments({ userId }),
    Project.countDocuments({ userId }),
    Material.countDocuments({ userId }),
    Activity.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    AIUsage.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalInputTokens: { $sum: "$inputTokens" },
          totalOutputTokens: { $sum: "$outputTokens" },
          totalCost: { $sum: "$estimatedCost" },
        },
      },
    ]),
  ]);

  const aiStats = aiAgg[0] || {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
  };

  return {
    user,
    stats: {
      spacesCount,
      projectsCount,
      materialsCount,
      aiUsage: {
        totalRequests: aiStats.totalRequests,
        totalTokens: aiStats.totalInputTokens + aiStats.totalOutputTokens,
        totalCost: Number(aiStats.totalCost.toFixed(6)),
      },
    },
    recentActivity,
  };
};

/**
 * Inspect projects with owner and material counts.
 */
const getProjects = async ({ page = 1, limit = 20, search, userId, spaceId } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    query.userId = userId;
  }
  if (spaceId && mongoose.Types.ObjectId.isValid(spaceId)) {
    query.spaceId = spaceId;
  }
  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  const [total, rawProjects] = await Promise.all([
    Project.countDocuments(query),
    Project.find(query)
      .populate("userId", "name email role")
      .populate("spaceId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  const projects = await Promise.all(
    rawProjects.map(async (p) => {
      const materialsCount = await Material.countDocuments({ projectId: p._id });
      return {
        ...p,
        materialsCount,
      };
    })
  );

  return {
    projects,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Inspect learning activity stream across the platform.
 */
const getActivities = async ({ page = 1, limit = 20, userId, projectId, type } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    query.userId = userId;
  }
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    query.projectId = projectId;
  }
  if (type) {
    query.type = type;
  }

  const [total, activities] = await Promise.all([
    Activity.countDocuments(query),
    Activity.find(query)
      .populate("userId", "name email")
      .populate("projectId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  return {
    activities,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get aggregated AI usage metrics by model and feature.
 */
const getAIUsageSummary = async ({ feature, model, startDate, endDate } = {}) => {
  const match = {};

  if (feature) {
    match.feature = feature;
  }
  if (model) {
    match.model = model;
  }

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) {
      match.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      match.createdAt.$lte = new Date(endDate);
    }
  }

  const [breakdown, overallTotals] = await Promise.all([
    AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: { model: "$model", feature: "$feature" },
          requestCount: { $sum: 1 },
          averageLatency: { $avg: "$latency" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          estimatedCost: { $sum: "$estimatedCost" },
          successCount: { $sum: { $cond: ["$success", 1, 0] } },
          failureCount: { $sum: { $cond: ["$success", 0, 1] } },
        },
      },
      { $sort: { requestCount: -1 } },
    ]),
    AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          averageLatency: { $avg: "$latency" },
          totalInputTokens: { $sum: "$inputTokens" },
          totalOutputTokens: { $sum: "$outputTokens" },
          totalCost: { $sum: "$estimatedCost" },
          successfulRequests: { $sum: { $cond: ["$success", 1, 0] } },
          failedRequests: { $sum: { $cond: ["$success", 0, 1] } },
        },
      },
    ]),
  ]);

  const summary = overallTotals[0]
    ? {
        totalRequests: overallTotals[0].totalRequests,
        averageLatency: Math.round(overallTotals[0].averageLatency || 0),
        totalInputTokens: overallTotals[0].totalInputTokens,
        totalOutputTokens: overallTotals[0].totalOutputTokens,
        totalTokens: overallTotals[0].totalInputTokens + overallTotals[0].totalOutputTokens,
        totalCost: Number(overallTotals[0].totalCost.toFixed(6)),
        successfulRequests: overallTotals[0].successfulRequests,
        failedRequests: overallTotals[0].failedRequests,
      }
    : {
        totalRequests: 0,
        averageLatency: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        successfulRequests: 0,
        failedRequests: 0,
      };

  const formattedBreakdown = breakdown.map((item) => ({
    model: item._id.model,
    feature: item._id.feature,
    requestCount: item.requestCount,
    averageLatency: Math.round(item.averageLatency || 0),
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    totalTokens: item.inputTokens + item.outputTokens,
    estimatedCost: Number(item.estimatedCost.toFixed(6)),
    successCount: item.successCount,
    failureCount: item.failureCount,
  }));

  return {
    summary,
    breakdown: formattedBreakdown,
  };
};

/**
 * Get processing status counts and detailed inspection.
 */
const getProcessingMonitoring = async () => {
  const [queued, processing, ready, failed, recentFailed, currentlyProcessing, recentReady] =
    await Promise.all([
      Material.countDocuments({ status: "QUEUED" }),
      Material.countDocuments({ status: "PROCESSING" }),
      Material.countDocuments({ status: "READY" }),
      Material.countDocuments({ status: "FAILED" }),
      Material.find({ status: "FAILED" })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("_id filename originalName projectId userId processingError createdAt updatedAt")
        .lean(),
      Material.find({ status: "PROCESSING" })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("_id filename originalName projectId userId createdAt updatedAt")
        .lean(),
      Material.find({ status: "READY" })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("_id filename originalName pageCount processedAt createdAt")
        .lean(),
    ]);

  let queueMetrics = null;
  if (documentQueue && typeof documentQueue.getJobCounts === "function") {
    try {
      queueMetrics = await documentQueue.getJobCounts("waiting", "active", "completed", "failed");
    } catch {
      queueMetrics = { status: "unavailable" };
    }
  }

  return {
    counts: {
      QUEUED: queued,
      PROCESSING: processing,
      READY: ready,
      FAILED: failed,
      total: queued + processing + ready + failed,
    },
    recentFailedMaterials: recentFailed,
    currentlyProcessingMaterials: currentlyProcessing,
    recentReadyMaterials: recentReady,
    queue: queueMetrics,
  };
};

/**
 * Probe platform health safely (MongoDB, Redis, Document Worker).
 * Strictly omits passwords, URIs, and connection credentials.
 */
const getSystemHealth = async () => {
  const timestamp = new Date().toISOString();

  // 1. MongoDB Health
  let mongoStatus = "disconnected";
  let mongoLatencyMs = null;
  const mongoReadyState = mongoose.connection.readyState;

  if (mongoReadyState === 1) {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      mongoLatencyMs = Date.now() - start;
      mongoStatus = "connected";
    } catch (err) {
      mongoStatus = "degraded";
    }
  } else if (mongoReadyState === 2) {
    mongoStatus = "connecting";
  }

  // 2. Redis Health
  let redisStatus = "disconnected";
  let redisLatencyMs = null;

  try {
    const client = getHealthRedisClient();
    const start = Date.now();
    const pong = await client.ping();
    if (pong === "PONG") {
      redisLatencyMs = Date.now() - start;
      redisStatus = "connected";
    }
  } catch {
    redisStatus = "disconnected";
  }

  // 3. Document Worker Health
  let workerStatus = "idle";
  if (documentWorker) {
    try {
      const isRunning =
        typeof documentWorker.isRunning === "function" ? documentWorker.isRunning() : true;
      workerStatus = isRunning ? "running" : "stopped";
    } catch {
      workerStatus = "stopped";
    }
  }

  // Determine overall status
  let overall = "healthy";
  if (mongoStatus !== "connected" && redisStatus !== "connected") {
    overall = "unhealthy";
  } else if (mongoStatus !== "connected" || redisStatus !== "connected") {
    overall = "degraded";
  }

  return {
    status: overall,
    timestamp,
    services: {
      mongodb: {
        status: mongoStatus,
        latencyMs: mongoLatencyMs,
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs,
      },
      documentWorker: {
        status: workerStatus,
      },
    },
    system: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    },
  };
};

module.exports = {
  getDashboardOverview,
  getUsers,
  getUserById,
  getProjects,
  getActivities,
  getAIUsageSummary,
  getProcessingMonitoring,
  getSystemHealth,
};
