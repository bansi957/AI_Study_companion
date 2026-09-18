const { GoogleGenAI } = require("@google/genai");
const Chunk = require("../../models/Chunk");
const Material = require("../../models/Material");
const AIUsage = require("../../models/AIUsage");

/**
 * Global Embedding Rate Limiter
 * Ensures only one Gemini embedding request is active at a time across the entire process.
 * Enforces a small delay between consecutive requests to prevent RPM spikes.
 */
class GlobalEmbeddingRateLimiter {
  constructor(minIntervalMs = 500) {
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
 * Detect whether an error corresponds to Gemini quota exhaustion / HTTP 429
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
  const rawDetails = err.errorDetails || err.statusDetails || "";
  const detailsStr =
    typeof rawDetails === "string"
      ? rawDetails.toLowerCase()
      : JSON.stringify(rawDetails || "").toLowerCase();
  const combined = `${rawMessage} ${detailsStr}`;

  if (status === 429 || combined.includes("429") || combined.includes("resource_exhausted")) {
    return true;
  }

  if (
    combined.includes("quota") ||
    combined.includes("rate_limit") ||
    combined.includes("limit per minute") ||
    combined.includes("requests per minute") ||
    combined.includes("free_tier") ||
    combined.includes("exceeded your current quota")
  ) {
    return true;
  }

  return false;
}

/**
 * Dedicated Embedding Service using Google Gemini Embedding API
 *
 * Model: gemini-embedding-001
 * Dimension: 1536
 * Provider: gemini (@google/genai SDK)
 */
class EmbeddingService {
  constructor() {
    this.defaultModel = "gemini-embedding-001";
    this.defaultProvider = "gemini";
    this.defaultBatchSize = 8;
    this.defaultDimension = 1536;
    this.client = null;
    this.rateLimiter = new GlobalEmbeddingRateLimiter(500);
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
   * Lazily instantiate and return the GoogleGenAI client singleton.
   * Ensures GEMINI_API_KEY is loaded and never exposed.
   *
   * @returns {GoogleGenAI}
   */
  getClient() {
    if (this.client) return this.client;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured in environment variables. Please set GEMINI_API_KEY to generate embeddings."
      );
    }

    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  /**
   * Sanitize error message to guarantee GEMINI_API_KEY is NEVER logged.
   *
   * @param {Error|string} err
   * @returns {string}
   */
  sanitizeError(err) {
    if (!err) return "Unknown embedding error occurred";
    let message = typeof err === "string" ? err : err.message || JSON.stringify(err);

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      message = message.split(apiKey).join("[REDACTED_GEMINI_KEY]");
    }

