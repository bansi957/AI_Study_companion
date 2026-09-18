const { Worker, DelayedError } = require("bullmq");
const redisConfig = require("../config/redis");
const Material = require("../models/Material");
const Project = require("../models/Project");
const embeddingService = require("../services/retrieval/embedding.service");
const activityService = require("../services/analytics/activity.service");
const { EMBEDDING_QUEUE_NAME } = require("../queues/document.queue");
const { emitMaterialUpdate } = require("../config/socket");

const sanitizeErrorMessage = (error) => {
  if (!error) return "Unknown embedding error occurred";
  const message = typeof error === "string" ? error : error.message || "Unknown error";
  const cleaned = message
    .replace(/[A-Za-z]:\\[^:\s\n\r"']+/g, "[file]")
    .replace(/(?:^|[\s"'])\/(?:Users|home|var|tmp|etc|app|node_modules|uploads)[^\s"']*/gi, " [file]")
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[db-uri]");
  return cleaned.length > 300 ? `${cleaned.slice(0, 297)}...` : cleaned;
};

/**
 * Extract retry/reset delay from error if provided by Google Gemini API,
 * otherwise default to a safe delay such as 10–15 minutes (default: 10 minutes = 600,000ms).
 *
 * @param {Error|Object} error
 * @returns {number} delay in milliseconds
 */
const extractQuotaRetryDelayMs = (error) => {
  const DEFAULT_DELAY_MS = 10 * 60 * 1000; // 10 minutes safe delay

  if (!error) return DEFAULT_DELAY_MS;

  // 1. Check HTTP response retry-after header (in seconds)
  const retryAfterHeader =
    error.response?.headers?.get?.("retry-after") ||
    error.response?.headers?.["retry-after"] ||
    error.headers?.["retry-after"];

  if (retryAfterHeader) {
    const seconds = parseFloat(retryAfterHeader);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.max(60000, Math.ceil(seconds * 1000) + 5000);
    }
  }

  // 2. Parse compound pattern like "12m31.24s" or "17m40.99s" from error message/details
  const rawText = `${error.message || ""} ${error.originalError || ""} ${JSON.stringify(error.errorDetails || "")}`;
  const compoundMatch = rawText.match(/(?:try again in|retry in|wait)\s+(\d+)m([\d\.]+)s/i);
  if (compoundMatch) {
    const mins = parseInt(compoundMatch[1], 10) || 0;
    const secs = parseFloat(compoundMatch[2]) || 0;
    const totalMs = (mins * 60 + secs) * 1000;
    if (totalMs > 0) {
      return Math.max(60000, Math.ceil(totalMs) + 5000);
    }
  }

  // 3. Parse simple pattern like "Please try again in 15m" or "try again in 60s"
  const simpleMatch = rawText.match(/(?:try again in|retry after|retry in)\s+([0-9\.]+)\s*(s|m|h|min|sec|minutes?|seconds?)/i);
  if (simpleMatch) {
    const val = parseFloat(simpleMatch[1]);
    const unit = simpleMatch[2].toLowerCase();
    if (!isNaN(val) && val > 0) {
      let ms = val * 1000;
      if (unit.startsWith("m")) ms = val * 60 * 1000;
      if (unit.startsWith("h")) ms = val * 3600 * 1000;
      return Math.max(60000, Math.ceil(ms) + 5000);
    }
  }

  return DEFAULT_DELAY_MS;
};

/**
 * Process embedding generation for a material's semantic chunks.
 * On completion, marks the document as retrieval-ready (status: READY).
 *
 * @param {Object} job - BullMQ Job instance
 * @param {string} [token] - BullMQ lock token
 * @returns {Promise<Object>}
 */
const processEmbedding = async (job, token) => {
  const { materialId, projectId, userId } = job.data || {};

  if (!materialId || !projectId) {
    throw new Error("Job missing required materialId or projectId");
  }

  // 1. Enforce Project & User Isolation
  const query = { _id: materialId, projectId };
  if (userId) query.userId = userId;

  const material = await Material.findOne(query);
  if (!material) {
    const materialAnywhere = await Material.findById(materialId);
    if (!materialAnywhere) {
      console.warn(`[Worker:${EMBEDDING_QUEUE_NAME}] Material ${materialId} was deleted. Skipping job.`);
      return { skipped: true, reason: "Material was deleted" };
    }
    throw new Error(`Isolation check failed: Material ${materialId} not found in project ${projectId}`);
  }

  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const context = {
    materialId: material._id.toString(),
    projectId: project._id.toString(),
    userId: material.userId.toString(),
  };

  emitMaterialUpdate({
    projectId: project._id,
    materialId: material._id,
    status: "PROCESSING",
    stage: "Generating semantic chunks & vector embeddings",
    originalName: material.originalName,
    pageCount: material.pageCount || 0,
  });

  try {
    // 2. Generate embeddings in bounded batches (does not invoke LLM)
    const embeddingResult = await embeddingService.generateForMaterial(
      material._id,
      context
    );

    // 3. Mark material as RETRIEVAL-READY immediately
    material.status = "READY";
    material.processedAt = new Date();
    material.processingError = null;
    material.metadata = {
      ...(material.metadata || {}),
      retrievalReady: true,
      retrievalStatus: "READY",
      embeddedChunksCount: embeddingResult.embeddedCount || embeddingResult.alreadyEmbedded || 0,
      embeddingDimension: embeddingResult.dimension,
      embeddingModel: embeddingResult.model || "gemini-embedding-001",
      stage: "retrieval_ready",
    };
    await material.save();

    // 4. Emit real-time READY status to clients
    emitMaterialUpdate({
      projectId: project._id,
      materialId: material._id,
      status: "READY",
      stage: "Ready for study & quizzes",
      originalName: material.originalName,
      pageCount: material.pageCount,
    });

    // 5. Record activity
    await activityService.recordActivity({
      userId: material.userId,
      projectId: material.projectId,
      type: "MATERIAL_PROCESSED",
      metadata: {
        materialId: material._id,
        filename: material.originalName,
        chunksCount: material.metadata?.chunksCount || 0,
        embeddedChunksCount: material.metadata?.embeddedChunksCount || 0,
      },
    }).catch(() => {});

    return {
      success: true,
      materialId: material._id,
      embeddedCount: embeddingResult.embeddedCount,
      dimension: embeddingResult.dimension,
    };
  } catch (error) {
    const isQuota = Boolean(error?.isQuotaExceeded === true || error?.code === "QUOTA_EXHAUSTED" || error?.status === 429);
    const safeError = sanitizeErrorMessage(error);

    // 1. Handle Gemini HTTP 429 Quota Exceeded with delayed requeue
    // Does NOT consume BullMQ retry attempts (preserves job)
    if (isQuota) {
      const delayMs = extractQuotaRetryDelayMs(error);
      const delayMinutes = Math.round(delayMs / 60000);

      console.warn(
        `[Worker:${EMBEDDING_QUEUE_NAME}] Gemini quota exhausted; delaying job (${delayMinutes}m / ${Math.round(delayMs / 1000)}s)`
      );

      // Keep material in PROCESSING status so UI shows it waiting for quota reset
      const existing = await Material.findById(material._id);
      if (existing && existing.status !== "READY") {
        existing.status = "PROCESSING";
        existing.processingError = null;
        existing.metadata = {
          ...(existing.metadata || {}),
          retrievalStatus: "WAITING_FOR_QUOTA",
          retrievalError: safeError,
          quotaResumeAt: new Date(Date.now() + delayMs),
        };
        await existing.save();

        emitMaterialUpdate({
          projectId: project._id,
          materialId: material._id,
          status: "PROCESSING",
          stage: `Embedding paused: API quota exhausted. Resuming in ~${delayMinutes} min...`,
          originalName: material.originalName,
        });
      }

      // Delay the job in BullMQ without consuming retry attempts
      const lockToken = token || job.token;
      if (typeof job.moveToDelayed === "function") {
        await job.moveToDelayed(Date.now() + delayMs, lockToken);
        throw new DelayedError();
      }
    }

    // 2. For ordinary transient errors, preserve standard BullMQ retry behavior
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || 3;
    const isFinalAttempt = attemptsMade + 1 >= maxAttempts;

    if (isFinalAttempt) {
      const existing = await Material.findById(material._id);
      if (existing) {
        existing.status = "FAILED";
        existing.processingError = safeError;
        existing.metadata = {
          ...(existing.metadata || {}),
          retrievalStatus: "FAILED",
          retrievalError: safeError,
        };
        await existing.save();

        emitMaterialUpdate({
          projectId: project._id,
          materialId: material._id,
          status: "FAILED",
          error: safeError,
          stage: "Embedding generation failed",
          originalName: material.originalName,
        });
      }
    } else {
      console.warn(
        `[Worker:${EMBEDDING_QUEUE_NAME}] Job ${job?.id} attempt ${attemptsMade + 1}/${maxAttempts} failed: ${safeError}. BullMQ will retry.`
      );
    }
    throw error;
  }
};

let embeddingWorker = null;

const startEmbeddingWorker = () => {
  if (embeddingWorker) return embeddingWorker;

  try {
    embeddingWorker = new Worker(EMBEDDING_QUEUE_NAME, processEmbedding, {
      connection: redisConfig.connection,
      concurrency: 1,
    });

    embeddingWorker.on("completed", (job) => {
      console.log(`[Worker:${EMBEDDING_QUEUE_NAME}] Job ${job.id} completed successfully`);
      if (global.gc) {
        try { global.gc(); } catch (e) {}
      }
    });

    embeddingWorker.on("failed", (job, err) => {
      if (err?.name === "DelayedError" || err?.message === "bullmq:movedToDelayed") {
        return; // Handled quota delay, not a permanent job failure
      }
      console.error(
        `[Worker:${EMBEDDING_QUEUE_NAME}] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${sanitizeErrorMessage(err)}`
      );
    });

    embeddingWorker.on("error", (err) => {
      console.warn(`[Worker:${EMBEDDING_QUEUE_NAME}] Worker connection error: ${err.message}`);
    });

    // Check Gemini API embedding configuration
    embeddingService.warmup().catch(() => {});

    return embeddingWorker;
  } catch (err) {
    console.warn(`[Worker:${EMBEDDING_QUEUE_NAME}] Failed to start worker: ${err.message}`);
    return null;
  }
};

const closeEmbeddingWorker = async () => {
  if (embeddingWorker) {
    await embeddingWorker.close();
    embeddingWorker = null;
  }
};

module.exports = {
  processEmbedding,
  startEmbeddingWorker,
  closeEmbeddingWorker,
  get embeddingWorker() {
    return embeddingWorker;
  },
};
