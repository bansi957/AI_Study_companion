const { Worker } = require("bullmq");
const redisConfig = require("../config/redis");
const Material = require("../models/Material");
const Project = require("../models/Project");
const knowledgeService = require("../services/documents/knowledge.service");
const { KNOWLEDGE_QUEUE_NAME } = require("../queues/document.queue");
const { emitMaterialUpdate } = require("../config/socket");

const sanitizeErrorMessage = (error) => {
  if (!error) return "Unknown knowledge extraction error occurred";
  const message = typeof error === "string" ? error : error.message || "Unknown error";
  const cleaned = message
    .replace(/[A-Za-z]:\\[^:\s\n\r"']+/g, "[file]")
    .replace(/(?:^|[\s"'])\/(?:Users|home|var|tmp|etc|app|node_modules|uploads)[^\s"']*/gi, " [file]")
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[db-uri]");
  return cleaned.length > 300 ? `${cleaned.slice(0, 297)}...` : cleaned;
};

/**
 * Process knowledge extraction (concepts and relationships) from structured text.
 * Runs asynchronously without blocking retrieval readiness of the document.
 *
 * @param {Object} job - BullMQ Job instance
 * @returns {Promise<Object>}
 */
const processKnowledge = async (job) => {
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
      console.warn(`[Worker:${KNOWLEDGE_QUEUE_NAME}] Material ${materialId} was deleted. Skipping job.`);
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

  // 2. Mark knowledge extraction state in metadata
  material.metadata = {
    ...(material.metadata || {}),
    knowledgeStatus: "PROCESSING",
  };
  await material.save();

  try {
    // 3. Extract concepts from structured segments (reads ExtractedContent, never raw PDF)
    const knowledgeResult = await knowledgeService.extract(null, context);

    // 4. Update Material knowledge metadata without touching overall status
    const freshMaterial = await Material.findById(materialId);
    if (freshMaterial) {
      freshMaterial.metadata = {
        ...(freshMaterial.metadata || {}),
        knowledgeStatus: "READY",
        conceptsReady: true,
        conceptsCount: knowledgeResult?.conceptsCount || 0,
        knowledgeStages: knowledgeResult?.metadata || {},
      };
      await freshMaterial.save();

      emitMaterialUpdate({
        projectId: project._id,
        materialId: freshMaterial._id,
        status: freshMaterial.status,
        stage: `Concepts extracted (${knowledgeResult?.conceptsCount || 0} concepts)`,
        originalName: freshMaterial.originalName,
        pageCount: freshMaterial.pageCount,
      });
    }

    return {
      success: true,
      materialId: material._id,
      conceptsCount: knowledgeResult?.conceptsCount || 0,
    };
  } catch (error) {
    const safeError = sanitizeErrorMessage(error);
    console.warn(`[Worker:${KNOWLEDGE_QUEUE_NAME}] Knowledge extraction failed for ${materialId}: ${safeError}`);

    const existing = await Material.findById(materialId);
    if (existing) {
      existing.metadata = {
        ...(existing.metadata || {}),
        knowledgeStatus: "FAILED",
        knowledgeError: safeError,
      };
      // Important: Do NOT alter existing.status (if READY for retrieval, remains READY!)
      await existing.save();
    }
    throw error;
  }
};

let knowledgeWorker = null;

const startKnowledgeWorker = () => {
  if (knowledgeWorker) return knowledgeWorker;

  try {
    knowledgeWorker = new Worker(KNOWLEDGE_QUEUE_NAME, processKnowledge, {
      connection: redisConfig.connection,
      concurrency: 1, // Strict concurrency 1 to respect Groq TPM rate limits
    });

    knowledgeWorker.on("completed", (job) => {
      console.log(`[Worker:${KNOWLEDGE_QUEUE_NAME}] Job ${job.id} completed successfully`);
    });

    knowledgeWorker.on("failed", (job, err) => {
      console.error(
        `[Worker:${KNOWLEDGE_QUEUE_NAME}] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${sanitizeErrorMessage(err)}`
      );
    });

    knowledgeWorker.on("error", (err) => {
      console.warn(`[Worker:${KNOWLEDGE_QUEUE_NAME}] Worker connection error: ${err.message}`);
    });

    return knowledgeWorker;
  } catch (err) {
    console.warn(`[Worker:${KNOWLEDGE_QUEUE_NAME}] Failed to start worker: ${err.message}`);
    return null;
  }
};

const closeKnowledgeWorker = async () => {
  if (knowledgeWorker) {
    await knowledgeWorker.close();
    knowledgeWorker = null;
  }
};

module.exports = {
  processKnowledge,
  startKnowledgeWorker,
  closeKnowledgeWorker,
  get knowledgeWorker() {
    return knowledgeWorker;
  },
};
