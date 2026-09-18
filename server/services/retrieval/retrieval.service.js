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

      const targetDimensions =
        options.dimension || embeddingService.getDimension();

      const indexDefinition = {
        name: this.indexName,
        type: "vectorSearch",
        definition: {
          fields: [
            {
              type: "vector",
              path: "embedding",
              numDimensions: targetDimensions,
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

      if (!indexExists) {
        this.isIndexCreating = true;
        console.log(
          `[RetrievalService] Initiating creation of Atlas Vector Search index "${this.indexName}" (${targetDimensions} dims, ${this.similarityMetric})...`
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
      } else {
        // Check if existing index dimensions match current embedding model
        const existing = existingIndexes.find((idx) => idx.name === this.indexName);
        const currentDim = existing?.latestDefinition?.fields?.find((f) => f.type === "vector")?.numDimensions;

        if (currentDim && currentDim !== targetDimensions) {
          console.log(
            `[RetrievalService] Updating Atlas Vector Search index "${this.indexName}" from ${currentDim} to ${targetDimensions} dimensions...`
          );
          this.isIndexCreating = true;
          coll
            .updateSearchIndex(this.indexName, indexDefinition.definition)
            .then(() => {
              console.log(`[RetrievalService] Atlas Vector Search index update dispatched successfully`);
            })
            .catch((err) => {
              console.warn(`[RetrievalService] Atlas Search index update failed: ${err.message}`);
            })
            .finally(() => {
              this.isIndexCreating = false;
            });
        }
      }
    } catch (err) {
      console.warn(`[RetrievalService] ensureVectorIndex encountered warning: ${err.message}`);
      this.isIndexCreating = false;
    }
  }

  /**
   * Explicitly drop and recreate or update the Vector Search index for 1536 dimensions
   */
  async recreateVectorIndex(dimension = 1536) {
    const coll = mongoose.connection.collection("chunks");
    const targetDimensions = dimension || embeddingService.getDimension();
    const indexDefinition = {
      name: this.indexName,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: targetDimensions,
            similarity: this.similarityMetric,
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

    try {
      const existingIndexes = await coll.listSearchIndexes().toArray();
      const existing = existingIndexes.find((idx) => idx.name === this.indexName);
      if (existing) {
        await coll.updateSearchIndex(this.indexName, indexDefinition.definition);
        console.log(`[RetrievalService] Updated Atlas Search index "${this.indexName}" to ${targetDimensions} dimensions`);
      } else {
        await coll.createSearchIndex(indexDefinition);
        console.log(`[RetrievalService] Created Atlas Search index "${this.indexName}" with ${targetDimensions} dimensions`);
      }
      return { success: true, dimensions: targetDimensions };
    } catch (err) {
      console.warn(`[RetrievalService] recreateVectorIndex notice: ${err.message}`);
      return { success: false, error: err.message };
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
          page: 1,
          pages: 1,
          sourceSegments: 1,
          chunkIndex: 1,
          metadata: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const isDevFallbackAllowed =
      allowDevFallback !== false ||
      process.env.ENABLE_DEV_VECTOR_FALLBACK === "true";

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
        page: r.page,
        pages: r.pages || [],
        sourceSegments: r.sourceSegments || [],
        chunkIndex: r.chunkIndex,
        metadata: r.metadata || {},
        score: parseFloat((r.score || 0).toFixed(4)),
      }));
    } catch (vectorSearchError) {
      console.warn(
        `[RetrievalService] Atlas $vectorSearch unavailable (${vectorSearchError.message}). Falling back to project-scoped cosine calculation.`
      );
      return this.devModeCosineFallback({
        projectId: projectObjectId,
        queryEmbedding,
        limit,
        materialId: filterConditions.materialId,
      });
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

    const scored = chunks
      .filter((c) => Array.isArray(c.embedding) && c.embedding.length === queryEmbedding.length)
      .map((c) => {
        const score = this.calculateCosineSimilarity(queryEmbedding, c.embedding);
        return {
          _id: c._id,
          text: c.text,
          materialId: c.materialId,
          projectId: c.projectId,
          page: c.page,
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
      inputType: "query",
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

    // 4. Resolve material titles and file URLs for verified citations and PDF navigation
    const materialIds = [
      ...new Set(results.map((r) => String(r.materialId)).filter(Boolean)),
    ];
    const materials = await Material.find({ _id: { $in: materialIds } })
      .select("originalName filename fileUrl")
      .lean();
    const materialMap = new Map(
      materials.map((m) => [String(m._id), m.originalName || m.filename || "Document"])
    );
    const materialUrlMap = new Map(
      materials.map((m) => [String(m._id), m.fileUrl || ""])
    );

    // 5. Build atomic source units deduplicated by unique document page (materialId + exactPage)
    // Avoids presenting duplicate page blocks like [S1] Page 2 and [S2] Page 2 to the LLM
    const sourceUnits = [];
    const pageUnitMap = new Map();

    for (const r of results) {
      const matName = materialMap.get(String(r.materialId)) || "Document";
      const fileUrl = materialUrlMap.get(String(r.materialId)) || "";

      if (Array.isArray(r.sourceSegments) && r.sourceSegments.length > 1) {
        // Multi-page chunk: inspect each page segment
        for (const seg of r.sourceSegments) {
          const segText = String(seg.text || "").trim();
          if (!segText) continue;
          const segPage = parseInt(seg.page, 10) || 1;
          const pageKey = `${String(r.materialId)}_${segPage}`;

          if (pageUnitMap.has(pageKey)) {
            const existing = pageUnitMap.get(pageKey);
            if (!existing.text.includes(segText)) {
              existing.text = `${existing.text}\n\n${segText}`.slice(0, 1500);
            }
            if (r.score > existing.score) existing.score = r.score;
          } else {
            const unit = {
              chunkId: r._id,
              materialId: r.materialId,
              materialName: matName,
              fileUrl,
              page: segPage,
              text: segText,
              chunkIndex: r.chunkIndex,
              score: r.score,
              segmentType: seg.segmentType || "paragraph",
            };
            pageUnitMap.set(pageKey, unit);
            sourceUnits.push(unit);
          }
        }
      } else {
        // Single-page chunk: exact page comes from r.page
        const exactPage = parseInt(r.page || (r.pages && r.pages[0]) || 1, 10);
        const chunkText = String(r.text || "").trim();
        const pageKey = `${String(r.materialId)}_${exactPage}`;

        if (pageUnitMap.has(pageKey)) {
          const existing = pageUnitMap.get(pageKey);
          if (chunkText && !existing.text.includes(chunkText)) {
            existing.text = `${existing.text}\n\n${chunkText}`.slice(0, 1500);
          }
          if (r.score > existing.score) existing.score = r.score;
        } else {
          const unit = {
            chunkId: r._id,
            materialId: r.materialId,
            materialName: matName,
            fileUrl,
            page: exactPage,
            text: chunkText,
            chunkIndex: r.chunkIndex,
            score: r.score,
          };
          pageUnitMap.set(pageKey, unit);
          sourceUnits.push(unit);
        }
      }
    }

    // Assign unique sequential sourceId and human-readable citation to each exposed unit
    sourceUnits.forEach((su, idx) => {
      su.sourceId = `S${idx + 1}`;
      su.citation = `${su.materialName} — Page ${su.page}`;
    });

    // 6. Build LLM-ready RAG context exposing each source segment separately
    const context = this.buildRagContext(sourceUnits);

    return {
      query: query.trim(),
      topK,
      results,
      sourceUnits,
      context,
      sources: sourceUnits.map((su) => ({
        sourceId: su.sourceId,
        materialId: su.materialId,
        materialName: su.materialName,
        page: su.page,
        fileUrl: su.fileUrl,
        citation: su.citation,
        chunkIndex: su.chunkIndex,
        score: su.score,
        sourceExcerpt: su.text.slice(0, 300),
      })),
    };
  }

  /**
   * Convert exposed source units into LLM-ready context with exact page citations
   *
   * @param {Array<Object>} sourceUnits - Exposed source unit objects
   * @returns {string} Formatted context block
   */
  buildRagContext(sourceUnits) {
    if (!sourceUnits || sourceUnits.length === 0) return "";

    const contextBlocks = sourceUnits.map((su) => {
      return `[${su.sourceId}] ${su.materialName} — Page ${su.page}\n"${su.text}"`;
    });

    return contextBlocks.join("\n\n---\n\n");
  }
}

module.exports = new RetrievalService();
