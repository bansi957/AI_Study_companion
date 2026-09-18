const { Worker } = require("bullmq");
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
 * Process embedding generation for a material's semantic chunks.
 * On completion, marks the document as retrieval-ready (status: READY).
 *
 * @param {Object} job - BullMQ Job instance
 * @returns {Promise<Object>}
 */
const processEmbedding = async (job) => {
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
      embeddingModel: embeddingResult.model || "onnx-community/all-MiniLM-L6-v2-ONNX",
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
    const safeError = sanitizeErrorMessage(error);
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
    });

    embeddingWorker.on("failed", (job, err) => {
      console.error(
        `[Worker:${EMBEDDING_QUEUE_NAME}] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${sanitizeErrorMessage(err)}`
      );
    });

    embeddingWorker.on("error", (err) => {
      console.warn(`[Worker:${EMBEDDING_QUEUE_NAME}] Worker connection error: ${err.message}`);
    });

    // Warm up local Hugging Face Transformers.js model in background
    embeddingService.warmup().catch((err) => {
      console.warn(`[Worker:${EMBEDDING_QUEUE_NAME}] Local embedding warmup warning: ${err.message}`);
    });

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
