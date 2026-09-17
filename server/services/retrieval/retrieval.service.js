const mongoose = require("mongoose");
const Chunk = require("../../models/Chunk");
const Project = require("../../models/Project");
const Material = require("../../models/Material");
const embeddingService = require("./embedding.service");

/**
 * Retrieval Service
 *
 * Coordinates project-scoped MongoDB Atlas Vector Search ($vectorSearch),
 * query vector generation, exact citation mapping, and LLM-ready RAG context building.
 */
class RetrievalService {
  constructor() {
    this.indexName = process.env.VECTOR_INDEX_NAME || "vector_index";
    this.defaultTopK = parseInt(process.env.RETRIEVAL_DEFAULT_TOP_K, 10) || 5;
    this.similarityMetric = process.env.VECTOR_SIMILARITY || "cosine";
    this.isIndexCreating = false;
  }

  /**
   * Non-blocking Atlas Vector Search Index initialization
   * Checks if vector search index exists; creates it asynchronously if missing.
   * Does NOT block server startup.
   */
  async ensureVectorIndex(options = {}) {
    if (this.isIndexCreating) return;

    try {
      if (mongoose.connection.readyState !== 1) {
        // Not connected yet; wait or defer
        return;
      }

      const coll = mongoose.connection.collection("chunks");
      let existingIndexes = [];

      try {
        existingIndexes = await coll.listSearchIndexes().toArray();
      } catch (listErr) {
        // Search index commands not available on standalone / mock instances
        console.warn(`[RetrievalService] Search index listing skipped: ${listErr.message}`);
        return;
      }

      const indexExists = existingIndexes.some(
        (idx) => idx.name === this.indexName
      );

      if (!indexExists) {
        this.isIndexCreating = true;
        // Dynamically resolve dimensions from embedding service or options (NOT hardcoded)
        const dimensions =
          options.dimension ||
          embeddingService.getDimension();

        const indexDefinition = {
          name: this.indexName,
          type: "vectorSearch",
          definition: {
            fields: [
              {
                type: "vector",
                path: "embedding",
                numDimensions: dimensions,
                similarity: options.similarity || this.similarityMetric,
              },
              {
                type: "filter",
                path: "projectId",
              },
              {
                type: "filter",
                path: "materialId",
              },
            ],
          },
        };

        console.log(
          `[RetrievalService] Initiating non-blocking creation of Atlas Vector Search index "${this.indexName}" (${dimensions} dims, ${this.similarityMetric})...`
        );

        coll
          .createSearchIndex(indexDefinition)
          .then((idxName) => {
            console.log(`[RetrievalService] Atlas Vector Search index creation dispatched: ${idxName}`);
          })
          .catch((err) => {
            console.warn(`[RetrievalService] Atlas Search index creation failed: ${err.message}`);
          })
          .finally(() => {
            this.isIndexCreating = false;
          });
      }
    } catch (err) {
      console.warn(`[RetrievalService] ensureVectorIndex encountered warning: ${err.message}`);
      this.isIndexCreating = false;
    }
  }

  /**
   * Search relevant chunks within a specific project using MongoDB Atlas $vectorSearch
   *
   * @param {Object} params - { projectId, queryEmbedding, topK, materialId, allowDevFallback }
   * @returns {Promise<Array<Object>>} Top matching chunks with similarity scores
   */
  async searchRelevantChunks({
    projectId,
    queryEmbedding,
    topK = this.defaultTopK,
    materialId = null,
    allowDevFallback = true,
  }) {
    if (!projectId) {
      throw new Error("Missing required projectId for vector search");
    }
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error("Missing or invalid queryEmbedding vector");
    }

    const limit = Math.max(1, Math.min(parseInt(topK, 10) || this.defaultTopK, 20));
    const projectObjectId = new mongoose.Types.ObjectId(projectId);

