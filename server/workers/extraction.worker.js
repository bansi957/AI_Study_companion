const { Worker } = require("bullmq");
const redisConfig = require("../config/redis");
const Material = require("../models/Material");
const Project = require("../models/Project");
const Chunk = require("../models/Chunk");
const ExtractedContent = require("../models/ExtractedContent");
const extractionService = require("../services/documents/extraction.service");
const chunkingService = require("../services/documents/chunking.service");
const { addEmbeddingJob, addKnowledgeJob, EXTRACTION_QUEUE_NAME } = require("../queues/document.queue");
const { emitMaterialUpdate } = require("../config/socket");

const sanitizeErrorMessage = (error) => {
  if (!error) return "Unknown extraction error occurred";
  const message = typeof error === "string" ? error : error.message || "Unknown error";
  const cleaned = message
    .replace(/[A-Za-z]:\\[^:\s\n\r"']+/g, "[file]")
    .replace(/(?:^|[\s"'])\/(?:Users|home|var|tmp|etc|app|node_modules|uploads)[^\s"']*/gi, " [file]")
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[db-uri]");
  return cleaned.length > 300 ? `${cleaned.slice(0, 297)}...` : cleaned;
};

/**
 * Process document extraction and semantic chunking.
 * Enqueues embedding and knowledge jobs downstream without waiting for them.
 *
 * @param {Object} job - BullMQ Job instance
 * @returns {Promise<Object>}
 */
const processExtraction = async (job) => {
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
      console.warn(`[Worker:${EXTRACTION_QUEUE_NAME}] Material ${materialId} was deleted. Skipping job.`);
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

  // 2. Idempotent cleanup on initial attempt
  if (job.attemptsMade === 0) {
    await ExtractedContent.deleteMany({ materialId });
    await Chunk.deleteMany({ materialId });
  }

  // 3. Mark as PROCESSING
  material.status = "PROCESSING";
  material.processingError = null;
  material.metadata = {
    ...(material.metadata || {}),
    stage: "extraction",
    retrievalStatus: "PROCESSING",
  };
  await material.save();

  emitMaterialUpdate({
    projectId: project._id,
    materialId: material._id,
    status: "PROCESSING",
    stage: "Extracting content & structure",
    originalName: material.originalName,
  });

  try {
    // 4. Extract content and structure from PDF (Cloudinary or local)
    const extractedContent = await extractionService.extract(material, context);

    // Fan out: immediately enqueue independent Concept path in parallel (never blocks retrieval path)
    try {
      await addKnowledgeJob(context);
    } catch (knowledgeErr) {
      console.warn(`[Worker:${EXTRACTION_QUEUE_NAME}] Non-blocking knowledge job enqueue warning: ${knowledgeErr.message}`);
    }

    emitMaterialUpdate({
      projectId: project._id,
      materialId: material._id,
      status: "PROCESSING",
      stage: "Creating semantic chunks",
      originalName: material.originalName,
      pageCount: extractedContent?.totalPages || 0,
    });

    // 5. Generate boundary-aware semantic chunks preserving exact page provenance
    const chunkingResult = await chunkingService.chunk(material, context);

    // 6. Update Material with extraction stats
    material.pageCount = extractedContent.totalPages || 0;
    material.extractedTextLength = extractedContent.totalCharacters || 0;
    material.structureStats = extractedContent.stats || {};
    material.metadata = {
      ...(material.metadata || {}),
      ...(extractedContent.metadata || {}),
      chunksCount: chunkingResult?.chunksCount || 0,
      chunking: chunkingResult?.metadata || {},
      stage: "chunking_complete",
    };
    await material.save();

    // 7. Enqueue embedding generation (Concept generation is NOT part of PDF processing)
    await addEmbeddingJob(context);

    emitMaterialUpdate({
      projectId: project._id,
      materialId: material._id,
      status: "PROCESSING",
      stage: "Generating semantic chunks & vector embeddings",
      originalName: material.originalName,
      pageCount: material.pageCount,
    });

    return {
      success: true,
      materialId: material._id,
      pageCount: material.pageCount,
      chunksCount: chunkingResult?.chunksCount || 0,
      totalSegments: extractedContent.totalSegments,
    };
  } catch (error) {
    const safeError = sanitizeErrorMessage(error);
    const existing = await Material.findById(material._id);
    if (existing) {
      existing.status = "FAILED";
      existing.processingError = safeError;
      existing.metadata = {
        ...(existing.metadata || {}),
        stage: "extraction_failed",
        retrievalStatus: "FAILED",
        knowledgeStatus: "FAILED",
      };
      await existing.save();

      emitMaterialUpdate({
        projectId: project._id,
        materialId: material._id,
        status: "FAILED",
        error: safeError,
        stage: "Extraction failed",
        originalName: material.originalName,
      });
    }
    throw error;
  }
};

let extractionWorker = null;

const startExtractionWorker = () => {
  if (extractionWorker) return extractionWorker;

  try {
    extractionWorker = new Worker(EXTRACTION_QUEUE_NAME, processExtraction, {
      connection: redisConfig.connection,
      concurrency: 2,
    });

    extractionWorker.on("completed", (job) => {
      console.log(`[Worker:${EXTRACTION_QUEUE_NAME}] Job ${job.id} completed successfully`);
    });

    extractionWorker.on("failed", (job, err) => {
      console.error(
        `[Worker:${EXTRACTION_QUEUE_NAME}] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${sanitizeErrorMessage(err)}`
      );
    });

    extractionWorker.on("error", (err) => {
      console.warn(`[Worker:${EXTRACTION_QUEUE_NAME}] Worker connection error: ${err.message}`);
    });

    return extractionWorker;
  } catch (err) {
    console.warn(`[Worker:${EXTRACTION_QUEUE_NAME}] Failed to start worker: ${err.message}`);
    return null;
  }
};

const closeExtractionWorker = async () => {
  if (extractionWorker) {
    await extractionWorker.close();
    extractionWorker = null;
  }
};

module.exports = {
  processExtraction,
  startExtractionWorker,
  closeExtractionWorker,
  get extractionWorker() {
    return extractionWorker;
  },
};
