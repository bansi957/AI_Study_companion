const Chunk = require("../../models/Chunk");
const Material = require("../../models/Material");
const AIUsage = require("../../models/AIUsage");
const localEmbedding = require("./localEmbedding");

/**
 * Dedicated Embedding Service
 *
 * Generates vector representations for document chunks and queries using a local
 * Hugging Face Transformers.js ONNX pipeline (all-MiniLM-L6-v2-ONNX, 384 dimensions).
 * Runs completely locally inside Node.js with zero external API dependencies.
 */
class EmbeddingService {
  constructor() {
    this.defaultModel = "onnx-community/all-MiniLM-L6-v2-ONNX";
    this.defaultProvider = "local";
    this.defaultBatchSize = 32;
    this.defaultDimension = 384;
  }

  getProvider() {
    return (process.env.EMBEDDING_PROVIDER || this.defaultProvider).toLowerCase();
  }

  getModel() {
    return process.env.EMBEDDING_MODEL || this.defaultModel;
  }

  getBatchSize() {
    return parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || this.defaultBatchSize;
  }

  getDimension() {
    if (process.env.EMBEDDING_DIMENSION) {
      return parseInt(process.env.EMBEDDING_DIMENSION, 10);
    }
    return this.defaultDimension;
  }

  /**
   * Warm up local embedding model asynchronously (non-blocking for startup).
   */
  async warmup() {
    return localEmbedding.warmup();
  }

