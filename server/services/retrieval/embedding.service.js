const { CohereClientV2 } = require("cohere-ai");
const Chunk = require("../../models/Chunk");
const Material = require("../../models/Material");
const AIUsage = require("../../models/AIUsage");

/**
 * Global Embedding Rate Limiter
 * Ensures embedding requests are serialized with clean spacing between batches.
 */
class GlobalEmbeddingRateLimiter {
  constructor(minIntervalMs = 200) {
    this.active = false;
    this.queue = [];
    this.minIntervalMs = minIntervalMs;
    this.lastRequestFinishedAt = 0;
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    const item = this.queue.shift();

    try {
      const now = Date.now();
      const elapsed = now - this.lastRequestFinishedAt;
      if (elapsed < this.minIntervalMs) {
        await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
      }
      const result = await item.fn();
      this.lastRequestFinishedAt = Date.now();
      item.resolve(result);
    } catch (err) {
      this.lastRequestFinishedAt = Date.now();
      item.reject(err);
    } finally {
      this.active = false;
      this.processNext();
    }
  }
}

/**
 * Detect whether an error corresponds to Cohere rate limit / quota exhaustion (HTTP 429)
 * vs a brief network glitch or standard transient error.
 */
function isQuotaExceeded(err) {
  if (!err) return false;

  const status =
    err.status ||
    err.statusCode ||
    (err.response && err.response.status) ||
    (err.cause && err.cause.status);

  const rawMessage = (err.message || "").toLowerCase();
  const rawBody = typeof err.body === "string" ? err.body.toLowerCase() : JSON.stringify(err.body || "").toLowerCase();
  const combined = `${rawMessage} ${rawBody}`;

  if (status === 429 || combined.includes("429") || combined.includes("too many requests")) {
    return true;
  }

  if (
    combined.includes("quota") ||
    combined.includes("rate_limit") ||
    combined.includes("rate limit") ||
    combined.includes("limit exceeded") ||
    combined.includes("exceeded your current quota") ||
    combined.includes("trial key") ||
    combined.includes("plan limit")
  ) {
    return true;
  }

  return false;
}

/**
 * Dedicated Embedding Service using Cohere Embed API
 *
 * Provider: Cohere
 * Model: embed-v4.0
 * Dimension: 1024
 * Embedding Type: float
 * Batch Size: 32
 * Document chunks: input_type = "search_document"
 * Tutor/search queries: input_type = "search_query"
 */
class EmbeddingService {
  constructor() {
    this.defaultModel = "embed-v4.0";
    this.defaultProvider = "cohere";
    this.defaultBatchSize = 32;
    this.defaultDimension = 1024;
    this.client = null;
    this.rateLimiter = new GlobalEmbeddingRateLimiter(200);
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
   * Lazily instantiate and return the CohereClientV2 singleton.
   * Ensures COHERE_API_KEY is loaded and never exposed.
   *
   * @returns {CohereClientV2}
   */
  getClient() {
    if (this.client) return this.client;

    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "COHERE_API_KEY is not configured in environment variables. Please set COHERE_API_KEY to generate embeddings."
      );
    }

