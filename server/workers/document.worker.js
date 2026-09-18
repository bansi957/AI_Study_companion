const {
  processExtraction,
  startExtractionWorker,
  closeExtractionWorker,
  extractionWorker,
} = require("./extraction.worker");
const {
  processEmbedding,
  startEmbeddingWorker,
  closeEmbeddingWorker,
  embeddingWorker,
} = require("./embedding.worker");
const {
  processKnowledge,
  startKnowledgeWorker,
  closeKnowledgeWorker,
  knowledgeWorker,
} = require("./knowledge.worker");
const {
  EXTRACTION_QUEUE_NAME,
  EMBEDDING_QUEUE_NAME,
  KNOWLEDGE_QUEUE_NAME,
  QUEUE_NAME,
} = require("../queues/document.queue");

/**
 * Start all decoupled document processing workers.
 *
 * @returns {Object} Active workers mapping
 */
const startDocumentWorker = () => {
  const ext = startExtractionWorker();
  const emb = startEmbeddingWorker();
  const knw = startKnowledgeWorker();

  console.log(`[Workers] All decoupled document workers active:`);
  console.log(` - Extraction Queue: ${EXTRACTION_QUEUE_NAME} (concurrency: 2)`);
  console.log(` - Embedding Queue: ${EMBEDDING_QUEUE_NAME} (concurrency: 2)`);
  console.log(` - Knowledge Queue: ${KNOWLEDGE_QUEUE_NAME} (concurrency: 1)`);

  return {
    extractionWorker: ext,
    embeddingWorker: emb,
    knowledgeWorker: knw,
  };
};

/**
 * Gracefully close all decoupled document processing workers.
 */
const closeDocumentWorker = async () => {
  await Promise.allSettled([
    closeExtractionWorker(),
    closeEmbeddingWorker(),
    closeKnowledgeWorker(),
  ]);
};

/**
 * Legacy wrapper executing extraction for backwards compatibility
 */
const processDocument = async (job) => {
  return await processExtraction(job);
};

module.exports = {
  QUEUE_NAME,
  EXTRACTION_QUEUE_NAME,
  EMBEDDING_QUEUE_NAME,
  KNOWLEDGE_QUEUE_NAME,
  processDocument,
  processExtraction,
  processEmbedding,
  processKnowledge,
  startDocumentWorker,
  closeDocumentWorker,
  startExtractionWorker,
  closeExtractionWorker,
  startEmbeddingWorker,
  closeEmbeddingWorker,
  startKnowledgeWorker,
  closeKnowledgeWorker,
  get documentWorker() {
    // Provide unified worker interface for admin health monitoring
    return {
      isRunning: () => {
        const extRunning = extractionWorker ? (typeof extractionWorker.isRunning === "function" ? extractionWorker.isRunning() : true) : false;
        const embRunning = embeddingWorker ? (typeof embeddingWorker.isRunning === "function" ? embeddingWorker.isRunning() : true) : false;
        const knwRunning = knowledgeWorker ? (typeof knowledgeWorker.isRunning === "function" ? knowledgeWorker.isRunning() : true) : false;
        return extRunning || embRunning || knwRunning;
      },
    };
  },
  get extractionWorker() {
    return extractionWorker;
  },
  get embeddingWorker() {
    return embeddingWorker;
  },
  get knowledgeWorker() {
    return knowledgeWorker;
  },
};
