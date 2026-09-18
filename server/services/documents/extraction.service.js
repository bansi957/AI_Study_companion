const path = require("path");
const pdfService = require("./pdf.service");
const ocrService = require("./ocr.service");
const ExtractedContent = require("../../models/ExtractedContent");

const uploadDir = path.join(__dirname, "../../uploads");

/**
 * Content & Structure Extraction Service
 *
 * Extracts PDF content page-by-page, preserving exact page provenance (page numbers),
 * detects document structure (heading, paragraph, list, table, image/diagram, unknown),
 * and persists the structured segments to MongoDB with complete project and user isolation.
 */
class ExtractionService {
  /**
   * Orchestrate content & structure extraction for a Material document
   *
   * @param {Object} material - The Material mongoose document
   * @param {Object} context - { userId, projectId, materialId }
   * @returns {Promise<{
   *   totalPages: number,
   *   totalCharacters: number,
   *   totalSegments: number,
   *   stats: Object,
   *   ocrNeeded: boolean,
   *   metadata: Object
   * }>}
   */
  async extract(material, context = {}) {
    if (!material || (!material.filename && !material.fileUrl)) {
      throw new Error("Material or fileUrl not specified for extraction");
    }

    const userId = context.userId || material.userId?.toString();
    const projectId = context.projectId || material.projectId?.toString();
    const materialId = context.materialId || material._id?.toString();

    if (!userId || !projectId || !materialId) {
      throw new Error("Extraction requires userId, projectId, and materialId for isolation");
    }

    // Check if extracted content already exists from a previous attempt of this job
    const existingDoc = await ExtractedContent.findOne({
      materialId,
      projectId,
    }).lean();

    if (existingDoc && Array.isArray(existingDoc.pages) && existingDoc.pages.length > 0) {
      const totalBlocks = existingDoc.pages.reduce(
        (sum, p) => sum + (p.blocks ? p.blocks.length : 0),
        0
      );
      return {
        success: true,
        materialId,
        totalPages: existingDoc.totalPages || existingDoc.pages.length,
        totalCharacters: existingDoc.totalCharacters || 0,
        totalSegments: totalBlocks,
        pages: existingDoc.pages,
        stats: existingDoc.stats || material.structureStats || {},
        ocrNeeded: false,
        metadata: { reused: true },
      };
    }

    // Resolve PDF source: fetch buffer in memory from Cloudinary URL, or use local path fallback
    let pdfSource;
    if (material.fileUrl && (material.fileUrl.startsWith("http://") || material.fileUrl.startsWith("https://"))) {
      const response = await fetch(material.fileUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF from cloud storage (${response.status} ${response.statusText}): ${material.fileUrl}`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      pdfSource = Buffer.from(arrayBuffer);
    } else if (material.filename) {
      pdfSource = path.join(uploadDir, material.filename);
    } else {
      throw new Error("No accessible PDF file source found for material");
    }

    // 1. Parse PDF using PdfService (supports Buffer and file path string)
    const parsedPdf = await pdfService.parsePdf(pdfSource);
    const { totalPages, pages, tables, images, info } = parsedPdf;

    const structuredPages = [];
    const stats = {
      headings: 0,
      paragraphs: 0,
      lists: 0,
      tables: 0,
      images: 0,
      unknown: 0,
      ocrPages: 0,
    };

    let totalCharacters = 0;

    // 2. Process page-by-page to guarantee exact page provenance
    for (const pageObj of pages) {
      const pageNumber = pageObj.page;
      let pageText = pageObj.text || "";
      let isOcr = false;
      let ocrConfidence = null;

      // 2a. Detect pages where normal text extraction returns little/no meaningful text
      if (ocrService.isScannedPage(pageText)) {
        try {
          const pageImage = await pdfService.renderPageImage(pdfSource, pageNumber);
          if (pageImage && pageImage.data) {
            const ocrResult = await ocrService.ocrPage(pageImage.data, pageNumber);
            if (ocrResult && ocrResult.text) {
              pageText = ocrResult.text;
              isOcr = true;
              ocrConfidence = ocrResult.confidence;
              stats.ocrPages++;
            }
          }
        } catch (ocrErr) {
          console.warn(`[ExtractionService] OCR processing warning for page ${pageNumber}: ${ocrErr.message}`);
        }
      }

      totalCharacters += pageText.length;
      const pageBlocks = [];

      // 2b. Check for parser-extracted figures/diagrams on this page (for native digital pages)
      if (!isOcr) {
        const pageImages = images.find((item) => item.page === pageNumber);
        if (pageImages && Array.isArray(pageImages.images)) {
          for (const img of pageImages.images) {
            const imgContent = `[Image: ${img.name || "embedded-image"} (${img.width || "?"}x${img.height || "?"})]`;
            pageBlocks.push({
              type: "image/diagram",
              text: imgContent,
            });
            stats.images++;
          }
        }
      }

      // 2c. Check for parser-extracted tables on this page
      const pageTables = tables.find((item) => item.page === pageNumber);
      if (pageTables && Array.isArray(pageTables.tables)) {
        for (const tbl of pageTables.tables) {
          const tableContent = this.formatTableContent(tbl);
          if (tableContent) {
            pageBlocks.push({
              type: "table",
              text: tableContent,
            });
            stats.tables++;
          }
        }
      }

      // 2d. Segment and classify text on this page (preserves provenance & structure)
      const textSegments = this.segmentPageText(pageText, pageNumber);
      for (const seg of textSegments) {
        const text = String(seg.content || "").trim();
        if (!text) continue;

        pageBlocks.push({
          type: seg.type || "unknown",
          text,
        });

        if (seg.type === "heading") stats.headings++;
        else if (seg.type === "paragraph") stats.paragraphs++;
        else if (seg.type === "list") stats.lists++;
        else if (seg.type === "table") stats.tables++;
        else if (seg.type === "image/diagram") stats.images++;
        else stats.unknown++;
      }

      structuredPages.push({
        page: pageNumber,
        blocks: pageBlocks,
      });
    }

    // 3. Upsert exactly ONE ExtractedContent document for this material
    const extractedDoc = await ExtractedContent.findOneAndUpdate(
      { materialId },
      {
        materialId,
        projectId,
        userId,
        pages: structuredPages,
        totalPages: totalPages || structuredPages.length,
        totalCharacters,
        stats,
        metadata: info || {},
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const ocrNeeded = totalPages > 0 && totalCharacters === 0;

    return {
      success: true,
      materialId,
      totalPages: extractedDoc.totalPages,
      totalCharacters: extractedDoc.totalCharacters,
      totalSegments: structuredPages.reduce((acc, p) => acc + p.blocks.length, 0),
      pages: extractedDoc.pages,
      stats: extractedDoc.stats,
      ocrNeeded,
      metadata: info || {},
    };
  }

  /**
   * Segment and classify page text into discrete structural units.
   * Preserves exact page number for every segment.
   * Does NOT invent structure when ambiguous — falls back to 'unknown'.
   *
   * @param {string} pageText
   * @param {number} pageNumber
   * @returns {Array<{ type: string, content: string, metadata: Object }>}
   */
  segmentPageText(pageText, pageNumber) {
    if (!pageText || !pageText.trim()) return [];

    // Split page text into candidate blocks by double-newlines
    const rawBlocks = pageText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const result = [];

    for (const block of rawBlocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      // 1. Check if the block is a markdown / text table
      if (this.isMarkdownTable(lines)) {
        result.push({
          type: "table",
          content: lines.join("\n"),
          metadata: { rowCount: lines.length },
        });
        continue;
      }

      // 2. Check if the entire block is a contiguous list
      if (this.isListBlock(lines)) {
        const listType = this.getListType(lines[0]);
        result.push({
          type: "list",
          content: lines.join("\n"),
          metadata: { listType, itemCount: lines.length, items: lines },
        });
        continue;
      }

      // 3. Mixed block: parse line by line to separate headings, lists, and prose
      let currentBuffer = [];
      let currentMode = null; // 'text' | 'list' | 'table'

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Explicit heading check on single line
        const headingMatch = this.detectHeading(line);
        if (headingMatch) {
          // Flush pending buffer
          if (currentBuffer.length > 0) {
            this.flushBuffer(currentBuffer, currentMode, result);
            currentBuffer = [];
            currentMode = null;
          }

          result.push({
            type: "heading",
            content: headingMatch.content,
            metadata: headingMatch.metadata,
          });
          continue;
        }

        // List item check
        if (this.isListItem(line)) {
          if (currentBuffer.length > 0 && currentMode !== "list") {
            this.flushBuffer(currentBuffer, currentMode, result);
            currentBuffer = [];
          }
          currentMode = "list";
          currentBuffer.push(line);
          continue;
        }

        // Table row check
        if (line.startsWith("|") && line.endsWith("|")) {
          if (currentBuffer.length > 0 && currentMode !== "table") {
            this.flushBuffer(currentBuffer, currentMode, result);
            currentBuffer = [];
          }
          currentMode = "table";
          currentBuffer.push(line);
          continue;
        }

        // Standard text lines
        if (currentBuffer.length > 0 && (currentMode === "list" || currentMode === "table")) {
          this.flushBuffer(currentBuffer, currentMode, result);
          currentBuffer = [];
        }
        currentMode = "text";
        currentBuffer.push(line);
      }

      // Flush remaining buffer
      if (currentBuffer.length > 0) {
        this.flushBuffer(currentBuffer, currentMode, result);
      }
    }

    return result;
  }

  /**
   * Flush accumulated lines to result with appropriate classification
   */
  flushBuffer(lines, mode, result) {
    if (!lines || lines.length === 0) return;
    const joined = lines.join("\n").trim();
    if (!joined) return;

    if (mode === "list") {
      result.push({
        type: "list",
        content: joined,
        metadata: {
          listType: this.getListType(lines[0]),
          itemCount: lines.length,
          items: lines,
        },
      });
      return;
    }

    if (mode === "table") {
      result.push({
        type: "table",
        content: joined,
        metadata: { rowCount: lines.length },
      });
      return;
    }

    // Classify prose buffer: paragraph vs unknown
    const classified = this.classifyTextBlock(joined);
    result.push({
      type: classified.type,
      content: joined,
      metadata: classified.metadata,
    });
  }

  /**
   * Detect if a line is a heading
   * @param {string} line
   * @returns {Object|null}
   */
  detectHeading(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) return null;

    // Markdown heading: e.g. "# Heading 1"
    const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return {
        content: mdMatch[2].trim(),
        metadata: { level: mdMatch[1].length },
      };
    }

    // Explicit section header: e.g. "Chapter 14: Algorithms", "Section 2.1 Overview"
    const sectionMatch = trimmed.match(/^(Chapter|Section|Module|Unit|Part|Appendix)\s+([0-9A-Z]+)[:\.\-\s]+(.+)$/i);
    if (sectionMatch) {
      return {
        content: trimmed,
        metadata: { level: 1, sectionType: sectionMatch[1], sectionNumber: sectionMatch[2] },
      };
    }

    // Numbered outline header: e.g. "1. Introduction", "2.3.1 Data Structures"
    const outlineMatch = trimmed.match(/^([0-9]+(\.[0-9]+)*)\s+([A-Z][A-Za-z0-9\s,\-\:]{2,80})$/);
    if (outlineMatch) {
      const depth = outlineMatch[1].split(".").length;
      return {
        content: trimmed,
        metadata: { level: Math.min(depth + 1, 6), outlineNumber: outlineMatch[1] },
      };
    }

    // Standalone title: short line (<= 75 chars), uppercase or title case, no terminating punctuation
    if (
      trimmed.length >= 3 &&
      trimmed.length <= 75 &&
      !/[.!?,;]$/.test(trimmed)
    ) {
      const isUpper = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
      const isTitle = /^[A-Z][a-z0-9]+(\s+[A-Z0-9][a-z0-9]*)*$/.test(trimmed);
      if (isUpper || isTitle) {
        return {
          content: trimmed,
          metadata: { level: 2 },
        };
      }
    }

    return null;
  }

  /**
   * Check if a line is a list item
   * @param {string} line
   * @returns {boolean}
   */
  isListItem(line) {
    const trimmed = line.trim();
    // Bullet item
    if (/^[•\*\-\–\—◦▪]\s+/.test(trimmed)) return true;
    // Numbered / lettered item: "1. ", "1) ", "(1) ", "a. "
    if (/^(\d+|[a-zA-Z])[\.\)]\s+/.test(trimmed)) return true;
    if (/^\((\d+|[a-zA-Z])\)\s+/.test(trimmed)) return true;
    return false;
  }

  /**
   * Determine list type: 'bullet' or 'numbered'
   */
  getListType(firstLine) {
    if (!firstLine) return "bullet";
    return /^[•\*\-\–\—◦▪]/.test(firstLine.trim()) ? "bullet" : "numbered";
  }

  /**
   * Check if an array of lines forms a contiguous list
   */
  isListBlock(lines) {
    if (!lines || lines.length === 0) return false;
    return lines.every((l) => this.isListItem(l));
  }

  /**
   * Check if lines represent a markdown-style table
   */
  isMarkdownTable(lines) {
    if (!lines || lines.length === 0) return false;
    return lines.every((l) => l.startsWith("|") && l.endsWith("|"));
  }

  /**
   * Classify standard text block: paragraph vs unknown
   * Avoids guessing when parser cannot determine structure.
   */
  classifyTextBlock(text) {
    const trimmed = text.trim();

    // Paragraph: multi-word prose with sentence punctuation or substantial length
    const words = trimmed.split(/\s+/);
    const hasPunctuation = /[.!?]/.test(trimmed);

    if (words.length >= 5 && (hasPunctuation || trimmed.length > 50)) {
      return { type: "paragraph", metadata: { wordCount: words.length } };
    }

    // If text is short, fragmented, non-sentential, or arbitrary symbols without clear semantics
    return { type: "unknown", metadata: {} };
  }

  /**
   * Helper to format table rows into a readable string
   */
  formatTableContent(tbl) {
    if (!tbl) return "";
    if (tbl.text) return tbl.text;
    if (Array.isArray(tbl.rows) && tbl.rows.length > 0) {
      return tbl.rows
        .map((row) => (Array.isArray(row) ? row.join(" | ") : String(row)))
        .join("\n");
    }
    return "";
  }

  /**
   * Consolidate legacy fragmented ExtractedContent records into 1 document per material.
   * Cleans up duplicate/fragmented records and ensures unique indexing.
   */
  async consolidateExtractedContent() {
    const distinctMaterials = await ExtractedContent.distinct("materialId");
    let consolidatedCount = 0;

    for (const matId of distinctMaterials) {
      const records = await ExtractedContent.find({ materialId: matId })
        .sort({ pageNumber: 1, segmentIndex: 1, createdAt: 1 })
        .lean();

      if (!records || records.length === 0) continue;

      // Check if already in the new format (1 doc with pages array)
      if (records.length === 1 && Array.isArray(records[0].pages) && records[0].pages.length > 0) {
        continue;
      }

      // Group blocks by page
      const pageMap = new Map();
      const stats = {
        headings: 0,
        paragraphs: 0,
        lists: 0,
        tables: 0,
        images: 0,
        unknown: 0,
        ocrPages: 0,
      };
      let totalCharacters = 0;

      for (const rec of records) {
        if (Array.isArray(rec.pages)) {
          for (const p of rec.pages) {
            const pNum = p.page || 1;
            if (!pageMap.has(pNum)) pageMap.set(pNum, []);
            for (const b of p.blocks || []) {
              const text = String(b.text || "").trim();
              if (!text) continue;
              pageMap.get(pNum).push({ type: b.type || "unknown", text });
              totalCharacters += text.length;
            }
          }
        } else {
          const pNum = rec.pageNumber || 1;
          const text = String(rec.content || rec.text || "").trim();
          if (!text) continue;
          if (!pageMap.has(pNum)) pageMap.set(pNum, []);
          const type = rec.type || "unknown";
          pageMap.get(pNum).push({ type, text });
          totalCharacters += text.length;

          if (type === "heading") stats.headings++;
          else if (type === "paragraph") stats.paragraphs++;
          else if (type === "list") stats.lists++;
          else if (type === "table") stats.tables++;
          else if (type === "image/diagram") stats.images++;
          else stats.unknown++;
        }
      }

      const pages = Array.from(pageMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([page, blocks]) => ({ page, blocks }));

      const primary = records[0];

      // Delete all fragmented records for this material
      await ExtractedContent.deleteMany({ materialId: matId });

      // Create the single consolidated document
      await ExtractedContent.create({
        materialId: matId,
        projectId: primary.projectId,
        userId: primary.userId,
        pages,
        totalPages: pages.length,
        totalCharacters,
        stats,
        metadata: primary.metadata || {},
      });

      consolidatedCount++;
    }

    // Ensure indexes (specifically unique index on materialId)
    await ExtractedContent.syncIndexes().catch((err) => {
      console.warn(`[ExtractionService] Warning syncing indexes: ${err.message}`);
    });

    return { consolidatedCount, totalMaterials: distinctMaterials.length };
  }
}

module.exports = new ExtractionService();
