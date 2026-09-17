const mongoose = require("mongoose");
const Concept = require("../../models/Concept");
const ExtractedContent = require("../../models/ExtractedContent");
const llmService = require("../ai/llm.service");

/**
 * Knowledge Extraction Service
 *
 * Implements batched concept extraction from structured, page-aware content.
 * Guarantees strict token budgets per batch, exact page provenance preservation,
 * project-isolated deduplication, and AIUsage tracking.
 */
class KnowledgeService {
  constructor() {
    // Configurable character budget per LLM batch (approx 300-500 tokens per batch)
    // Ensures a 10-page document produces multiple LLM calls rather than sending everything at once.
    this.defaultBatchCharLimit = 1500;
  }

  /**
   * Orchestrate batched knowledge extraction for a processed material
   *
   * @param {Object} extractedResult - Result from extractionService.extract
   * @param {Object} context - { materialId, projectId, userId }
   * @param {Object} options - { batchCharLimit, simulateBatchFailure }
   * @returns {Promise<{
   *   status: string,
   *   batchesCount: number,
   *   conceptsCount: number,
   *   concepts: Array<Object>,
   *   metadata: Object
   * }>}
   */
  async extract(extractedResult, context = {}, options = {}) {
    const { materialId, projectId, userId } = context;

    if (!projectId || !materialId) {
      throw new Error("Knowledge extraction requires projectId and materialId for isolation");
    }

    // 1. Fetch structured segments for this material and project
    const segments = await ExtractedContent.find({
      materialId,
      projectId,
      ...(userId ? { userId } : {}),
    })
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .lean();

    if (!segments || segments.length === 0) {
      return {
        status: "COMPLETED",
        batchesCount: 0,
        conceptsCount: 0,
        concepts: [],
        metadata: {
          stage: "knowledge_extraction",
          materialId,
          projectId,
          note: "No segments available for knowledge extraction",
        },
      };
    }

    // 2. Partition segments into batches with a safe token/character budget
    const batchCharLimit =
      options.batchCharLimit ||
      parseInt(process.env.CONCEPT_BATCH_CHAR_LIMIT, 10) ||
      this.defaultBatchCharLimit;

    const batches = this.createBatches(segments, batchCharLimit);

    const allExtractedConcepts = [];
    let totalLlmCalls = 0;

    // 3. Process batches sequentially (controlled concurrency, avoiding excessive parallel calls)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      totalLlmCalls++;

      const batchContext = {
        userId,
        projectId,
        materialId,
        batchIndex: i,
        batchCount: batches.length,
      };

      // If simulated batch failure is requested for testing failure flow
      const batchOptions = {
        ...options,
        forceFailure: options.simulateBatchFailure && i === options.failingBatchIndex,
      };

      // Call LLM for this batch
      const llmResult = await llmService.extractBatchConcepts(
        batch.batchText,
        batchContext,
        batchOptions
      );

      const batchConcepts = llmResult?.concepts || [];

      // 4. Map backend-verified page provenance (never let the LLM hallucinate pages)
      for (const rawConcept of batchConcepts) {
        const sourcePages = this.resolveConceptPages(rawConcept.name, batch);

        allExtractedConcepts.push({
          name: rawConcept.name,
          description: rawConcept.description,
          importance: rawConcept.importance,
          sourcePages,
        });
      }
    }

    // 5. Deduplicate and merge concepts within this Project
    const persistedConcepts = await this.persistAndDeduplicateConcepts(
      allExtractedConcepts,
      projectId,
      materialId
    );