  /**
   * Embed a batch of texts using the local Hugging Face model.
   *
   * @param {string[]} texts - Array of string chunks or query text
   * @param {Object} options - { model, provider, forceFailure, userId, projectId }
   * @returns {Promise<Object>} { vectors, model, inputTokens, latency, dimension }
   */
  async embedBatch(texts, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.getModel();
    const provider = options.provider || this.getProvider();

    if (options.forceFailure) {
      throw new Error("Simulated embedding provider failure");
    }

    const textList = Array.isArray(texts) ? texts : [texts];

    // Token estimation: ~4 characters per token + 5 overhead
    const estimatedTokens = textList.reduce(
      (sum, t) => sum + Math.max(Math.ceil((t || "").length / 4), 1) + 5,
      0
    );

    try {
      let vectors = [];

      // Local Hugging Face Transformers.js embedding (default)
      if (provider === "local" || !options.useExternalOnly) {
        vectors = await localEmbedding.embed(textList);
      } else {
        // Fallback for custom external providers if explicitly requested
        vectors = await localEmbedding.embed(textList);
      }

      const latency = Date.now() - startTime;
      const dimension = vectors[0]?.length || this.getDimension();

      return {
        vectors,
        model,
        inputTokens: estimatedTokens,
        latency,
        dimension,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      error.latency = latency;
      error.estimatedTokens = estimatedTokens;
      error.model = model;
      throw error;
    }
  }

  /**
   * Generate and persist embeddings for chunks of a material.
   * Automatically re-embeds legacy chunks whose dimension does not match 384 or whose model differs.
   *
   * @param {string|ObjectId} materialId
   * @param {Object} context - { userId, projectId, materialId }
   * @param {Object} options - { forceRegenerate, batchSize }
   * @returns {Promise<Object>}
   */
  async generateForMaterial(materialId, context = {}, options = {}) {
    const matId = materialId || context.materialId;
    const { userId, projectId } = context;

    if (!matId) {
      throw new Error("Missing materialId for embedding generation");
    }

    const targetDim = this.getDimension();
    const targetModel = this.getModel();

    // 1. Fetch all chunks for this material in index order
    const query = { materialId: matId };
    if (projectId) query.projectId = projectId;
    if (userId) query.userId = userId;

    const allChunks = await Chunk.find(query).sort({ chunkIndex: 1 });

    if (!allChunks || allChunks.length === 0) {
      return {
        status: "COMPLETED",
        totalChunks: 0,
        embeddedCount: 0,
        alreadyEmbedded: 0,
        dimension: targetDim,
        batchesCount: 0,
        note: "No chunks exist for this material",
      };
    }

    // 2. Filter chunks that need embedding:
    // If forceRegenerate is set, re-embed everything.
    // Otherwise, embed chunks that are missing embeddings, have an empty array,
    // or have an incompatible vector dimension (e.g. legacy Voyage 1024-dim vectors).
    const chunksToEmbed = options.forceRegenerate
      ? allChunks
      : allChunks.filter((c) => {
          if (!Array.isArray(c.embedding) || c.embedding.length !== targetDim) return true;
          if (c.metadata?.embeddingModel !== targetModel) return true;
          return false;
        });

    if (chunksToEmbed.length === 0) {
      return {
        status: "COMPLETED",
        totalChunks: allChunks.length,
        embeddedCount: 0,
        alreadyEmbedded: allChunks.length,
        dimension: targetDim,
        batchesCount: 0,
        note: "All chunks are already embedded with the 384-dimensional local model",
      };
    }

    const batchSize = options.batchSize || this.getBatchSize();
    let totalEmbedded = 0;
    let batchesCount = 0;

    // 3. Process chunks in bounded batches
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      batchesCount++;
      const chunkBatch = chunksToEmbed.slice(i, i + batchSize);
      const batchTexts = chunkBatch.map((c) => c.text);

      let embedResult;
      try {
        embedResult = await this.embedBatch(batchTexts, {
          ...options,
          userId,
          projectId,
        });
      } catch (err) {
        if (userId && projectId) {
          await this.recordUsage({
            userId,
            projectId,
            model: targetModel,
            latency: err.latency || 0,
            inputTokens: err.estimatedTokens || 0,
            success: false,
            errorMessage: err.message,
          });
        }
        throw err;
      }

      // Record successful AIUsage
      if (userId && projectId) {
        await this.recordUsage({
          userId,
          projectId,
          model: embedResult.model,
          latency: embedResult.latency,
          inputTokens: embedResult.inputTokens,
          success: true,
          errorMessage: null,
        });
      }

      // 4. Persist 384-dimensional embeddings back to MongoDB Chunk documents
      const bulkOps = chunkBatch.map((chunk, idx) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: {
            $set: {
              embedding: embedResult.vectors[idx],
              "metadata.embeddingModel": embedResult.model,
              "metadata.embeddingDimension": embedResult.dimension,
              "metadata.embeddedAt": new Date(),
            },
          },
        },
      }));

      await Chunk.bulkWrite(bulkOps);
      totalEmbedded += chunkBatch.length;
    }

    return {
      status: "COMPLETED",
      totalChunks: allChunks.length,
      embeddedCount: totalEmbedded,
      dimension: targetDim,
      batchesCount,
      model: targetModel,
    };
  }

  /**
   * Re-embed all chunks of a specific material with the local 384-dimensional model.
   *
   * @param {string|ObjectId} materialId
   * @param {Object} context - { userId, projectId }
   * @returns {Promise<Object>}
   */
  async reembedMaterial(materialId, context = {}) {
    return this.generateForMaterial(materialId, context, { forceRegenerate: true });
  }

  /**
   * Re-embed all materials in a project with the local 384-dimensional model.
   *
   * @param {string|ObjectId} projectId
   * @param {Object} context - { userId }
   * @returns {Promise<Object[]>}
   */
  async reembedProject(projectId, context = {}) {
    const materials = await Material.find({ projectId }).lean();
    const results = [];
    for (const mat of materials) {
      const res = await this.generateForMaterial(mat._id, {
        projectId,
        userId: context.userId || mat.userId,
        materialId: mat._id,
      }, { forceRegenerate: true });
      results.push({ materialId: mat._id, result: res });
    }
    return results;
  }

  /**
   * Persist AIUsage record with feature='EMBEDDING'
   */
  async recordUsage({ userId, projectId, model, latency, inputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "EMBEDDING",
        model,
        latency,
        inputTokens,
        outputTokens: 0,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[EmbeddingService] Failed to record AIUsage: ${err.message}`);
    }
  }
}

module.exports = new EmbeddingService();
