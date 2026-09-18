const Chunk = require("../../models/Chunk");
const ExtractedContent = require("../../models/ExtractedContent");

/**
 * Semantic Chunking Service
 *
 * Slices structured, page-aware extracted content into retrieval-sized chunks
 * based on natural boundaries (paragraphs, headings, lists, sentence splits),
 * preserving exact source-page provenance without LLM involvement or embeddings.
 */
class ChunkingService {
  constructor() {
    this.defaultTargetSize = 1000; // characters (~200-250 words)
    this.defaultOverlap = 150; // characters (~30-40 words)
    this.defaultMaxSize = 1500; // hard limit before boundary split
  }

  /**
   * Split a large string into sentence-level units
   *
   * @param {string} text
   * @returns {string[]}
   */
  splitIntoSentences(text) {
    if (!text || typeof text !== "string") return [];
    // Split on sentence-ending punctuation followed by whitespace and a capital letter or digit
    const parts = text.split(/(?<=[.?!])\s+(?=[A-Z0-9])/);
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Deconstruct raw extracted content segments into normalized processing units
   *
   * @param {Array<Object>} segments - ExtractedContent documents
   * @param {number} maxSize - Maximum character length per unit
   * @returns {Array<{ page: number, text: string, type: string, isHeading: boolean }>}
   */
  prepareUnits(segments, maxSize) {
    const units = [];

    for (const segment of segments) {
      const page = segment.pageNumber || 1;
      const type = segment.type || "paragraph";
      const rawText = String(segment.content || segment.text || "").trim();
      const isHeading = type === "heading";

      if (!rawText) continue;

      // If segment is smaller than or equal to maxSize, keep as single unit
      if (rawText.length <= maxSize) {
        units.push({
          page,
          text: rawText,
          type,
          isHeading,
        });
      } else {
        // Large segment: divide into sentences
        const sentences = this.splitIntoSentences(rawText);
        if (sentences.length <= 1) {
          // Fallback if no sentence punctuation: slice by maxSize with word boundaries
          let start = 0;
          while (start < rawText.length) {
            let end = start + maxSize;
            if (end < rawText.length) {
              const lastSpace = rawText.lastIndexOf(" ", end);
              if (lastSpace > start + maxSize * 0.5) {
                end = lastSpace;
              }
            }
            const slice = rawText.slice(start, end).trim();
            if (slice) {
              units.push({ page, text: slice, type, isHeading: false });
            }
            start = end;
          }
        } else {
          // Accumulate sentences into sub-units within maxSize
          let tempText = "";
          for (const sentence of sentences) {
            if (tempText && tempText.length + sentence.length + 1 > maxSize) {
              units.push({ page, text: tempText.trim(), type, isHeading: false });
              tempText = sentence;
            } else {
              tempText = tempText ? `${tempText} ${sentence}` : sentence;
            }
          }
          if (tempText) {
            units.push({ page, text: tempText.trim(), type, isHeading: false });
          }
        }
      }
    }

    return units;
  }

  /**
   * Finalize a chunk from accumulated units, grouping per-page source segments
   */
  createChunkObject(currentUnits, chunkIndex, context) {
    const { userId, projectId, materialId } = context;

    // Group text per page to preserve exact source segments
    const pageMap = new Map();
    for (const unit of currentUnits) {
      if (!pageMap.has(unit.page)) {
        pageMap.set(unit.page, []);
      }
      pageMap.get(unit.page).push(unit);
    }

    const pages = Array.from(pageMap.keys()).sort((a, b) => a - b);
    const isMultiPage = pages.length > 1;
    const fullText = currentUnits.map((u) => u.text).join("\n\n");

    const chunkObj = {
      userId,
      projectId,
      materialId,
      text: fullText,
      page: pages[0] || 1,
      chunkIndex,
      embedding: null,
      metadata: {
        charCount: fullText.length,
        unitsCount: currentUnits.length,
        isMultiPage,
      },
    };

    // Only store pages and sourceSegments when a chunk genuinely spans multiple pages
    if (isMultiPage) {
      const sourceSegments = [];
      for (const page of pages) {
        const pageUnits = pageMap.get(page);
        const combinedText = pageUnits.map((u) => u.text).join("\n\n");
        const primaryType = pageUnits[0]?.type || "paragraph";

        sourceSegments.push({
          page,
          text: combinedText,
          segmentType: primaryType,
        });
      }

      chunkObj.pages = pages;
      chunkObj.sourceSegments = sourceSegments;
    }

    return chunkObj;
  }

  /**
   * Generate chunks from structured page-aware content
   *
   * @param {Array<Object>} segments - Array of ExtractedContent records
   * @param {Object} context - { userId, projectId, materialId }
   * @param {Object} options - { targetSize, overlap, maxSize }
   * @returns {Array<Object>} Generated chunk objects
   */
  generateChunks(segments, context, options = {}) {
    if (!segments || segments.length === 0) return [];

    const targetSize =
      options.targetSize ||
      parseInt(process.env.CHUNK_TARGET_SIZE, 10) ||
      this.defaultTargetSize;

    const overlap =
      options.overlap ||
      parseInt(process.env.CHUNK_OVERLAP, 10) ||
      this.defaultOverlap;

    const maxSize =
      options.maxSize ||
      parseInt(process.env.CHUNK_MAX_SIZE, 10) ||
      this.defaultMaxSize;

    const units = this.prepareUnits(segments, maxSize);
    if (units.length === 0) return [];

    const chunks = [];
    let currentUnits = [];
    let currentLength = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitLen = unit.text.length;

      // 1. Natural Boundary: If unit is a major heading and we already accumulated decent content
      if (unit.isHeading && currentLength >= targetSize * 0.4 && currentUnits.length > 0) {
        chunks.push(this.createChunkObject(currentUnits, chunks.length, context));

        // Overlap: Carry over trailing units if within overlap budget
        currentUnits = this.computeOverlapUnits(currentUnits, overlap);
        currentLength = currentUnits.reduce((acc, u) => acc + u.text.length + 2, 0);
      }

      // 2. Capacity Boundary: If adding this unit exceeds target size / maxSize
      else if (
        (currentLength + unitLen > targetSize && currentUnits.length > 0) ||
        currentLength + unitLen > maxSize
      ) {
        chunks.push(this.createChunkObject(currentUnits, chunks.length, context));

        // Overlap: Keep trailing units up to overlap character budget
        currentUnits = this.computeOverlapUnits(currentUnits, overlap);
        currentLength = currentUnits.reduce((acc, u) => acc + u.text.length + 2, 0);
      }

      // Append unit to current chunk
      currentUnits.push(unit);
      currentLength += unitLen + 2; // account for newline separators
    }

    // Append any remaining units as the final chunk
    if (currentUnits.length > 0) {
      chunks.push(this.createChunkObject(currentUnits, chunks.length, context));
    }

    return chunks;
  }

