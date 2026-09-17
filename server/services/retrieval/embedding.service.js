const Chunk = require("../../models/Chunk");
const AIUsage = require("../../models/AIUsage");

/**
 * Dedicated Embedding Service
 *
 * Generates vector representations for retrieval chunks, saving them to Chunk.embedding
 * in MongoDB. Supports OpenAI-compatible endpoints (e.g. text-embedding-3-small),
 * Gemini (text-embedding-004), and a deterministic fallback engine for offline testing.
 */
class EmbeddingService {
  constructor() {
    this.defaultModel = "text-embedding-3-small";
    this.defaultProvider = "openai";
    this.defaultBatchSize = 32;
    this.defaultDimension = 1536;
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
    const provider = this.getProvider();
    const model = this.getModel();
    if (provider === "voyage" || model.includes("voyage")) return 1024;
    if (model.includes("004")) return 768;
    if (model.includes("3-large")) return 3072;
    return this.defaultDimension; // default 1536 for text-embedding-3-small
  }

  getBaseUrl() {
    if (process.env.EMBEDDING_BASE_URL) {
      return process.env.EMBEDDING_BASE_URL.replace(/\/+$/, "");
    }
    const provider = this.getProvider();
    if (provider === "voyage") {
      return "https://api.voyageai.com/v1";
    }
    return "https://api.openai.com/v1";
  }

  getApiKey() {
    return (
      process.env.EMBEDDING_API_KEY ||
      process.env.VOYAGE_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      null
    );
  }

  /**
   * Deterministic vector generator for test/offline environments
   * Generates a unit-normalized vector of exact specified dimension.
   */
  generateDeterministicVector(text, dimension = 1536) {
    const vector = new Array(dimension).fill(0);
    const cleanText = String(text || "").trim();

    if (!cleanText) {
      vector[0] = 1.0;
      return vector;
    }

    // Seed hash projection using character codepoints and ngram positions
    for (let i = 0; i < cleanText.length; i++) {
      const code = cleanText.charCodeAt(i);
      const idx1 = (code * 31 + i * 17) % dimension;
      const idx2 = (code * 47 + (i % 13) * 101) % dimension;
      vector[idx1] += Math.sin(code + i);
      vector[idx2] += Math.cos(code - i);
    }

    // L2 unit normalization
    let norm = 0;
    for (let i = 0; i < dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] = parseFloat((vector[i] / norm).toFixed(6));
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  }

