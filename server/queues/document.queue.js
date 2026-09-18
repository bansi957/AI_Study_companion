const { Queue } = require("bullmq");
const redisConfig = require("../config/redis");

const EXTRACTION_QUEUE_NAME = "document-extraction";
const EMBEDDING_QUEUE_NAME = "embedding";
const KNOWLEDGE_QUEUE_NAME = "knowledge-extraction";

// Backwards compatibility alias
const QUEUE_NAME = EXTRACTION_QUEUE_NAME;

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

const _seenQueueErrors = new Set();
const attachErrorLogger = (queue, name) => {
  queue.on("error", (err) => {
    const key = `${name}:${err.message}`;
    if (!_seenQueueErrors.has(key)) {
      _seenQueueErrors.add(key);
      console.warn(`[BullMQ:${name}] Queue warning: ${err.message}`);
    }
  });
};

let extractionQueue = null;
let embeddingQueue = null;
let knowledgeQueue = null;

try {
  extractionQueue = new Queue(EXTRACTION_QUEUE_NAME, {
    connection: redisConfig.connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  attachErrorLogger(extractionQueue, EXTRACTION_QUEUE_NAME);

  embeddingQueue = new Queue(EMBEDDING_QUEUE_NAME, {
    connection: redisConfig.connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  attachErrorLogger(embeddingQueue, EMBEDDING_QUEUE_NAME);

  knowledgeQueue = new Queue(KNOWLEDGE_QUEUE_NAME, {
    connection: redisConfig.connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  attachErrorLogger(knowledgeQueue, KNOWLEDGE_QUEUE_NAME);
} catch (err) {
  console.warn(`[BullMQ] Failed to initialize queues: ${err.message}`);
}

/**
 * Enqueue a document extraction job (OCR, structured content, semantic chunking)
 *
 * @param {Object} data - { materialId, projectId, userId }
 * @returns {Promise<Object>}
 */
const addExtractionJob = async ({ materialId, projectId, userId }) => {
  if (!materialId || !projectId) {
    throw new Error("materialId and projectId are required to enqueue extraction job");
  }

  if (!extractionQueue) {
    throw new Error("Extraction queue is not initialized");
  }

  return await extractionQueue.add(
    "extract-document",
    {
      materialId: materialId.toString(),
      projectId: projectId.toString(),
      userId: userId ? userId.toString() : null,
    },
    {
      jobId: `extract-${materialId}`,
    }
  );
};

/**
 * Enqueue an embedding job for a material's semantic chunks
 *
 * @param {Object} data - { materialId, projectId, userId }
 * @returns {Promise<Object>}
 */
const addEmbeddingJob = async ({ materialId, projectId, userId }) => {
  if (!materialId || !projectId) {
    throw new Error("materialId and projectId are required to enqueue embedding job");
  }

  if (!embeddingQueue) {
    throw new Error("Embedding queue is not initialized");
  }

  return await embeddingQueue.add(
    "embed-material-chunks",
    {
      materialId: materialId.toString(),
      projectId: projectId.toString(),
      userId: userId ? userId.toString() : null,
    },
    {
      jobId: `embed-${materialId}`,
    }
  );
};

/**
 * Enqueue a knowledge extraction job (concepts & relationships via Groq LLM)
 *
 * @param {Object} data - { materialId, projectId, userId }
 * @returns {Promise<Object>}
 */
const addKnowledgeJob = async ({ materialId, projectId, userId }) => {
  if (!materialId || !projectId) {
    throw new Error("materialId and projectId are required to enqueue knowledge job");
  }

  if (!knowledgeQueue) {
    throw new Error("Knowledge extraction queue is not initialized");
  }

  return await knowledgeQueue.add(
    "extract-material-knowledge",
    {
      materialId: materialId.toString(),
      projectId: projectId.toString(),
      userId: userId ? userId.toString() : null,
    },
    {
      jobId: `knowledge-${materialId}`,
    }
  );
};

// Backwards compatibility alias: addDocumentJob enqueues to extraction
const addDocumentJob = addExtractionJob;
const documentQueue = extractionQueue;

module.exports = {
  EXTRACTION_QUEUE_NAME,
  EMBEDDING_QUEUE_NAME,
  KNOWLEDGE_QUEUE_NAME,
  QUEUE_NAME,
  extractionQueue,
  embeddingQueue,
  knowledgeQueue,
  documentQueue,
  addExtractionJob,
  addEmbeddingJob,
  addKnowledgeJob,
  addDocumentJob,
};
