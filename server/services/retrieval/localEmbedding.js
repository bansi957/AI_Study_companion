/**
 * Local Embedding Engine using Hugging Face Transformers.js
 *
 * Model: onnx-community/all-MiniLM-L6-v2-ONNX
 * Task: feature-extraction
 * Pooling: mean
 * Normalize: true (L2 unit vectors)
 * Dimension: 384
 *
 * Runs locally on ONNX runtime inside Node.js with zero external API calls.
 * Implements a thread-safe singleton so the model is only loaded once in memory
 * and shared across all embedding worker jobs and retrieval queries.
 */
class LocalEmbeddingService {
  constructor() {
    this.modelName = "onnx-community/all-MiniLM-L6-v2-ONNX";
    this.task = "feature-extraction";
    this.dimension = 384;
    this.pipelineInstance = null;
    this.loadingPromise = null;
  }

  /**
   * Lazily initialize and return the shared Transformers.js pipeline instance.
   * Concurrency-safe: subsequent calls await the same initialization promise.
   *
   * @returns {Promise<Function>}
   */
  async getPipeline() {
    if (this.pipelineInstance) {
      return this.pipelineInstance;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      console.log(`[LocalEmbedding] Loading ONNX model "${this.modelName}"...`);
      const startTime = Date.now();
      const { pipeline } = await import("@huggingface/transformers");
      const pipe = await pipeline(this.task, this.modelName);
      const elapsed = Date.now() - startTime;
      console.log(`[LocalEmbedding] Model "${this.modelName}" loaded successfully in ${elapsed}ms.`);
      this.pipelineInstance = pipe;
      return pipe;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  /**
   * Non-blocking warmup method to preload model weights in the background.
   */
  async warmup() {
    try {
      await this.getPipeline();
    } catch (err) {
      console.warn(`[LocalEmbedding] Warmup warning: ${err.message}`);
    }
  }

  /**
   * Generate 384-dimensional normalized embeddings for an array of texts.
   *
   * @param {string|string[]} texts - Single text or array of texts
   * @returns {Promise<number[][]>} Array of 384-element float vectors
   */
  async embed(texts) {
    const pipe = await this.getPipeline();
    const textArray = Array.isArray(texts) ? texts : [texts];

    if (textArray.length === 0) {
      return [];
    }

    // Clean inputs to avoid empty/null string crashes
    const sanitized = textArray.map((t) => (t && typeof t === "string" ? t.trim() : " "));

    const output = await pipe(sanitized, {
      pooling: "mean",
      normalize: true,
    });

    const rawList = output.tolist();
    // Normalize return shape: if single 1D vector returned, wrap into 2D array
    if (rawList.length > 0 && typeof rawList[0] === "number") {
      return [rawList];
    }

    return rawList;
  }
}

// Singleton export
const localEmbedding = new LocalEmbeddingService();
module.exports = localEmbedding;
