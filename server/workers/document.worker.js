const { Worker } = require("bullmq");
const redisConfig = require("../config/redis");
const Material = require("../models/Material");
const Project = require("../models/Project");
const Chunk = require("../models/Chunk");
const Concept = require("../models/Concept");
const ExtractedContent = require("../models/ExtractedContent");
const extractionService = require("../services/documents/extraction.service");
const knowledgeService = require("../services/documents/knowledge.service");
const retrievalService = require("../services/documents/retrieval.service");

const QUEUE_NAME = "document-processing";

/**
 * Sanitize error message to prevent leaking internal stack traces,
 * file system paths, or database connection strings.
 *
 * @param {Error|any} error
 * @returns {string}
 */
const sanitizeErrorMessage = (error) => {
  if (!error) return "Unknown processing error occurred";
  const message = typeof error === "string" ? error : error.message || "Unknown error";

  // Strip file paths
  const cleaned = message
    .replace(/[A-Za-z]:\\[^:\n\r]+|\/[^:\n\r]+/g, "[file]")
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[db-uri]");

  return cleaned.length > 300 ? `${cleaned.slice(0, 297)}...` : cleaned;
};

/**
 * Orchestrate the document processing pipeline.
 *
 * @param {Object} job - BullMQ Job instance
 * @returns {Promise<Object>}
 */
const processDocument = async (job) => {
  const { materialId, projectId } = job.data || {};

  if (!materialId || !projectId) {
    throw new Error("Job missing required materialId or projectId");
  }

  // 1. Enforce Project Isolation: verify Material belongs strictly to the given Project
  const material = await Material.findOne({ _id: materialId, projectId });
  if (!material) {
    throw new Error(`Isolation check failed: Material ${materialId} not found in project ${projectId}`);
  }

  // Verify Project exists
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // 2. Enforce Idempotency: Clean up any existing derived content, chunks, or concepts before rerun
  await ExtractedContent.deleteMany({ materialId });
  await Chunk.deleteMany({ materialId });
  await Concept.deleteMany({ sourceMaterialIds: [materialId] });
  await Concept.updateMany(
    { sourceMaterialIds: materialId },
    { $pull: { sourceMaterialIds: materialId } }
  );

  // 3. Transition to PROCESSING state
  material.status = "PROCESSING";
  material.processingError = null;
  await material.save();

  try {
    const context = {
      materialId: material._id.toString(),
      projectId: project._id.toString(),
      userId: material.userId.toString(),
    };

    // Stage 1: Content & Structure Extraction (page provenance preserved & persisted)
    const extractedContent = await extractionService.extract(material, context);

    // Stage 2: Knowledge Extraction (concepts, topics, and relationships)
    const knowledge = await knowledgeService.extract(extractedContent, context);

    // Stage 3: Retrieval Representation (contract stub for future chunking & vectors)
    const retrievalData = await retrievalService.prepare(extractedContent, knowledge, context);

    // 4. Update status to READY with document statistics and structure stats
    material.status = "READY";
    material.pageCount = extractedContent.totalPages || 0;
    material.extractedTextLength = extractedContent.totalCharacters || 0;
    material.structureStats = extractedContent.stats || {};
    material.metadata = {
      ...(material.metadata || {}),
      ...(extractedContent.metadata || {}),
      conceptsCount: knowledge?.conceptsCount || 0,
      chunksCount: retrievalData?.chunksCount || 0,
      embeddedChunksCount: retrievalData?.embeddedCount || 0,
      embeddingDimension: retrievalData?.embeddingDimension || null,
    };
    material.processedAt = new Date();
    material.processingError = null;
    await material.save();

    const activityService = require("../services/analytics/activity.service");
    await activityService.recordActivity({
      userId: material.userId,
      projectId: material.projectId,
      type: "MATERIAL_PROCESSED",
      metadata: {
        materialId: material._id,
        filename: material.originalName,
        conceptsCount: knowledge?.conceptsCount || 0,
        chunksCount: retrievalData?.chunksCount || 0,
      },
    });

    return {
      success: true,
      materialId: material._id,
      pageCount: material.pageCount,
      extractedTextLength: material.extractedTextLength,
      totalSegments: extractedContent.totalSegments,
      structureStats: material.structureStats,
      conceptsCount: knowledge?.conceptsCount || 0,
      chunksCount: retrievalData?.chunksCount || 0,
      embeddedChunksCount: retrievalData?.embeddedCount || 0,
    };
  } catch (error) {
    // Stage failure: transition to FAILED and record safe error
    const safeError = sanitizeErrorMessage(error);
    material.status = "FAILED";
    material.processingError = safeError;
    material.processedAt = null;
    await material.save().catch(() => {});

    // Re-throw so BullMQ triggers retry backoff according to configured attempts
    throw new Error(safeError);
  }
};

let documentWorker = null;

/**
 * Initialize and start the BullMQ document processing worker.
 *
 * @returns {Worker|null}
 */
const startDocumentWorker = () => {
  if (documentWorker) {
    return documentWorker;
  }

  try {
    documentWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        return await processDocument(job);
      },
      {
        connection: redisConfig.connection,
        concurrency: 2,
      }
    );

    documentWorker.on("completed", (job) => {
      console.log(`[Worker:${QUEUE_NAME}] Job ${job.id} completed for material ${job.data.materialId}`);
    });

    documentWorker.on("failed", (job, err) => {
      const attempts = job ? `${job.attemptsMade}/${job.opts.attempts}` : "unknown";
      console.warn(
        `[Worker:${QUEUE_NAME}] Job ${job ? job.id : "unknown"} failed (attempt ${attempts}): ${err.message}`
      );
    });

    const _seenWorkerErrors = new Set();
    documentWorker.on("error", (err) => {
      const key = err.message;
      if (!_seenWorkerErrors.has(key)) {
        _seenWorkerErrors.add(key);
        console.warn(`[Worker:${QUEUE_NAME}] Connection/Runtime warning: ${err.message}`);
      }
    });

    return documentWorker;
  } catch (err) {
    console.warn(`[Worker:${QUEUE_NAME}] Worker failed to start: ${err.message}`);
    return null;
  }
};

/**
 * Gracefully close the document worker.
 */
const closeDocumentWorker = async () => {
  if (documentWorker) {
    await documentWorker.close();
    documentWorker = null;
  }
};

module.exports = {
  QUEUE_NAME,
  processDocument,
  startDocumentWorker,
  closeDocumentWorker,
  get documentWorker() {
    return documentWorker;
  },
};