    // Mask any query param or header containing key=... or AIza...
    message = message
      .replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED]")
      .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]")
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
        // 1. Quota exceeded (HTTP 429 / RESOURCE_EXHAUSTED):
        // Do not immediately retry quota-exceeded 3 times!
        if (isQuotaExceeded(err)) {
          console.warn("[GeminiEmbedding] quota exhausted - delaying job");
          const safeMsg = this.sanitizeError(err);
          const quotaErr = new Error(`[GeminiEmbedding] Quota exhausted: ${safeMsg}`);
          quotaErr.status = 429;
          quotaErr.isQuotaExceeded = true;
          quotaErr.code = "QUOTA_EXHAUSTED";
          quotaErr.originalError = safeMsg;
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
          err.name === "FetchError";

        if (!isTransient || attempt > maxRetries) {
          const safeMsg = this.sanitizeError(err);
          console.error(`[GeminiEmbedding] Error: ${safeMsg}`);
          const safeErr = new Error(`[GeminiEmbedding] ${safeMsg}`);
          safeErr.status = status;
          safeErr.originalError = safeMsg;
          throw safeErr;
        }

        const jitter = Math.floor(Math.random() * 300);
        const waitTime = delay + jitter;
        console.warn(
          `[GeminiEmbedding] Temporary transient network error (${status || err.code || "network"}). Retrying attempt ${attempt}/${maxRetries} in ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2;
      }
    }
  }

  /**
   * Warmup method (preserved for backwards compatibility).
   * Verifies Gemini configuration without loading heavy local models into RAM.
   */
  async warmup() {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    if (!hasKey) {
      console.warn(
        `[GeminiEmbedding] Warning: GEMINI_API_KEY is not yet defined in environment. Embeddings will fail until key is set.`
      );
    } else {
      console.log(
        `[GeminiEmbedding] Initialized with Google model "${this.getModel()}" (${this.getDimension()} dimensions)`
      );
    }
    return true;
  }

  /**
   * Embed a batch of texts using Google Gemini Embedding API.
   *
   * @param {string[]} texts - Array of string chunks or query text
   * @param {Object} options - { model, taskType, inputType, dimension, userId, projectId, title }
   * @returns {Promise<Object>} { vectors, model, inputTokens, latency, dimension }
   */
  async embedBatch(texts, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.getModel();
    const dimension = options.dimension || this.getDimension();

    // Determine taskType: RETRIEVAL_QUERY for search queries; RETRIEVAL_DOCUMENT for chunks
    const isQuery =
      options.inputType === "query" ||
      options.taskType === "RETRIEVAL_QUERY" ||
      options.isQuery === true;
    const taskType = isQuery ? "RETRIEVAL_QUERY" : (options.taskType || "RETRIEVAL_DOCUMENT");

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
      `[GeminiEmbedding] batch size: ${sanitizedTexts.length} item(s) (taskType: ${taskType}, outputDimension: ${dimension}, model: ${model})`
    );

    const ai = this.getClient();

    try {
      const response = await this.rateLimiter.execute(async () => {
        return await this.executeWithRetry(async () => {
          return await ai.models.embedContent({
            model,
            contents: sanitizedTexts,
            config: {
              taskType,
              outputDimensionality: dimension,
              ...(options.title ? { title: options.title } : {}),
            },
          });
        });
      });

      // Extract vector values from SDK response
      let vectors = [];
      if (Array.isArray(response?.embeddings) && response.embeddings.length > 0) {
        vectors = response.embeddings.map((e) => e.values || e);
      } else if (response?.embedding?.values) {
        vectors = [response.embedding.values];
      } else if (Array.isArray(response?.values)) {
        vectors = [response.values];
      }

      // Fallback for single text if return format is singular
      if (sanitizedTexts.length === 1 && vectors.length === 0 && response?.embedding) {
        vectors = [response.embedding];
      }

      if (!vectors || vectors.length !== sanitizedTexts.length) {
        throw new Error(
          `[GeminiEmbedding] Vector count mismatch: expected ${sanitizedTexts.length}, received ${vectors?.length || 0}`
        );
      }

      const latency = Date.now() - startTime;
      console.log(
        `[GeminiEmbedding] success: ${vectors.length} vector(s) generated in ${latency}ms (dimension: ${vectors[0]?.length || dimension})`
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
   * Automatically re-embeds legacy chunks whose dimension does not match 1536 or whose model differs.
   * Persists each batch immediately upon success.
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
    // or have an incompatible vector dimension (e.g. legacy 384-dim ONNX vectors or 1024-dim vectors).
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
        note: `All chunks are already embedded with Gemini ${targetDim}-dimensional model`,
      };
    }

    const batchSize = options.batchSize || this.getBatchSize();
    let totalEmbedded = 0;
    let batchesCount = 0;

    // 3. Process chunks in bounded batches (default 8 chunks per batch)
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      batchesCount++;
      const chunkBatch = chunksToEmbed.slice(i, i + batchSize);
      const batchTexts = chunkBatch.map((c) => c.text);

      console.log(
        `[GeminiEmbedding] batch size: ${batchTexts.length} chunks (${i + 1}-${Math.min(i + batchSize, chunksToEmbed.length)} of ${chunksToEmbed.length})`
      );

      let embedResult;
      try {
        embedResult = await this.embedBatch(batchTexts, {
          ...options,
          userId,
          projectId,
          taskType: "RETRIEVAL_DOCUMENT",
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

      // 4. Persist 1536-dimensional embeddings back to MongoDB Chunk documents IMMEDIATELY
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

      console.log(
        `[GeminiEmbedding] success: batch of ${chunkBatch.length} chunks persisted to database (${totalEmbedded}/${chunksToEmbed.length} total embedded)`
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
   * Re-embed all chunks of a specific material with the Gemini 1536-dimensional model.
   *
   * @param {string|ObjectId} materialId
   * @param {Object} context - { userId, projectId }
   * @returns {Promise<Object>}
   */
  async reembedMaterial(materialId, context = {}) {
    return this.generateForMaterial(materialId, context, { forceRegenerate: true });
  }

  /**
   * Re-embed all materials in a project with the Gemini 1536-dimensional model.
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
      console.warn(`[GeminiEmbedding] Failed to record AIUsage: ${this.sanitizeError(err.message)}`);
    }
  }
}

module.exports = new EmbeddingService();