    // Filter strictly to current project (and optionally specific material)
    const filterConditions = {
      projectId: projectObjectId,
    };
    if (materialId && mongoose.Types.ObjectId.isValid(materialId)) {
      filterConditions.materialId = new mongoose.Types.ObjectId(materialId);
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: this.indexName,
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: Math.max(limit * 10, 50),
          limit,
          filter: filterConditions,
        },
      },
      {
        $project: {
          _id: 1,
          text: 1,
          materialId: 1,
          projectId: 1,
          pages: 1,
          sourceSegments: 1,
          chunkIndex: 1,
          metadata: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const isDevFallbackAllowed =
      allowDevFallback ||
      (process.env.NODE_ENV === "development" &&
        process.env.ENABLE_DEV_VECTOR_FALLBACK === "true");

    try {
      const results = await Chunk.aggregate(pipeline);

      if (results.length === 0 && isDevFallbackAllowed) {
        return this.devModeCosineFallback({
          projectId: projectObjectId,
          queryEmbedding,
          limit,
          materialId: filterConditions.materialId,
        });
      }

      return results.map((r) => ({
        _id: r._id,
        text: r.text,
        materialId: r.materialId,
        projectId: r.projectId,
        pages: r.pages || [],
        sourceSegments: r.sourceSegments || [],
        chunkIndex: r.chunkIndex,
        metadata: r.metadata || {},
        score: parseFloat((r.score || 0).toFixed(4)),
      }));
    } catch (vectorSearchError) {
      if (isDevFallbackAllowed) {
        console.warn(
          `[RetrievalService] Atlas $vectorSearch unavailable (${vectorSearchError.message}). Using dev-mode fallback.`
        );
        return this.devModeCosineFallback({
          projectId: projectObjectId,
          queryEmbedding,
          limit,
          materialId: filterConditions.materialId,
        });
      }

      // In production/standard mode, bubble up error
      throw new Error(`MongoDB Vector Search failed: ${vectorSearchError.message}`);
    }
  }

  /**
   * Optional dev-mode cosine similarity fallback (strictly scoped to project)
   */
  async devModeCosineFallback({ projectId, queryEmbedding, limit, materialId }) {
    const query = {
      projectId,
      embedding: { $ne: null },
    };
    if (materialId) query.materialId = materialId;

    const chunks = await Chunk.find(query).lean();
    if (!chunks || chunks.length === 0) return [];

    const scored = chunks.map((c) => {
      const score = this.calculateCosineSimilarity(queryEmbedding, c.embedding);
      return {
        _id: c._id,
        text: c.text,
        materialId: c.materialId,
        projectId: c.projectId,
        pages: c.pages || [],
        sourceSegments: c.sourceSegments || [],
        chunkIndex: c.chunkIndex,
        metadata: c.metadata || {},
        score: parseFloat(score.toFixed(4)),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Helper: cosine similarity between two unit vectors
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Full end-to-end retrieval for a query:
   * 1. Validates project ownership
   * 2. Generates query embedding
   * 3. Executes project-isolated vector search
   * 4. Assembles structured RAG context with verified citations
   */
  async retrieveForQuery({
    projectId,
    userId,
    query,
    topK = this.defaultTopK,
    materialId = null,
    allowDevFallback = true,
  }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      const err = new Error("Query text is required");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify that requested project belongs strictly to req.user.userId
    const project = await Project.findOne({
      _id: projectId,
      userId,
    });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Generate query embedding using the same model as document chunks
    const embedResult = await embeddingService.embedBatch([query.trim()], {
      userId,
      projectId,
    });
    const queryEmbedding = embedResult.vectors[0];

    // 3. Perform project-isolated vector search
    const results = await this.searchRelevantChunks({
      projectId,
      queryEmbedding,
      topK,
      materialId,
      allowDevFallback,
    });

    if (!results || results.length === 0) {
      return {
        query: query.trim(),
        topK,
        results: [],
        context: "",
        sources: [],
      };
    }

    // 4. Resolve material titles for verified human-readable citations
    const materialIds = [
      ...new Set(results.map((r) => String(r.materialId)).filter(Boolean)),
    ];
    const materials = await Material.find({ _id: { $in: materialIds } })
      .select("originalName filename")
      .lean();
    const materialMap = new Map(
      materials.map((m) => [String(m._id), m.originalName || m.filename || "Document"])
    );

    // 5. Enrich results with materialName
    const enrichedResults = results.map((r) => ({
      ...r,
      materialName: materialMap.get(String(r.materialId)) || "Document",
    }));

    // 6. Build LLM-ready RAG context
    const context = this.buildRagContext(enrichedResults, materialMap);

    // 7. Verified citation metadata
    const sources = enrichedResults.map((r) => ({
      materialId: r.materialId,
      materialName: r.materialName,
      pages: r.pages,
      chunkIndex: r.chunkIndex,
      score: r.score,
    }));

    return {
      query: query.trim(),
      topK,
      results: enrichedResults,
      context,
      sources,
    };
  }

  /**
   * Convert retrieved chunks into LLM-ready context with exact page citations
   *
   * @param {Array<Object>} chunks - Retrieved chunk objects
   * @param {Map<string, string>} materialMap - Material ID to filename mapping
   * @returns {string} Formatted context block
   */
  buildRagContext(chunks, materialMap = new Map()) {
    if (!chunks || chunks.length === 0) return "";

    const contextBlocks = chunks.map((chunk, idx) => {
      const sourceNum = idx + 1;
      const matName =
        chunk.materialName ||
        materialMap.get(String(chunk.materialId)) ||
        "Document";
      const pagesStr =
        chunk.pages && chunk.pages.length > 0
          ? chunk.pages.join(", ")
          : "N/A";

      // If sourceSegments are available with granular page mappings, format per segment
      if (chunk.sourceSegments && chunk.sourceSegments.length > 1) {
        const segmentsText = chunk.sourceSegments
          .map((seg) => `[Page ${seg.page}]\n${seg.text.trim()}`)
          .join("\n\n");

        return `SOURCE ${sourceNum}
Material: ${matName}
Page(s): ${pagesStr}
Content:
${segmentsText}`;
      }

      return `SOURCE ${sourceNum}
Material: ${matName}
Page(s): ${pagesStr}
Content:
${String(chunk.text || "").trim()}`;
    });

    return contextBlocks.join("\n\n---\n\n");
  }
}

module.exports = new RetrievalService();
