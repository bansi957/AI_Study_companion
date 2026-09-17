const chunkingService = require("./chunking.service");
const embeddingService = require("../retrieval/embedding.service");

/**
 * Retrieval Service
 *
 * Coordinates retrieval representation for processed materials:
 * 1. Semantic Chunking (Step 13)
 * 2. Dedicated Vector Embeddings (Step 14)
 * Vector index integration will be completed in Step 15.
 */
class RetrievalService {
  /**
   * Prepare retrieval representation from extracted content and knowledge
   *
   * @param {Object} extractedContent - Output from extractionService.extract
   * @param {Object} knowledge - Output from knowledgeService.extract
   * @param {Object} context - Context object { materialId, projectId, userId }
   * @param {Object} options - Chunking and embedding options
   * @returns {Promise<Object>} Structured contract result
   */
  async prepare(extractedContent, knowledge, context = {}, options = {}) {
    // 1. Generate and persist semantic chunks
    const chunkingResult = await chunkingService.chunk(null, context, options);

    // 2. Generate and persist embeddings for the chunks
    const embeddingResult = await embeddingService.generateForMaterial(
      context.materialId,
      context,
      options
    );

    return {
      status: "COMPLETED",
      chunksCount: chunkingResult.chunksCount,
      embeddedCount: embeddingResult.embeddedCount,
      embeddingDimension: embeddingResult.dimension,
      embeddingsGenerated: true,
      indexed: false, // MongoDB Vector Search index configured in Step 15
      metadata: {
        stage: "retrieval_representation",
        ready: true,
        materialId: context.materialId || null,
        projectId: context.projectId || null,
        chunking: chunkingResult.metadata,
        embedding: {
          model: embeddingResult.model,
          dimension: embeddingResult.dimension,
          batchesCount: embeddingResult.batchesCount,
        },
      },
    };
  }
}

module.exports = new RetrievalService();