  /**
   * Call external embedding provider (OpenAI or Gemini) or local deterministic engine
   */
  async embedBatch(texts, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.getModel();
    const provider = options.provider || this.getProvider();
    const apiKey = options.apiKey !== undefined ? options.apiKey : this.getApiKey();
    const baseUrl = options.baseUrl || this.getBaseUrl();

    // Forced failure simulation for testing error handling in queue
    if (options.forceFailure) {
      const latency = Date.now() - startTime;
      throw new Error("Simulated embedding provider API failure");
    }

    // Rough token estimation: ~4 chars per token + 5 overhead per text
    const estimatedTokens = texts.reduce(
      (sum, t) => sum + Math.max(Math.ceil((t || "").length / 4), 1) + 5,
      0
    );

    try {
      let vectors = [];
      let inputTokens = estimatedTokens;

      // 1. Voyage AI embedding endpoint
      if (provider === "voyage") {
        if (!apiKey) {
          throw new Error("Voyage AI API key is missing. Please configure EMBEDDING_API_KEY in .env");
        }
        const inputType = options.inputType || (options.isQuery ? "query" : "document");
        const url = `${baseUrl}/embeddings`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: texts,
            input_type: inputType,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(`Voyage AI embedding API returned status ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error("Voyage AI embedding API returned invalid data format");
        }

        // Sort by index to ensure original order
        const sortedData = [...data.data].sort((a, b) => a.index - b.index);
        vectors = sortedData.map((d) => d.embedding);
        if (data.usage?.total_tokens) {
          inputTokens = data.usage.total_tokens;
        }
      }
      // 2. OpenAI or OpenAI-compatible embedding endpoint
      else if (apiKey && provider === "openai" && !options.useLocalOnly) {
        const url = `${baseUrl}/embeddings`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: texts,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(`OpenAI embedding API returned status ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error("OpenAI embedding API returned invalid data format");
        }

        // Sort by index to ensure original order
        const sortedData = [...data.data].sort((a, b) => a.index - b.index);
        vectors = sortedData.map((d) => d.embedding);
        if (data.usage?.prompt_tokens) {
          inputTokens = data.usage.prompt_tokens;
        }
      }
      // 3. Google Gemini Embedding API
      else if (apiKey && provider === "gemini" && !options.useLocalOnly) {
        const geminiModel = model.includes("text-embedding") ? model : "text-embedding-004";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:batchEmbedContents?key=${apiKey}`;

        const requests = texts.map((t) => ({
          model: `models/${geminiModel}`,
          content: { parts: [{ text: t }] },
        }));

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(`Gemini embedding API returned status ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        if (!data.embeddings || !Array.isArray(data.embeddings)) {
          throw new Error("Gemini embedding API returned invalid format");
        }
        vectors = data.embeddings.map((e) => e.values);
      }
      // 4. Deterministic Local Vector Engine (fallback for non-voyage offline/tests)
      else {
        if (provider === "voyage") {
          throw new Error("Voyage AI provider cannot use deterministic fallback");
        }
        const targetDim = this.getDimension();
        vectors = texts.map((t) => this.generateDeterministicVector(t, targetDim));
      }

      const latency = Date.now() - startTime;

      return {
        vectors,
        model,
        inputTokens,
        latency,
        dimension: vectors[0]?.length || this.getDimension(),
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
   * Generate and persist embeddings for all unprocessed chunks of a material
   *
   * @param {string|ObjectId} materialId
   * @param {Object} context - { userId, projectId, materialId }
   * @param {Object} options - { forceFailure, useLocalOnly, forceRegenerate, batchSize }
   * @returns {Promise<Object>}
   */
  async generateForMaterial(materialId, context = {}, options = {}) {
    const matId = materialId || context.materialId;
    const { userId, projectId } = context;

    if (!matId) {
      throw new Error("Missing materialId for embedding generation");
    }

    // 1. Fetch chunks for this material in index order
    const query = { materialId: matId };
    if (projectId) query.projectId = projectId;
    if (userId) query.userId = userId;

    if (!options.forceRegenerate) {
      // Skip chunks that already possess valid non-empty embeddings
      query.$or = [
        { embedding: null },
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } },
      ];
    }

    const chunksToEmbed = await Chunk.find(query).sort({ chunkIndex: 1 });

    if (!chunksToEmbed || chunksToEmbed.length === 0) {
      const totalCount = await Chunk.countDocuments({ materialId: matId });
      return {
        status: "COMPLETED",
        totalChunks: totalCount,
        embeddedCount: 0,
        alreadyEmbedded: totalCount,
        dimension: this.getDimension(),
        batchesCount: 0,
        note: "All chunks already embedded or no chunks exist",
      };
    }

    const batchSize = options.batchSize || this.getBatchSize();
    let totalEmbedded = 0;
    let vectorDimension = this.getDimension();
    let batchesCount = 0;

    // 2. Process chunks in bounded batches
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      batchesCount++;
      const chunkBatch = chunksToEmbed.slice(i, i + batchSize);
      const batchTexts = chunkBatch.map((c) => c.text);

      let embedResult;
      try {
        embedResult = await this.embedBatch(batchTexts, {
          ...options,
          inputType: "document",
          userId,
          projectId,
        });
      } catch (err) {
        // Record failed batch in AIUsage
        if (userId && projectId) {
          await this.recordUsage({
            userId,
            projectId,
            model: err.model || this.getModel(),
            latency: err.latency || 0,
            inputTokens: err.estimatedTokens || 0,
            success: false,
            errorMessage: err.message,
          });
        }
        throw err;
      }

      vectorDimension = embedResult.dimension;

      // Record successful batch in AIUsage
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

      // 3. Persist embeddings back to MongoDB Chunk documents via bulkWrite
      const bulkOps = chunkBatch.map((chunk, idx) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: {
            $set: {
              embedding: embedResult.vectors[idx],
              "metadata.embeddingModel": embedResult.model,
              "metadata.embeddedAt": new Date(),
            },
          },
        },
      }));

      await Chunk.bulkWrite(bulkOps);
      totalEmbedded += chunkBatch.length;
    }

    const totalChunks = await Chunk.countDocuments({ materialId: matId });

    return {
      status: "COMPLETED",
      totalChunks,
      embeddedCount: totalEmbedded,
      dimension: vectorDimension,
      batchesCount,
      model: options.model || this.getModel(),
    };
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