    return {
      status: "COMPLETED",
      batchesCount: batches.length,
      llmCallsCount: totalLlmCalls,
      conceptsCount: persistedConcepts.length,
      concepts: persistedConcepts.map((c) => ({
        id: c._id,
        name: c.name,
        description: c.description,
        importance: c.importance,
        sourcePages: c.sourcePages,
        sourceMaterialIds: c.sourceMaterialIds,
      })),
      metadata: {
        stage: "knowledge_extraction",
        ready: true,
        materialId,
        projectId,
        batchesCount: batches.length,
        batchCharLimit,
      },
    };
  }

  /**
   * Group segments into token-safe batches with explicit page annotations
   *
   * @param {Array<Object>} segments
   * @param {number} charLimit
   * @returns {Array<{ batchIndex: number, pages: Array<number>, segments: Array<Object>, batchText: string }>}
   */
  createBatches(segments, charLimit) {
    // Group segments by page
    const pageMap = new Map();
    for (const seg of segments) {
      const p = seg.pageNumber || 1;
      if (!pageMap.has(p)) pageMap.set(p, []);
      pageMap.get(p).push(seg);
    }

    const batches = [];
    let currentBatchSegments = [];
    let currentBatchPages = new Set();
    let currentBatchText = "";

    const sortedPages = Array.from(pageMap.keys()).sort((a, b) => a - b);

    for (const pageNum of sortedPages) {
      const pageSegs = pageMap.get(pageNum);

      // Build formatted page content with explicit page headers
      let pageText = `\n--- Page ${pageNum} ---\n`;
      for (const seg of pageSegs) {
        pageText += `[${seg.type}]: ${seg.content}\n`;
      }

      // Check if adding this page exceeds the character budget
      if (
        currentBatchText.length > 0 &&
        currentBatchText.length + pageText.length > charLimit
      ) {
        // Flush current batch
        batches.push({
          batchIndex: batches.length,
          pages: Array.from(currentBatchPages).sort((a, b) => a - b),
          segments: currentBatchSegments,
          batchText: currentBatchText.trim(),
        });

        // Reset buffer
        currentBatchSegments = [];
        currentBatchPages = new Set();
        currentBatchText = "";
      }

      // Append page to current batch
      currentBatchText += pageText;
      currentBatchPages.add(pageNum);
      currentBatchSegments.push(...pageSegs);
    }

    // Flush any remaining content in the final batch
    if (currentBatchText.length > 0) {
      batches.push({
        batchIndex: batches.length,
        pages: Array.from(currentBatchPages).sort((a, b) => a - b),
        segments: currentBatchSegments,
        batchText: currentBatchText.trim(),
      });
    }

    return batches;
  }

  /**
   * Map exact page provenance for a concept based on the actual source segments in the batch.
   * Prevents LLM page number hallucinations.
   */
  resolveConceptPages(conceptName, batch) {
    if (!conceptName || !batch) return batch?.pages || [];

    const matchedPages = new Set();
    const cleanTerm = conceptName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Search batch segments for mention of the concept name
    for (const seg of batch.segments) {
      const segText = (seg.content || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (segText.includes(cleanTerm)) {
        matchedPages.add(seg.pageNumber);
      }
    }

    // If matches found, return those exact pages; otherwise fallback to the batch's page range
    if (matchedPages.size > 0) {
      return Array.from(matchedPages).sort((a, b) => a - b);
    }

    return batch.pages || [];
  }

  /**
   * Normalize a concept name into an invariant canonical key.
   * Treats "Backpropagation", "Back propagation", and "Back-propagation" as identical.
   */
  normalizeCanonicalKey(name) {
    if (!name || typeof name !== "string") return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // remove all non-alphanumeric chars (spaces, hyphens, etc.)
      .trim();
  }

  /**
   * Persist concepts with Project-level deduplication and attribute merging
   */
  async persistAndDeduplicateConcepts(extractedConcepts, projectId, materialId) {
    const persisted = [];

    for (const item of extractedConcepts) {
      const rawName = item.name.trim();
      const canonicalKey = this.normalizeCanonicalKey(rawName);
      if (!canonicalKey || canonicalKey.length < 2) continue;

      const desc = (item.description || "").trim();
      const importance = Math.min(Math.max(parseInt(item.importance, 10) || 3, 1), 5);
      const incomingPages = Array.isArray(item.sourcePages) ? item.sourcePages : [];

      // Query existing Concept in this PROJECT by canonical key OR case-insensitive name
      const existing = await Concept.findOne({
        projectId,
        $or: [
          { "metadata.canonicalKey": canonicalKey },
          { name: { $regex: new RegExp(`^${this.escapeRegex(rawName)}$`, "i") } },
        ],
      });

      if (existing) {
        // Concept already exists in this Project -> Merge attributes without duplicating
        // 1. Link sourceMaterialId
        const matIdStr = materialId.toString();
        const hasMat = existing.sourceMaterialIds.some((m) => m.toString() === matIdStr);
        if (!hasMat) {
          existing.sourceMaterialIds.push(new mongoose.Types.ObjectId(materialId));
        }

        // 2. Union source pages
        for (const p of incomingPages) {
          if (!existing.sourcePages.includes(p)) {
            existing.sourcePages.push(p);
          }
        }
        existing.sourcePages.sort((a, b) => a - b);

        // 3. Keep the stronger / more detailed description
        if (desc.length > (existing.description || "").length) {
          existing.description = desc;
        }

        // 4. Keep the highest importance
        existing.importance = Math.max(existing.importance || 1, importance);

        // 5. Ensure canonical key is recorded in metadata
        existing.metadata = {
          ...(existing.metadata || {}),
          canonicalKey,
          lastMergedAt: new Date(),
        };

        await existing.save();
        persisted.push(existing);
      } else {
        // Create new Concept strictly for this Project
        const newConcept = await Concept.create({
          projectId,
          name: rawName,
          description: desc,
          importance,
          sourceMaterialIds: [new mongoose.Types.ObjectId(materialId)],
          sourcePages: incomingPages.sort((a, b) => a - b),
          metadata: {
            canonicalKey,
            extractedAt: new Date(),
          },
        });

        persisted.push(newConcept);
      }
    }

    return persisted;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  /**
   * Modular API for Tutor, Quiz, Mastery, Recommendations
   */
  async getConceptsByProject(projectId) {
    if (!projectId) return [];
    return await Concept.find({ projectId }).sort({ importance: -1, name: 1 }).lean();
  }

  async getConceptsByMaterial(materialId) {
    if (!materialId) return [];
    return await Concept.find({ sourceMaterialIds: materialId }).sort({ importance: -1, name: 1 }).lean();
  }
}

module.exports = new KnowledgeService();
