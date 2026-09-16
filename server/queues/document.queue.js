const { Queue } = require("bullmq");
const redisConfig = require("../config/redis");

const QUEUE_NAME = "document-processing";

let documentQueue = null;

try {
  documentQueue = new Queue(QUEUE_NAME, {
    connection: redisConfig.connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  // Deduplicate noisy connection errors — only log each unique message once
  const _seenQueueErrors = new Set();
  documentQueue.on("error", (err) => {
    const key = err.message;
    if (!_seenQueueErrors.has(key)) {
      _seenQueueErrors.add(key);
      console.warn(`[BullMQ:${QUEUE_NAME}] Queue warning: ${err.message}`);
    }
  });
} catch (err) {
  console.warn(`[BullMQ:${QUEUE_NAME}] Failed to initialize queue: ${err.message}`);
}

/**
 * Add a document processing job to the queue.
 * Strictly passes only identifiers ({ materialId, projectId }).
 *
 * @param {Object} data
 * @param {string} data.materialId
 * @param {string} data.projectId
 * @returns {Promise<Object>}
 */
const addDocumentJob = async ({ materialId, projectId }) => {
  if (!materialId || !projectId) {
    throw new Error("materialId and projectId are required to enqueue document job");
  }

  if (!documentQueue) {
    throw new Error("Document processing queue is not initialized");
  }

  const job = await documentQueue.add(
    "process-document",
    {
      materialId: materialId.toString(),
      projectId: projectId.toString(),
    },
    {
      jobId: `doc-${materialId}`,
    }
  );

  return job;
};

module.exports = {
  QUEUE_NAME,
  documentQueue,
  addDocumentJob,
};