  /**
   * Select trailing units from current chunk to provide smooth semantic overlap
   */
  computeOverlapUnits(units, maxOverlap) {
    if (!units || units.length === 0 || maxOverlap <= 0) return [];

    const overlapUnits = [];
    let accumulated = 0;

    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      // Do not overlap starting directly on a heading
      if (u.isHeading && overlapUnits.length > 0) break;

      if (accumulated + u.text.length <= maxOverlap) {
        overlapUnits.unshift(u);
        accumulated += u.text.length + 2;
      } else {
        break;
      }
    }

    return overlapUnits;
  }

  /**
   * Main chunking execution method
   * Fetches extracted content for material, chunks it, and idempotently saves to Chunk collection.
   *
   * @param {Object} material - Material document or plain object
   * @param {Object} context - { userId, projectId, materialId }
   * @param {Object} options - Sizing and boundary options
   * @returns {Promise<{ status: string, chunksCount: number, chunks: Array<Object>, metadata: Object }>}
   */
  async chunk(material, context, options = {}) {
    const materialId = context.materialId || material?._id;
    const projectId = context.projectId || material?.projectId;
    const userId = context.userId || material?.userId;

    if (!materialId || !projectId || !userId) {
      throw new Error("Missing required context fields: materialId, projectId, userId");
    }

    // 1. Fetch structured page-aware content from the single ExtractedContent document
    const doc = await ExtractedContent.findOne({
      materialId,
      projectId,
      userId,
    }).lean();

    const segments = [];
    if (doc && Array.isArray(doc.pages)) {
      for (const p of doc.pages) {
        const pageNum = p.page || 1;
        for (const b of p.blocks || []) {
          const text = String(b.text || b.content || "").trim();
          if (!text) continue;
          segments.push({
            pageNumber: pageNum,
            type: b.type || "paragraph",
            content: text,
          });
        }
      }
    }

    if (!segments || segments.length === 0) {
      return {
        status: "COMPLETED",
        chunksCount: 0,
        chunks: [],
        metadata: {
          stage: "semantic_chunking",
          materialId,
          projectId,
          note: "No extracted content available for chunking",
        },
      };
    }

    // 2. Generate boundary-aware chunks
    const chunkObjects = this.generateChunks(segments, { userId, projectId, materialId }, options);

    // 3. Idempotent storage: Clear any pre-existing chunks for this material before inserting
    await Chunk.deleteMany({ materialId });

    let insertedChunks = [];
    if (chunkObjects.length > 0) {
      insertedChunks = await Chunk.insertMany(chunkObjects);
    }

    // Compute chunk statistics
    const totalChars = chunkObjects.reduce((acc, c) => acc + c.text.length, 0);
    const avgChunkSize = chunkObjects.length > 0 ? Math.round(totalChars / chunkObjects.length) : 0;
    const multiPageCount = chunkObjects.filter((c) => (c.pages?.length || 0) > 1).length;

    return {
      status: "COMPLETED",
      chunksCount: insertedChunks.length,
      chunks: insertedChunks,
      metadata: {
        stage: "semantic_chunking",
        materialId,
        projectId,
        avgChunkSize,
        multiPageCount,
        targetSize: options.targetSize || this.defaultTargetSize,
        overlap: options.overlap || this.defaultOverlap,
      },
    };
  }
}

module.exports = new ChunkingService();
