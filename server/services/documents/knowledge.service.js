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

    // 1. Fetch structured page-aware content from the single ExtractedContent document
    const doc = await ExtractedContent.findOne({
      materialId,
      projectId,
      ...(userId ? { userId } : {}),
    }).lean();

    // 2. Filter content: keep headings, subheadings, definitions, key bullets, captions, and exact pages
    const segments = this.filterContentForConcepts(doc);

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
          note: "No segments available for knowledge extraction after filtration",
        },
      };
    }

    // 3. Token & Context Control: Target ~1500–2500 input tokens per Qwen request
    // (~5500–7800 chars batch text). Never create ~5000-token requests.
    const totalChars = segments.reduce((sum, s) => sum + s.content.length, 0);
    const preferSingleCall = totalChars <= 7500;
    const batchCharLimit = preferSingleCall
      ? 8000
      : (options.batchCharLimit || 7500);

    const batches = this.createBatches(segments, batchCharLimit);

    const allExtractedConcepts = [];
    let totalLlmCalls = 0;

    // 4. Process batches sequentially (coordinated globally through Redis rate limiter at >= 2.2s gap)
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

      // Call Qwen for this batch
      const llmResult = await llmService.extractBatchConcepts(
        batch.batchText,
        batchContext,
        batchOptions
      );

      const batchConcepts = llmResult?.concepts || [];

      // Map backend-verified page provenance (never let the LLM hallucinate pages)
      for (const rawConcept of batchConcepts) {
        const sourcePages = this.resolveConceptPages(rawConcept.name, batch);

        allExtractedConcepts.push({
          name: rawConcept.name,
          description: rawConcept.description,
          parentConcept: rawConcept.parentConcept || null,
          importance: rawConcept.importance,
          sourcePages,
        });
      }
    }

    // 5. Deduplicate and merge concepts into ONE Concept document for this Material
    const persistedConcepts = await this.persistAndDeduplicateConcepts(
      allExtractedConcepts,
      projectId,
      materialId,
      userId
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
        parentConcept: c.parentConcept || null,
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
   * Filter concept input from ExtractedContent:
   * Aggressively filter raw document content to extract only high-level curriculum concepts.
   *
   * KEEP:
   * - chapter titles
   * - major section headings
   * - important subheadings only
   * - small amount of nearby text explaining the topic (1-2 sentences)
   * - major definitions only when necessary to identify the concept
   * - exact source pages
   *
   * REMOVE:
   * - minor subtopics (e.g. 1.2.3.4, "Note:", "Example:", exercises)
   * - repeated headings/subheadings across pages (running headers)
   * - duplicate concepts
   * - detailed explanations & long paragraphs
   * - examples & case studies
   * - formulas/math derivations unless required to identify the concept
   * - headers/footers, page numbers, TOC dot leaders, OCR noise, boilerplate
   *
   * @param {Object} doc - ExtractedContent document
   * @returns {Array<{ pageNumber: number, type: string, content: string }>}
   */
  filterContentForConcepts(doc) {
    if (!doc || !Array.isArray(doc.pages)) return [];

    const filteredSegments = [];
    const seenHeadingKeys = new Set();
    const seenHeadingStems = new Set();
    const seenContentKeys = new Set();

    // Helper: Invariant normalization for deduplication
    const normalizeKey = (str = "") => {
      return str
        .normalize("NFKD")
        .toLowerCase()
        .replace(/^[•▪\-\*\d\.\)\s]+/, "") // strip leading bullets/numbering
        .replace(/[^a-z0-9]/g, "") // alphanumeric only
        .trim();
    };

    // Helper: Stemmed key for deduplicating very similar headings and topics
    const getStemmedHeadingKey = (str = "") => {
      return str
        .normalize("NFKD")
        .toLowerCase()
        .replace(/^(chapter|section|module|unit|part)\s+\d+[:.\-\s]*/i, "")
        .replace(/\b(introduction|overview|fundamentals?|basics?|models?|principles?|techniques?|methods?|concepts?|theory|an?|the|of|and|in|to|for)\b/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    };

    // Helper: Normalize whitespace and OCR spacing
    const cleanText = (str = "") => {
      return str
        .normalize("NFKD")
        .replace(/[ \t]+/g, " ")
        .replace(/\r?\n+/g, " ")
        .trim();
    };

    // Check for boilerplate, headers, footers, navigation, or OCR noise
    const isBoilerplateOrNoise = (text) => {
      const trimmed = text.trim();
      if (!trimmed) return true;

      // 1. Standalone page numbers or pagination markers
      if (/^(page\s*\d+(\s*of\s*\d+)?|\d+\s*\/\s*\d+|\d+)$/i.test(trimmed)) return true;

      // 2. Table of contents / navigation / index with dot leaders
      if (/\.{4,}\s*\d+$/i.test(trimmed)) return true;
      if (/^(table of contents|contents|brief contents|list of figures|list of tables|index|preface|acknowledgments?)$/i.test(trimmed)) return true;

      // 3. Copyright / publisher / licensing / URL boilerplate
      if (/copyright|\ball rights reserved\b|isbn\s*[\d-]|printed in|published by|doi:\s*10\.\d+|https?:\/\/[^\s]+/i.test(trimmed)) return true;

      // 4. Low-information boilerplate commands
      if (/^(click here|turn to page|see next page|all rights reserved|for more information visit|continued on next page)/i.test(trimmed)) return true;

      // 5. OCR gibberish / low alphanumeric ratio
      const alphanumeric = trimmed.replace(/[^a-zA-Z0-9]/g, "");
      if (trimmed.length > 6 && alphanumeric.length / trimmed.length < 0.45) return true;

      // 6. Repeated non-alphanumeric separator lines (e.g. "----", "====")
      if (/^[-=_*~#]{3,}$/.test(trimmed)) return true;

      // 7. Very short single token fragments (< 3 chars) unless acronym
      if (trimmed.length < 3 && !/^[A-Z]{2}$/.test(trimmed)) return true;

      return false;
    };

    // Minor subtopic check: filter out minor headings, questions, exercises, tips, etc.
    const isMinorSubtopic = (text) => {
      const trimmed = text.trim();
      // Deeply nested subtopics (e.g., 1.2.3, 1.2.3.4, A.1.2, 3.4.1)
      if (/^(\d+\.\d+\.\d+|[A-Z]\.\d+\.\d+)/.test(trimmed)) return true;
      // Headings phrased as minor questions or interrogatives
      if (/^(what|how|why|when|where|which|can|does|is|are|should)\b.+\?$/i.test(trimmed)) return true;
      if (/^(what is|how do|how to|why do|why should|when to)\b/i.test(trimmed)) return true;
      // Non-conceptual headings, organizational markers, activities, reviews
      if (/^(example|exercise|problem|practice|review question|self-assessment|case study|case \d+|solution|summary|recap|notes?|remarks?|hints?|tip|further reading|references|bibliography|appendix|prerequisites|learning objectives?|key takeaway|step \d+|part [a-z]\b|introduction|overview|background|discussion|activities|activity|lab\b|project\b)/i.test(trimmed)) return true;
      // Excessive length for a major conceptual heading
      if (trimmed.length > 70) return true;
      return false;
    };

    // Example / exercise text check
    const isExampleText = (text) => {
      return /^(for example|for instance|as an example|in this example|consider the following example|e\.g\.|case study|take for example|let us consider)\b/i.test(text);
    };

    // Pure formula or math equation check (remove unless defining the concept)
    const isPureFormulaOrEquation = (text) => {
      if (/\$\$.*?\$\$.*?\$\$/i.test(text) || /\$.*?\$/.test(text) || /\\begin\{(?:equation|align|gather|matrix|bmatrix)\}/i.test(text)) return true;
      // High density of math symbols (> 25%) without a definitional copula
      const mathChars = text.replace(/[^=+\-*\/^_\\]/g, "");
      if (text.length > 15 && mathChars.length / text.length > 0.25) {
        if (!/\b(is defined as|refers to|represents)\b/i.test(text)) {
          return true;
        }
      }
      return false;
    };

    // Major definition indicators (only keep overarching foundational definitions, avoid glossary bloat)
    let defsOnCurrentPage = 0;
    let lastDefPage = null;
    const isMajorDefinition = (text, pageNum) => {
      if (lastDefPage !== pageNum) {
        defsOnCurrentPage = 0;
        lastDefPage = pageNum;
      }
      if (defsOnCurrentPage >= 2) return false; // Cap definitions to 2 per page

      const unbulleted = text.replace(/^[•▪\-\*\d\.\)\s]+/, "").trim();
      const isDef = (
        /\b(is defined as|refers to|is known as|can be defined as|defined by)\b/i.test(unbulleted) ||
        /\bis an? (?:[a-z0-9\-]+\s+){0,3}(?:algorithm|technique|method|framework|model|process|system|architecture)\b/i.test(unbulleted) ||
        /^[A-Z][A-Za-z0-9\s-]{2,35}\s*[:\-]\s+[A-Z]/.test(unbulleted)
      );

      if (isDef) {
        defsOnCurrentPage++;
      }
      return isDef;
    };

    for (const pageObj of doc.pages) {
      const pageNum = pageObj.page || 1;
      const blocks = pageObj.blocks || [];

      for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
        const b = blocks[bIdx];
        const rawText = cleanText(b.text || b.content || "");
        const rawType = (b.type || "paragraph").toLowerCase();

        if (!rawText || isBoilerplateOrNoise(rawText)) continue;
        if (isPureFormulaOrEquation(rawText)) continue;

        // Caption handling for educational figures/tables
        const isCap = rawType === "caption" || /^(figure|table)\s+\d+[:.]/i.test(rawText);
        if (isCap) {
          if (rawText.length > 150) continue;
          filteredSegments.push({
            pageNumber: pageNum,
            type: "caption",
            content: rawText,
          });
          continue;
        }

        // Skip non-caption image/diagram or raw table blocks
        if (rawType === "image/diagram" || rawType === "table") {
          continue;
        }

        const isChapter = /^(chapter\s+\d+|module\s+\d+|unit\s+\d+|part\s+[ivx\d]+)\b/i.test(rawText) || /^\d+\.\s+[A-Z]/.test(rawText);
        const isHeadingType = rawType === "heading" || rawType === "subheading" || rawType === "title";

        if (isHeadingType) {
          // Exclude minor subtopics
          if (isMinorSubtopic(rawText)) continue;

          // Deduplicate running headers across pages
          const headingKey = normalizeKey(rawText);
          if (!headingKey || seenHeadingKeys.has(headingKey)) continue;

          // Deduplicate similar headings via stemmed key
          if (!isChapter) {
            const stem = getStemmedHeadingKey(rawText);
            if (stem && stem.length >= 5 && seenHeadingStems.has(stem)) {
              continue; // Drop redundant variant of already seen topic
            }
            if (stem && stem.length >= 5) {
              seenHeadingStems.add(stem);
            }
          }

          seenHeadingKeys.add(headingKey);

          filteredSegments.push({
            pageNumber: pageNum,
            type: isChapter ? "chapter_title" : "major_heading",
            content: rawText,
          });
          continue;
        }

        // Paragraph handling:
        // Keep ONLY a single short topic-defining sentence (<= 120 chars) right after a major heading,
        // or an essential definition (<= 130 chars). Never send full paragraphs.
        const prevBlock = bIdx > 0 ? blocks[bIdx - 1] : null;
        const prevWasHeading = prevBlock && (prevBlock.type === "heading" || prevBlock.type === "subheading" || prevBlock.type === "title");

        const isDef = isMajorDefinition(rawText, pageNum);

        if (prevWasHeading && !isDef) {
          if (isExampleText(rawText)) continue;

          // Keep strictly the single first sentence explaining the topic (short phrase)
          const firstSentence = (rawText.match(/[^.!?]+[.!?]+/g) || [rawText])[0] || "";
          let topicIntro = firstSentence.trim();
          if (!topicIntro || isExampleText(topicIntro)) continue;
          if (topicIntro.length > 130) {
            topicIntro = `${topicIntro.slice(0, 127)}...`;
          }

          const contentKey = normalizeKey(topicIntro);
          if (!contentKey || seenContentKeys.has(contentKey)) continue;
          seenContentKeys.add(contentKey);

          filteredSegments.push({
            pageNumber: pageNum,
            type: "topic_context",
            content: topicIntro,
          });
        } else if (isDef) {
          if (isExampleText(rawText)) continue;

          // Keep concise single definition sentence
          const firstSentence = (rawText.match(/[^.!?]+[.!?]+/g) || [rawText])[0] || "";
          let defIntro = firstSentence.trim();
          if (!defIntro || isExampleText(defIntro)) continue;
          if (defIntro.length > 140) {
            defIntro = `${defIntro.slice(0, 137)}...`;
          }

          const contentKey = normalizeKey(defIntro);
          if (!contentKey || seenContentKeys.has(contentKey)) continue;
          seenContentKeys.add(contentKey);

          filteredSegments.push({
            pageNumber: pageNum,
            type: "definition",
            content: defIntro,
          });
        } else if (rawType === "list" || rawType === "list_item" || rawType === "bullet") {
          // Keep bullet list items ONLY if they are key definitions
          if (/^[•\*\-\–\—◦▪0-9.\)\s]*[A-Z][A-Za-z0-9\s\-]{2,35}\s*[:\-]\s+[A-Z]/.test(rawText) || isMajorDefinition(rawText, pageNum)) {
            const firstSentence = (rawText.match(/[^.!?]+[.!?]+/g) || [rawText])[0] || "";
            let bulletText = firstSentence.trim();
            if (bulletText.length > 130) bulletText = `${bulletText.slice(0, 127)}...`;

            const contentKey = normalizeKey(bulletText);
            if (!contentKey || seenContentKeys.has(contentKey)) continue;
            seenContentKeys.add(contentKey);

            filteredSegments.push({
              pageNumber: pageNum,
              type: "bullet",
              content: bulletText,
            });
          }
        }
      }
    }

    // Safety Fallback: If strict filtering yielded fewer than 3 segments, fallback to cleanest non-boilerplate blocks
    if (filteredSegments.length < 3) {
      for (const pageObj of doc.pages) {
        const pageNum = pageObj.page || 1;
        for (const b of pageObj.blocks || []) {
          const rawText = cleanText(b.text || b.content || "");
          if (!rawText || isBoilerplateOrNoise(rawText) || isPureFormulaOrEquation(rawText)) continue;
          const key = normalizeKey(rawText);
          if (!key || seenContentKeys.has(key)) continue;
          seenContentKeys.add(key);
          filteredSegments.push({
            pageNumber: pageNum,
            type: b.type || "paragraph",
            content: rawText.length > 130 ? `${rawText.slice(0, 127)}...` : rawText,
          });
        }
      }
    }

    return filteredSegments;
  }

  /**
   * Group segments into token-safe batches with explicit chapter/major section boundaries.
   * Target: ~1500–2200 input tokens per call (~5500–7800 chars).
   * Never creates ~5000-token requests. Sized to use 1–4 calls for large PDFs.
   *
   * @param {Array<Object>} segments
   * @param {number} charLimit
   * @returns {Array<{ batchIndex: number, pages: Array<number>, segments: Array<Object>, batchText: string }>}
   */
  createBatches(segments, charLimit = 7500) {
    if (!segments || segments.length === 0) return [];

    const effectiveLimit = Math.min(charLimit || 7500, 8000);
    const totalChars = segments.reduce((sum, s) => sum + s.content.length + 30, 0);

    const chapterCount = segments.filter((s) => s.type === "chapter_title").length;
    const pages = segments.map((s) => s.pageNumber || 1);
    const pageSpan = Math.max(...pages) - Math.min(...pages);

    // Prefer ONE Qwen call when the document is small/moderate (pageSpan < 35, <= 2 chapters) and fits within budget
    if (totalChars <= effectiveLimit && pageSpan < 35 && chapterCount < 3) {
      const pageSet = new Set();
      let fullText = "";
      let lastPage = null;

      for (const seg of segments) {
        const p = seg.pageNumber || 1;
        pageSet.add(p);
        if (lastPage !== p) {
          fullText += `\n--- Page ${p} ---\n`;
          lastPage = p;
        }
        fullText += `[${seg.type}]: ${seg.content}\n`;
      }

      return [
        {
          batchIndex: 0,
          pages: Array.from(pageSet).sort((a, b) => a - b),
          segments,
          batchText: fullText.trim(),
        },
      ];
    }

    // Split along chapter/major section boundaries aiming strictly for 1–4 calls
    let targetNumBatches = 3;
    if (chapterCount >= 8 || pageSpan >= 120) {
      targetNumBatches = 4;
    } else if (chapterCount <= 3 && pageSpan < 60) {
      targetNumBatches = 2;
    }

    const targetBatchSize = Math.min(
      Math.max(Math.ceil(totalChars / targetNumBatches), 1600),
      effectiveLimit
    );
    const batches = [];
    let currentBatchSegments = [];
    let currentBatchPages = new Set();
    let currentBatchText = "";
    let lastPage = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const p = seg.pageNumber || 1;

      let lineText = "";
      if (lastPage !== p) {
        lineText += `\n--- Page ${p} ---\n`;
      }
      lineText += `[${seg.type}]: ${seg.content}\n`;

      const isBoundary = seg.type === "chapter_title" || seg.type === "major_heading";
      const canFlushBoundary =
        isBoundary &&
        currentBatchText.length >= targetBatchSize * 0.85 &&
        batches.length < targetNumBatches - 1;
      const mustFlushLimit = currentBatchText.length + lineText.length > effectiveLimit;

      // Flush if at chapter/section boundary and batch has accumulated substantial content,
      // or if adding lineText would exceed the character limit
      if (currentBatchSegments.length > 0 && (canFlushBoundary || mustFlushLimit)) {
        batches.push({
          batchIndex: batches.length,
          pages: Array.from(currentBatchPages).sort((a, b) => a - b),
          segments: currentBatchSegments,
          batchText: currentBatchText.trim(),
        });

        currentBatchSegments = [];
        currentBatchPages = new Set();
        currentBatchText = "";
        lastPage = null;
        if (lastPage !== p) {
          lineText = `\n--- Page ${p} ---\n[${seg.type}]: ${seg.content}\n`;
        }
      }

      currentBatchText += lineText;
      currentBatchPages.add(p);
      currentBatchSegments.push(seg);
      lastPage = p;
    }

    // Flush any remaining content in the final batch
    if (currentBatchSegments.length > 0) {
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
   * Consolidate, deduplicate, merge overlapping concepts, and enforce target count (30-40, hard max 50).
   *
   * Core phases:
   * 1. Sanitize & reject generic non-concepts (Overview, Introduction, Summary, etc.)
   * 2. Canonical exact deduplication (in-place merging of identical keys)
   * 3. Semantic & Token Overlap Similarity Merging:
   *    - Merges variant names (e.g., "Linear Regression Models" -> "Linear Regression")
   *    - Unions sourcePages, maximizes importance, synthesizes descriptions (1-2 sentences)
   * 4. Hierarchical Subtopic Folding:
   *    - If concept count > target (35), merge low-importance / minor leaf concepts into their parentConcept
   * 5. Score-Based Agglomeration to enforce hardMax (50):
   *    - If still > hardMax, score each concept by pedagogical weight
   *    - Fold lowest scoring concepts into nearest thematic concept/parent without losing pages
   * 6. Curriculum Roadmap Sorting:
   *    - Sort by importance (descending: 5, 4, 3...) and sourcePages (ascending).
   *
   * @param {Array<Object>} rawConcepts
   * @param {Object} options - { target: 35, hardMax: 50 }
   * @returns {Array<Object>}
   */
  consolidateAndFilterConcepts(rawConcepts, options = {}) {
    if (!Array.isArray(rawConcepts) || rawConcepts.length === 0) return [];

    const target = options.target || 35;
    const hardMax = options.hardMax || 50;

    // Helper: Stop words & tokenization for semantic matching
    const stopWords = new Set([
      "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
      "introduction", "overview", "basics", "fundamentals",
      "chapter", "section", "part"
    ]);

    const getTokens = (str = "") => {
      return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
    };

    // Generic non-concept blacklist
    const isGenericNonConcept = (name = "") => {
      const trimmed = name.trim().toLowerCase();
      if (trimmed.length < 3) return true;
      if (/^(overview|summary|introduction|conclusion|chapter\s+\d+|review|exercises?|problems?|case\s+study|appendix|glossary|references?|table\s+of\s+contents?|key\s+terms?)$/i.test(trimmed)) {
        return true;
      }
      return false;
    };

    // Phase 1: Initial cleanup & canonical aggregation
    const conceptMap = new Map();

    for (const raw of rawConcepts) {
      if (!raw || typeof raw !== "object") continue;
      const name = (raw.name || "").trim();
      if (!name || isGenericNonConcept(name)) continue;

      const canonicalKey = this.normalizeCanonicalKey(name);
      if (!canonicalKey || canonicalKey.length < 2) continue;

      const importance = Math.min(Math.max(parseInt(raw.importance, 10) || 3, 1), 5);
      const sourcePages = Array.isArray(raw.sourcePages) ? [...raw.sourcePages] : [];
      let desc = (raw.description || "").trim();
      if (!desc) desc = `Core learning concept covering ${name}.`;

      const parentConcept = raw.parentConcept && typeof raw.parentConcept === "string" && raw.parentConcept.trim().length > 1 && raw.parentConcept.trim().toLowerCase() !== name.toLowerCase() && raw.parentConcept.trim().toLowerCase() !== "null"
        ? raw.parentConcept.trim()
        : null;

      if (conceptMap.has(canonicalKey)) {
        const existing = conceptMap.get(canonicalKey);
        // Union sourcePages
        for (const p of sourcePages) {
          if (!existing.sourcePages.includes(p)) existing.sourcePages.push(p);
        }
        existing.sourcePages.sort((a, b) => a - b);
        existing.importance = Math.max(existing.importance, importance);
        if (desc.length > existing.description.length && !existing.description.toLowerCase().includes(name.toLowerCase())) {
          existing.description = desc;
        }
        if (!existing.parentConcept && parentConcept) {
          existing.parentConcept = parentConcept;
        }
      } else {
        conceptMap.set(canonicalKey, {
          _id: raw._id || new mongoose.Types.ObjectId(),
          name,
          description: desc,
          parentConcept,
          importance,
          sourcePages: sourcePages.sort((a, b) => a - b),
          canonicalKey,
        });
      }
    }

    let concepts = Array.from(conceptMap.values());

    // Helper: Merge Concept B into Concept A
    const mergeConcepts = (targetConcept, sourceConcept) => {
      // Union sourcePages
      for (const p of sourceConcept.sourcePages) {
        if (!targetConcept.sourcePages.includes(p)) {
          targetConcept.sourcePages.push(p);
        }
      }
      targetConcept.sourcePages.sort((a, b) => a - b);
      targetConcept.importance = Math.max(targetConcept.importance, sourceConcept.importance);

      // Synthesize description
      const sourceNameLower = sourceConcept.name.toLowerCase();
      if (!targetConcept.description.toLowerCase().includes(sourceNameLower)) {
        let updatedDesc = `${targetConcept.description.replace(/[.;]+$/, "")}; covers ${sourceNameLower}.`;
        const sentences = updatedDesc.match(/[^.!?]+[.!?]+/g);
        if (sentences && sentences.length > 2) {
          updatedDesc = sentences.slice(0, 2).join(" ").trim();
        }
        if (updatedDesc.length > 250) {
          updatedDesc = `${updatedDesc.slice(0, 247)}...`;
        }
        targetConcept.description = updatedDesc;
      }

      // Re-link children that pointed to sourceConcept
      for (const c of concepts) {
        if (c.parentConcept && c.parentConcept.toLowerCase() === sourceConcept.name.toLowerCase()) {
          c.parentConcept = targetConcept.name;
        }
      }
    };

    // Generic structural suffixes that differentiate variants of the same concept
    const genericSuffixes = new Set([
      "model", "models", "method", "methods", "algorithm", "algorithms",
      "technique", "techniques", "system", "systems", "approach", "approaches",
      "procedure", "procedures", "framework", "frameworks", "process", "processes",
      "optimization", "formulation"
    ]);

    const getBaseTokens = (tokens) => {
      const filtered = tokens.filter((t) => !genericSuffixes.has(t));
      return filtered.length > 0 ? filtered : tokens;
    };

    // Phase 2: Semantic & Token Overlap Merging
    for (let i = 0; i < concepts.length; i++) {
      const c1 = concepts[i];
      if (!c1) continue;
      const tokens1 = getTokens(c1.name);

      for (let j = i + 1; j < concepts.length; j++) {
        const c2 = concepts[j];
        if (!c2) continue;
        const tokens2 = getTokens(c2.name);

        let shouldMerge = false;
        if (tokens1.length > 0 && tokens2.length > 0) {
          const base1 = getBaseTokens(tokens1);
          const base2 = getBaseTokens(tokens2);

          const baseInter = base1.filter((t) => base2.includes(t));
          if (base1.length === base2.length && baseInter.length === base1.length && base1.length >= 1) {
            shouldMerge = true;
          } else {
            const intersection = tokens1.filter((t) => tokens2.includes(t));
            const unionSize = new Set([...tokens1, ...tokens2]).size;
            const jaccard = unionSize > 0 ? intersection.length / unionSize : 0;
            if (jaccard >= 0.75) {
              shouldMerge = true;
            }
          }
        }

        if (shouldMerge) {
          // Keep the shorter/cleaner or higher importance name as canonical target
          let primary = c1;
          let secondary = c2;
          if (c2.importance > c1.importance || (c2.importance === c1.importance && c2.name.length < c1.name.length)) {
            primary = c2;
            secondary = c1;
            concepts[i] = c2;
          }
          mergeConcepts(primary, secondary);
          concepts.splice(j, 1);
          j--;
        }
      }
    }

    // Phase 3: Hierarchical Subtopic Folding (if count > target)
    if (concepts.length > target) {
      const parentNames = new Set(concepts.map((c) => (c.parentConcept || "").toLowerCase()).filter(Boolean));

      for (let i = concepts.length - 1; i >= 0 && concepts.length > target; i--) {
        const c = concepts[i];
        if (!c.parentConcept) continue;

        const isParentOfAnother = parentNames.has(c.name.toLowerCase());
        // If it's a leaf concept and has lower importance (<= 3) or few pages (<= 3)
        if (!isParentOfAnother && (c.importance <= 3 || c.sourcePages.length <= 3)) {
          const parent = concepts.find(
            (p) => p.name.toLowerCase() === c.parentConcept.toLowerCase() ||
                   this.normalizeCanonicalKey(p.name) === this.normalizeCanonicalKey(c.parentConcept)
          );
          if (parent && parent !== c) {
            mergeConcepts(parent, c);
            concepts.splice(i, 1);
          }
        }
      }
    }

    // Phase 4: Enforce hardMax (<= 50) without random truncation
    while (concepts.length > hardMax) {
      const parentNames = new Set(concepts.map((c) => (c.parentConcept || "").toLowerCase()).filter(Boolean));

      let lowestScore = Infinity;
      let lowestIdx = -1;

      for (let i = 0; i < concepts.length; i++) {
        const c = concepts[i];
        const isParent = parentNames.has(c.name.toLowerCase());
        const isTopLevel = !c.parentConcept;
        const score = (c.importance * 3) + (Math.min(c.sourcePages.length, 5) * 1.5) + (isParent ? 5 : 0) + (isTopLevel ? 3 : 0);

        if (score < lowestScore) {
          lowestScore = score;
          lowestIdx = i;
        }
      }

      if (lowestIdx >= 0) {
        const victim = concepts[lowestIdx];
        // Find best host: parent, or highest token overlap, or nearest page
        let host = concepts.find((p) => victim.parentConcept && (p.name.toLowerCase() === victim.parentConcept.toLowerCase() || this.normalizeCanonicalKey(p.name) === this.normalizeCanonicalKey(victim.parentConcept)));

        if (!host) {
          const vTokens = getTokens(victim.name);
          let bestOverlap = 0;
          for (let i = 0; i < concepts.length; i++) {
            if (i === lowestIdx) continue;
            const other = concepts[i];
            const oTokens = getTokens(other.name);
            const overlap = vTokens.filter((t) => oTokens.includes(t)).length;
            if (overlap > bestOverlap) {
              bestOverlap = overlap;
              host = other;
            }
          }
        }

        if (!host) {
          const victimPage = victim.sourcePages[0] || 1;
          let minPageDist = Infinity;
          for (let i = 0; i < concepts.length; i++) {
            if (i === lowestIdx) continue;
            const other = concepts[i];
            const otherPage = other.sourcePages[0] || 1;
            const dist = Math.abs(otherPage - victimPage);
            if (dist < minPageDist) {
              minPageDist = dist;
              host = other;
            }
          }
        }

        if (host && host !== victim) {
          mergeConcepts(host, victim);
        }
        concepts.splice(lowestIdx, 1);
      } else {
        break;
      }
    }

    // Phase 5: Clamp descriptions strictly to 1-2 sentences and <= 250 chars
    for (const c of concepts) {
      let desc = (c.description || "").trim();
      const sentences = desc.match(/[^.!?]+[.!?]+/g);
      if (sentences && sentences.length > 2) {
        desc = sentences.slice(0, 2).join(" ").trim();
      }
      if (desc.length > 250) {
        desc = `${desc.slice(0, 247)}...`;
      }
      c.description = desc;
    }

    // Phase 6: Sort by importance descending, and then earliest sourcePage ascending
    concepts.sort((a, b) => {
      if ((b.importance || 3) !== (a.importance || 3)) {
        return (b.importance || 3) - (a.importance || 3);
      }
      const pageA = (a.sourcePages && a.sourcePages[0]) || 1;
      const pageB = (b.sourcePages && b.sourcePages[0]) || 1;
      return pageA - pageB;
    });

    return concepts;
  }

  /**
   * Persist concepts into exactly ONE Concept document per material with in-document deduplication
   * and consolidation to a concise 30-40 concept roadmap (hard max 50).
   */
  async persistAndDeduplicateConcepts(extractedConcepts, projectId, materialId, userId = null) {
    if (!materialId) {
      throw new Error("materialId is required to persist concepts");
    }

    let conceptDoc = await Concept.findOne({ materialId });
    if (!conceptDoc) {
      conceptDoc = new Concept({
        materialId,
        projectId,
        userId: userId || null,
        concepts: [],
        metadata: {
          extractedAt: new Date(),
        },
      });
    }

    // Combine existing concepts with newly extracted batch concepts
    const combined = [
      ...((conceptDoc.concepts || []).map((c) => c.toObject?.() || c)),
      ...extractedConcepts,
    ];

    // Consolidate into concise high-level learning map (target 35, hard max 50)
    const consolidated = this.consolidateAndFilterConcepts(combined, {
      target: 35,
      hardMax: 50,
    });

    // Replace document concepts with deduplicated, consolidated list
    conceptDoc.concepts = consolidated.map((c) => ({
      _id: c._id || new mongoose.Types.ObjectId(),
      name: c.name,
      description: c.description,
      parentConcept: c.parentConcept || null,
      importance: c.importance,
      sourcePages: c.sourcePages,
      metadata: { canonicalKey: c.canonicalKey || this.normalizeCanonicalKey(c.name) },
    }));

    conceptDoc.metadata = {
      ...(conceptDoc.metadata || {}),
      lastUpdatedAt: new Date(),
      conceptsCount: conceptDoc.concepts.length,
    };

    await conceptDoc.save();

    return conceptDoc.concepts.map((c) => ({
      ...c.toObject?.() || c,
      parentConcept: c.parentConcept || null,
      materialId: conceptDoc.materialId,
      projectId: conceptDoc.projectId,
    }));
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
    return await Concept.findConceptsByProject(projectId);
  }

  async getConceptsByMaterial(materialId) {
    if (!materialId) return [];
    const doc = await Concept.findOne({ materialId }).lean();
    if (!doc || !Array.isArray(doc.concepts)) return [];
    return doc.concepts
      .map((c) => ({
        ...c,
        materialId: doc.materialId,
        projectId: doc.projectId,
      }))
      .sort((a, b) => (b.importance || 3) - (a.importance || 3));
  }

  /**
   * On-demand concept generation:
   * Uses existing Vector Search to retrieve relevant chunks, then sends only
   * those chunks to Groq for concept generation.
   * Prefers 1 Groq call when filtered content fits; splits if too large.
   *
   * @param {Object} params - { projectId, userId, materialId, query, limit }
   * @returns {Promise<Array<Object>>} Persisted deduplicated concepts
   */
  async generateConceptsOnDemand({ projectId, userId, materialId = null, query = null, limit = 8 }) {
    if (!projectId) {
      throw new Error("generateConceptsOnDemand requires projectId");
    }

    const retrievalService = require("../retrieval/retrieval.service");

    // 1. Retrieve relevant chunks using existing Vector Search
    let retrieval = null;
    try {
      retrieval = await retrievalService.retrieveForQuery({
        projectId,
        userId,
        query: query || "fundamental concepts principles key definitions architecture theory core methods",
        topK: limit,
        filterMaterialIds: materialId ? [materialId] : null,
        allowDevFallback: true,
      });
    } catch (e) {
      console.warn(`[KnowledgeService] Vector retrieval non-fatal error, falling back to chunks: ${e.message}`);
    }

    const chunks = (retrieval && retrieval.results) ? [...retrieval.results] : [];
    if (chunks.length === 0) {
      // Direct chunk fallback if available
      const Chunk = require("../../models/Chunk");
      const filter = { projectId };
      if (userId) filter.userId = userId;
      if (materialId) filter.materialId = materialId;
      const directChunks = await Chunk.find(filter).limit(limit).lean();
      if (!directChunks || directChunks.length === 0) {
        return [];
      }
      chunks.push(...directChunks.map((c) => ({
        text: c.text,
        page: c.page || (c.pages && c.pages[0]) || 1,
        pages: c.pages || (c.page ? [c.page] : [1]),
        materialId: c.materialId,
      })));
    }

    const targetMatId = materialId || chunks[0]?.materialId || new mongoose.Types.ObjectId();

    // 2. Build structured text batches (preferring 1 Groq call when content fits)
    const formattedExcerpts = chunks.map((c, idx) => {
      const pageStr = c.page ? String(c.page) : (c.pages?.join(",") || "N/A");
      return {
        text: `[Source Excerpt ${idx + 1} (Page ${pageStr})]:\n${c.text}`,
        page: c.page || (c.pages && c.pages[0]) || 1,
        pages: c.pages || (c.page ? [c.page] : [1]),
      };
    });

    const fullBatchText = formattedExcerpts.map((e) => e.text).join("\n\n---\n\n");
    let allRawConcepts = [];

    if (fullBatchText.length <= 20000) {
      // Single Qwen call fits comfortably within token budget
      const llmResult = await llmService.extractBatchConcepts(fullBatchText, {
        userId,
        projectId,
        materialId: targetMatId,
      });
      allRawConcepts.push(...(llmResult?.concepts || []));
    } else {
      // Split by chunk/page boundaries into smaller batches
      const batchSize = Math.ceil(formattedExcerpts.length / 2);
      for (let i = 0; i < formattedExcerpts.length; i += batchSize) {
        const subExcerpts = formattedExcerpts.slice(i, i + batchSize);
        const subBatchText = subExcerpts.map((e) => e.text).join("\n\n---\n\n");
        const llmResult = await llmService.extractBatchConcepts(subBatchText, {
          userId,
          projectId,
          materialId: targetMatId,
        });
        allRawConcepts.push(...(llmResult?.concepts || []));
      }
    }

    // 3. Map source pages provenance from chunks
    const mappedConcepts = allRawConcepts.map((rc) => {
      const matchedPages = new Set();
      const lowerName = (rc.name || "").toLowerCase();
      for (const c of chunks) {
        if (c.text && c.text.toLowerCase().includes(lowerName)) {
          const chunkPages = c.pages || (c.page ? [c.page] : [1]);
          for (const p of chunkPages) matchedPages.add(p);
        }
      }
      return {
        ...rc,
        parentConcept: rc.parentConcept || null,
        sourcePages: matchedPages.size > 0 ? Array.from(matchedPages).sort((a, b) => a - b) : [chunks[0]?.page || 1],
      };
    });

    // 4. Persist and deduplicate into exactly ONE Concept document for this material
    const persisted = await this.persistAndDeduplicateConcepts(mappedConcepts, projectId, targetMatId, userId);

    return persisted;
  }
}

module.exports = new KnowledgeService();