    this.client = new CohereClientV2({ token: apiKey });
    return this.client;
  }

  /**
   * Sanitize error message to guarantee COHERE_API_KEY is NEVER logged.
   *
   * @param {Error|string} err
   * @returns {string}
   */
  sanitizeError(err) {
    if (!err) return "Unknown embedding error occurred";
    let message = typeof err === "string" ? err : err.message || JSON.stringify(err);

    const cohereKey = process.env.COHERE_API_KEY;
    if (cohereKey) {
      message = message.split(cohereKey).join("[REDACTED_COHERE_KEY]");
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      message = message.split(geminiKey).join("[REDACTED_KEY]");
    }

    // Mask Bearer tokens, query param or header tokens
    message = message
      .replace(/bearer\s+[a-zA-Z0-9_\-]+/gi, "Bearer [REDACTED]")
      .replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED]")
      .replace(/[A-Za-z]:\\[^:\s\n\r"']+/g, "[file]")
      .replace(/(?:^|[\s"'])\/(?:Users|home|var|tmp|etc|app|node_modules|uploads)[^\s"']*/gi, " [file]")
      .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[db-uri]");

    return message.length > 300 ? `${message.slice(0, 297)}...` : message;
  }

  /**
   * Execute API call with quota detection and backoff for transient errors.
   * On HTTP 429 quota exhaustion: does NOT immediately retry 3 times.
   *
   * @param {Function} operation
   * @returns {Promise<any>}
   */
  async executeWithRetry(operation) {
    const maxRetries = 3;
    let delay = 1000;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (err) {
        // 1. Quota / Rate limit exceeded (HTTP 429 / TooManyRequests):
        // Do not rapidly retry 3 times; throw a retryable error so BullMQ can handle it.
        if (isQuotaExceeded(err)) {
          console.warn("[CohereEmbedding] quota exhausted - delaying job");
          const safeMsg = this.sanitizeError(err);
          const quotaErr = new Error(`[CohereEmbedding] Quota exhausted: ${safeMsg}`);
          quotaErr.status = 429;
          quotaErr.statusCode = 429;
          quotaErr.isQuotaExceeded = true;
          quotaErr.code = "QUOTA_EXHAUSTED";
          quotaErr.originalError = safeMsg;
          quotaErr.headers = err.headers || (err.response && err.response.headers);
          throw quotaErr;
        }

        const status =
          err.status ||
          err.statusCode ||
          (err.response && err.response.status) ||
          (err.cause && err.cause.status);

        // 2. Transient network/server errors (500, 502, 503, 504, connection reset)
        const isTransient =
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504 ||
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.name === "FetchError" ||
          err.name === "CohereTimeoutError";

        if (!isTransient || attempt > maxRetries) {
          const safeMsg = this.sanitizeError(err);
          console.error(`[CohereEmbedding] Error: ${safeMsg}`);
          const safeErr = new Error(`[CohereEmbedding] ${safeMsg}`);
          safeErr.status = status;
          safeErr.statusCode = status;
          safeErr.originalError = safeMsg;
          throw safeErr;
        }

        const jitter = Math.floor(Math.random() * 300);
        const waitTime = delay + jitter;
        console.warn(
          `[CohereEmbedding] Temporary transient network error (${status || err.code || "network"}). Retrying attempt ${attempt}/${maxRetries} in ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2;
      }
    }
  }

  /**
   * Warmup method (preserved for backwards compatibility).
   * Verifies Cohere configuration without loading heavy local models into RAM.
   */
  async warmup() {
    const hasKey = Boolean(process.env.COHERE_API_KEY);
    if (!hasKey) {
      console.warn(
        `[CohereEmbedding] Warning: COHERE_API_KEY is not yet defined in environment. Embeddings will fail until key is set.`
      );
    } else {
      console.log(
        `[CohereEmbedding] Initialized with Cohere model "${this.getModel()}" (${this.getDimension()} dimensions)`
      );
    }
    return true;
  }

  /**
   * Embed a batch of texts using Cohere Embed API.
   *
   * @param {string[]} texts - Array of string chunks or query text
   * @param {Object} options - { model, inputType, taskType, dimension, userId, projectId }
   * @returns {Promise<Object>} { vectors, model, inputTokens, latency, dimension }
   */
  async embedBatch(texts, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.getModel();
    const dimension = options.dimension || this.getDimension();

    // Map inputType: "search_query" for search queries, "search_document" for document chunks
    const isQuery =
      options.inputType === "query" ||
      options.inputType === "search_query" ||
      options.taskType === "RETRIEVAL_QUERY" ||
      options.isQuery === true;
    const inputType = isQuery ? "search_query" : "search_document";

    const textList = Array.isArray(texts) ? texts : [texts];
    if (textList.length === 0) {
      return {
        vectors: [],
        model,
        inputTokens: 0,
        latency: 0,
        dimension,
      };
    }

    // Clean inputs and enforce safe character bounds per item
    const sanitizedTexts = textList.map((t) =>
      t && typeof t === "string" ? t.trim().slice(0, 10000) : " "
    );

    // Token estimation: ~4 characters per token + 5 overhead
    const estimatedTokens = sanitizedTexts.reduce(
      (sum, t) => sum + Math.max(Math.ceil(t.length / 4), 1) + 5,
      0
    );

    console.log(
      `[CohereEmbedding] batch size: ${sanitizedTexts.length} item(s) (inputType: ${inputType}, dimension: ${dimension}, model: ${model})`
    );

    const client = this.getClient();

    try {
      const response = await this.rateLimiter.execute(async () => {
        return await this.executeWithRetry(async () => {
          return await client.embed({
            model,
            texts: sanitizedTexts,
            inputType,
            embeddingTypes: ["float"],
            outputDimension: dimension,
          });
        });
      });

      // Extract vector values from SDK response
      let vectors = [];
      if (response?.embeddings?.float && Array.isArray(response.embeddings.float)) {
        vectors = response.embeddings.float;
      } else if (Array.isArray(response?.embeddings)) {
        vectors = response.embeddings;
      }

      if (!vectors || vectors.length !== sanitizedTexts.length) {
        throw new Error(
          `[CohereEmbedding] Vector count mismatch: expected ${sanitizedTexts.length}, received ${vectors?.length || 0}`
        );
      }

      const latency = Date.now() - startTime;
      console.log(
        `[CohereEmbedding] success: ${vectors.length} vector(s) generated in ${latency}ms (dimension: ${vectors[0]?.length || dimension})`
      );

      return {
        vectors,
        model,
        inputTokens: estimatedTokens,
        latency,
        dimension: vectors[0]?.length || dimension,
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
   * Automatically re-embeds legacy chunks whose dimension does not match 1024 or whose model differs.
   * Persists each batch of 32 chunks immediately upon success.
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
    // or have an incompatible vector dimension (e.g. legacy 1536-dim Gemini or 384-dim ONNX vectors),
    // or whose model !== embed-v4.0.
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
        note: `All chunks are already embedded with Cohere ${targetDim}-dimensional model`,
      };
    }

    const batchSize = options.batchSize || this.getBatchSize();
    let totalEmbedded = 0;
    let batchesCount = 0;

    // 3. Process chunks in bounded batches (default 32 chunks per batch)
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      batchesCount++;
      const chunkBatch = chunksToEmbed.slice(i, i + batchSize);
      const batchTexts = chunkBatch.map((c) => c.text);

      console.log(
        `[CohereEmbedding] batch size: ${batchTexts.length} chunks (${i + 1}-${Math.min(i + batchSize, chunksToEmbed.length)} of ${chunksToEmbed.length})`
      );

      let embedResult;
      try {
        embedResult = await this.embedBatch(batchTexts, {
          ...options,
          userId,
          projectId,
          inputType: "search_document",
          dimension: targetDim,
          model: targetModel,
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
        // When a batch fails because of quota exhaustion, leave remaining chunks unembedded
        // so the next retry can continue seamlessly
        throw err;
      }

      // 4. Persist 1024-dimensional embeddings back to MongoDB Chunk documents IMMEDIATELY
      const bulkOps = chunkBatch.map((chunk, idx) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: {
            $set: {
              embedding: embedResult.vectors[idx],
              "metadata.embeddingModel": targetModel,
              "metadata.embeddingDimension": targetDim,
              "metadata.embeddedAt": new Date(),
            },
          },
        },
      }));

      await Chunk.bulkWrite(bulkOps);
      totalEmbedded += chunkBatch.length;

      console.log(
        `[CohereEmbedding] success: batch of ${chunkBatch.length} chunks persisted to database (${totalEmbedded}/${chunksToEmbed.length} total embedded)`
      );

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
   * Re-embed all chunks of a specific material with the Cohere 1024-dimensional model.
   *
   * @param {string|ObjectId} materialId
   * @param {Object} context - { userId, projectId }
   * @returns {Promise<Object>}
   */
  async reembedMaterial(materialId, context = {}) {
    return this.generateForMaterial(materialId, context, { forceRegenerate: true });
  }

  /**
   * Re-embed all materials in a project with the Cohere 1024-dimensional model.
   *
   * @param {string|ObjectId} projectId
   * @param {Object} context - { userId }
   * @returns {Promise<Object[]>}
   */
  async reembedProject(projectId, context = {}) {
    const materials = await Material.find({ projectId }).lean();
    const results = [];
    for (const mat of materials) {
      const res = await this.generateForMaterial(
        mat._id,
        {
          projectId,
          userId: context.userId || mat.userId,
          materialId: mat._id,
        },
        { forceRegenerate: true }
      );
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
        errorMessage: errorMessage ? this.sanitizeError(errorMessage) : null,
      });
    } catch (err) {
      console.warn(`[CohereEmbedding] Failed to record AIUsage: ${this.sanitizeError(err.message)}`);
    }
  }
}

module.exports = new EmbeddingService();
