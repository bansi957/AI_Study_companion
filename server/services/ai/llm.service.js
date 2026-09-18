const Groq = require("groq-sdk");
const AIUsage = require("../../models/AIUsage");
const conceptRateLimiter = require("./conceptRateLimiter");

/**
 * Groq-based LLM Service
 *
 * Handles batched concept extraction requests with strict token budgeting,
 * structured JSON output enforcement, and comprehensive AIUsage tracking.
 * Uses Groq as the AI provider:
 *  - Concept Generation: qwen/qwen3.8-27b
 *  - Primary (Tutor/Quiz/Assessment): openai/gpt-oss-120b
 *  - Fast Fallback: openai/gpt-oss-20b
 */
class LlmService {
  constructor() {
    this.groqClient = null;
    this._cachedApiKey = null;
    this.primaryRateLimitUntil = 0;
  }

  /**
   * Resolve concept generative model name (qwen/qwen3.8-27b)
   */
  getConceptModel() {
    return process.env.CONCEPT_LLM_MODEL || "qwen/qwen3.8-27b";
  }

  /**
   * Resolve primary generative model name from environment
   */
  getPrimaryModel() {
    return (
      process.env.LLM_MODEL ||
      process.env.LLM_PRIMARY_MODEL ||
      "openai/gpt-oss-120b"
    );
  }

  /**
   * Resolve fast / low-latency generative model name from environment
   */
  getFastModel() {
    return process.env.LLM_FAST_MODEL || "openai/gpt-oss-20b";
  }

  /**
   * Get or initialize Groq SDK client
   */
  getGroqClient(explicitKey) {
    const apiKey = explicitKey || process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    if (!this.groqClient || this._cachedApiKey !== apiKey) {
      // Set maxRetries: 0 to handle rate limits and fallbacks explicitly without SDK internal sleep delays
      this.groqClient = new Groq({ apiKey, maxRetries: 0 });
      this._cachedApiKey = apiKey;
    }
    return this.groqClient;
  }

  /**
   * Extract concepts from a single batch of page-aware text using Qwen (qwen/qwen3.8-27b)
   *
   * @param {string} batchText - Formatted text for the batch with page indicators
   * @param {Object} context - { userId, projectId, materialId, batchIndex }
   * @param {Object} options - Options { forceFailure: boolean, model: string, useLocalOnly: boolean }
   * @returns {Promise<{
   *   concepts: Array<{ name: string, description: string, importance: number }>,
   *   model: string,
   *   inputTokens: number,
   *   outputTokens: number,
   *   latency: number
   * }>}
   */
  async extractBatchConcepts(batchText, context = {}, options = {}) {
    const startTime = Date.now();
    const { userId, projectId, materialId } = context;

    if (!batchText || typeof batchText !== "string" || !batchText.trim()) {
      return { concepts: [], model: "none", inputTokens: 0, outputTokens: 0, latency: 0 };
    }

    // Concept generation strictly uses qwen/qwen3.8-27b
    const modelName = options.model || this.getConceptModel();

    const estimatedInputTokens = Math.max(Math.ceil(batchText.length / 4) + 65, 1);
    let inputTokens = estimatedInputTokens;
    let outputTokens = 0;

    // Simulate failure option for testing retry/failure pipeline flow
    if (options.forceFailure) {
      const latency = Date.now() - startTime;
      if (userId && projectId) {
        await this.recordUsage({
          userId,
          projectId,
          model: modelName,
          latency,
          inputTokens,
          outputTokens: 0,
          success: false,
          errorMessage: "Simulated LLM batch extraction failure",
        });
      }
      throw new Error("Simulated LLM batch extraction failure");
    }

    const groqClient = this.getGroqClient(options.apiKey);

    let usedModel = modelName;
    try {
      let rawConcepts = [];

      // 1. If Groq SDK client is available and local-only mode is not requested, call Qwen via Groq
      if (groqClient && !options.useLocalOnly) {
        try {
          const groqResult = await this.callGroqConcept(batchText, modelName, groqClient);
          rawConcepts = groqResult.concepts || [];
          if (groqResult.usage) {
            inputTokens = groqResult.usage.prompt_tokens || estimatedInputTokens;
            outputTokens =
              groqResult.usage.completion_tokens ||
              Math.ceil(JSON.stringify(rawConcepts).length / 4);
          }
        } catch (conceptErr) {
          console.warn(
            `[LlmService] Concept extraction via ${modelName} failed or rate-limited: ${conceptErr.message}. Falling back to heuristic extraction to protect pipeline.`
          );
          usedModel = "heuristic-fallback";
          const localResult = this.heuristicBatchExtraction(batchText);
          rawConcepts = localResult.concepts || [];
          outputTokens = Math.max(Math.ceil(JSON.stringify(rawConcepts).length / 4), 10);
        }
      }
      // 2. Fallback / Local Deterministic Engine (for local dev, offline, or test environments)
      else {
        usedModel = "heuristic-local";
        const localResult = this.heuristicBatchExtraction(batchText);
        rawConcepts = localResult.concepts || [];
        outputTokens = Math.max(Math.ceil(JSON.stringify(rawConcepts).length / 4), 10);
      }

      // 3. Validate and sanitize structured concept response
      const validatedConcepts = this.sanitizeConcepts(rawConcepts);
      const latency = Date.now() - startTime;

      // 4. Record comprehensive AIUsage
      if (userId && projectId) {
        await this.recordUsage({
          userId,
          projectId,
          materialId,
          model: usedModel,
          latency,
          inputTokens,
          outputTokens,
          success: true,
        });
      }

      return {
        concepts: validatedConcepts,
        model: usedModel,
        inputTokens,
        outputTokens,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      // Record failed attempt in AIUsage
      if (userId && projectId) {
        await this.recordUsage({
          userId,
          projectId,
          model: modelName,
          latency,
          inputTokens,
          outputTokens: 0,
          success: false,
          errorMessage: error.message,
        }).catch(() => {});
      }

      throw error;
    }
  }

  /**
   * Build structured prompt for high-level concept map extraction
   */
  buildPrompt(batchText) {
    return `Analyze the following study material and extract ONLY the MAIN learning concepts to create a concise, high-level learning map for a student.

CRITICAL RULES:
1. Concepts represent the MAIN things a learner should study, NOT every heading, subheading, definition, example, formula, or minor topic.
2. Merge closely related subtopics into ONE broader concept instead of creating many flat, tiny concepts.
   EXAMPLE:
   Instead of:
     - Data Cleaning
     - Missing Values
     - Outlier Handling
     - Data Standardization
     - Duplicate Removal
   Create ONE broader concept:
     - "name": "Data Cleaning", "description": "Covers missing values, outlier handling, duplicate removal, and data standardization."
3. Prefer hierarchical concepts using "parentConcept" where appropriate, instead of many flat concepts.
4. Ignore details, exercises, applications, or examples that can be learned from the underlying text chunks.
5. Do NOT create concepts solely because a heading exists.
6. Aim for a concise set of concepts: ONLY 5 to 8 major concepts for this entire batch.
7. Rank concepts by learning importance (1 to 5, where 5 is foundational/core).

For each main concept, provide:
- "name": Concise name of the main concept (e.g., "Supervised Learning", "Data Cleaning")
- "description": Short, crisp explanation (strictly 1 to 2 sentences)
- "parentConcept": Name of the overarching parent concept if this is a subtopic, or null if top-level
- "importance": Integer from 1 to 5

Return strictly a JSON object with this exact format:
{
  "concepts": [
    {
      "name": "Concept Name",
      "description": "Short explanation in 1-2 sentences.",
      "parentConcept": "Parent Topic Name or null",
      "importance": 5
    }
  ]
}

Batch Content:
${batchText}`;
  }

  /**
   * Call Groq API with Qwen (qwen/qwen3.8-27b) under global distributed rate limiting
   */
  async callGroqConcept(batchText, modelName, client, maxRetries = 3) {
    const promptText = this.buildPrompt(batchText);
    const estimatedTokens = conceptRateLimiter.estimateTokens(promptText) + 80;

    let attempt = 0;
    while (attempt < maxRetries) {
      // Coordinate globally across workers to ensure >= 2.2s gap and rolling <= 5800 ITPM budget
      await conceptRateLimiter.acquireSlot(estimatedTokens);

      // Ensure adequate max_tokens for concise concept list without cutting off JSON
      const currentMaxTokens = 1500;

      try {
        const completion = await client.chat.completions.create({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "You are an expert curriculum and educational analyst. Extract ONLY the MAIN learning concepts to build a small, high-level learning map. Do not extract minor subtopics, examples, formulas, or every heading. Keep descriptions short and crisp (strictly 1 to 2 sentences). Respond ONLY with a valid JSON object matching the requested schema.",
            },
            { role: "user", content: promptText },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: currentMaxTokens,
        });

        const messageContent = completion.choices?.[0]?.message?.content;
        if (!messageContent) {
          throw new Error(`Groq returned empty message content for model ${modelName}`);
        }

        let parsed;
        try {
          const cleanJson = messageContent
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
          parsed = JSON.parse(cleanJson);
        } catch (parseErr) {
          throw new Error(`Failed to parse JSON response from Groq (${modelName}): ${parseErr.message}`);
        }

        return {
          concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
          usage: completion.usage || null,
        };
      } catch (err) {
        const isRateLimit =
          err.status === 429 ||
          err.statusCode === 429 ||
          (err.message && (err.message.includes("429") || err.message.includes("rate_limit_exceeded") || err.message.includes("Rate limit reached")));

        if (isRateLimit && attempt < maxRetries - 1) {
          attempt++;
          // Report 429 to global rate limiter to respect Retry-After or back off with jitter
          const waitMs = await conceptRateLimiter.reportRateLimit(err, attempt);
          console.warn(`[LlmService] Rate limit on ${modelName}. Waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt}/${maxRetries}...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Call Groq API via official Groq SDK with structured JSON enforcement and automatic 429 backoff retry
   *
   * @param {string} batchText - Content to extract concepts from
   * @param {string} modelName - e.g., 'openai/gpt-oss-120b' or 'openai/gpt-oss-20b'
   * @param {Groq} client - Initialized Groq SDK client
   * @param {number} maxRetries - Maximum retry attempts on 429 rate limit
   */
  async callGroq(batchText, modelName, client, maxRetries = 3) {
    const promptText = this.buildPrompt(batchText);

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const completion = await client.chat.completions.create({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "You are an expert curriculum and learning assistant. Extract key concepts from the content. Respond ONLY with a valid JSON object matching the requested schema. Do not output markdown code blocks or explanatory commentary outside the JSON object.",
            },
            { role: "user", content: promptText },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });

        const messageContent = completion.choices?.[0]?.message?.content;
        if (!messageContent) {
          throw new Error(`Groq returned empty message content for model ${modelName}`);
        }

        let parsed;
        try {
          const cleanJson = messageContent
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
          parsed = JSON.parse(cleanJson);
        } catch (parseErr) {
          throw new Error(`Failed to parse JSON response from Groq (${modelName}): ${parseErr.message}`);
        }

        return {
          concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
          usage: completion.usage || null,
        };
      } catch (err) {
        const isRateLimit =
          err.status === 429 ||
          err.statusCode === 429 ||
          (err.message && (err.message.includes("429") || err.message.includes("rate_limit_exceeded") || err.message.includes("Rate limit reached")));

        // If primary model hits 429, mark it for cooldown and immediately switch to fast model without sleeping
        if (isRateLimit && modelName === this.getPrimaryModel()) {
          this.primaryRateLimitUntil = Date.now() + 60000;
          console.warn(`[LlmService] Rate limit hit on primary (${modelName}). Switching immediately to fast model...`);
          throw err;
        }

        attempt++;
        if (isRateLimit && attempt < maxRetries) {
          // Parse wait time from Groq error message if present (e.g. "Please try again in 5.94s")
          const waitMatch = err.message ? err.message.match(/try again in ([\d\.]+)s/i) : null;
          const waitSeconds = waitMatch ? parseFloat(waitMatch[1]) : attempt * 1.5;
          const waitMs = Math.min(Math.ceil(waitSeconds * 1000) + 300, 3000);

          console.warn(`[LlmService] Rate limit hit on ${modelName}. Sleeping ${(waitMs / 1000).toFixed(1)}s before retry ${attempt}/${maxRetries}...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Sanitize and enforce schema constraints (name, description, parentConcept, importance 1-5)
   */
  sanitizeConcepts(rawList) {
    if (!Array.isArray(rawList)) return [];

    const sanitized = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") continue;
      const rawName = String(item.name || "").trim();
      if (!rawName || rawName.length < 2) continue;

      let desc = String(item.description || "").trim();
      if (!desc) {
        desc = `Core learning concept covering ${rawName}.`;
      } else {
        // Enforce 1-2 sentences: keep at most first 2 sentences if overly verbose
        const sentences = desc.match(/[^.!?]+[.!?]+/g);
        if (sentences && sentences.length > 2) {
          desc = sentences.slice(0, 2).join(" ").trim();
        }
        if (desc.length > 250) {
          desc = `${desc.slice(0, 247)}...`;
        }
      }

      const rawImportance = parseInt(item.importance, 10);
      const importance = isNaN(rawImportance) ? 3 : Math.min(Math.max(rawImportance, 1), 5);
      const parentConcept =
        item.parentConcept &&
        typeof item.parentConcept === "string" &&
        item.parentConcept.trim().length > 1 &&
        item.parentConcept.trim().toLowerCase() !== rawName.toLowerCase() &&
        item.parentConcept.trim().toLowerCase() !== "null"
          ? item.parentConcept.trim()
          : null;

      sanitized.push({
        name: rawName,
        description: desc,
        parentConcept,
        importance,
      });
    }

    return sanitized;
  }

  /**
   * Deterministic local concept extraction from batch text (offline fallback)
   * Focuses on major learning concepts, consolidates subtopics, and caps at 6-8 concepts.
   */
  heuristicBatchExtraction(batchText) {
    const concepts = [];
    const seen = new Set();
    let currentChapter = null;
    let activeConcept = null;

    const lines = batchText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      if (concepts.length >= 8) break; // Strict budget cap per batch

      const line = lines[i];

      // Detect chapter title
      const chapterMatch = line.match(/^\[chapter_title\]:\s*(.+)$/i);
      if (chapterMatch) {
        const rawTitle = chapterMatch[1].replace(/[:.]\s*$/, "").trim();
        const key = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (rawTitle.length >= 3 && !seen.has(key)) {
          seen.add(key);
          currentChapter = rawTitle;

          let desc = `Main learning topic covering ${rawTitle}.`;
          if (i + 1 < lines.length && lines[i + 1].startsWith("[topic_context]:")) {
            desc = lines[i + 1].replace(/^\[topic_context\]:\s*/, "").trim();
          }

          const sentences = desc.match(/[^.!?]+[.!?]+/g);
          if (sentences && sentences.length > 2) {
            desc = sentences.slice(0, 2).join(" ").trim();
          }

          const newConcept = {
            name: rawTitle,
            description: desc.length > 250 ? `${desc.slice(0, 247)}...` : desc,
            parentConcept: null,
            importance: 5,
          };
          concepts.push(newConcept);
          activeConcept = newConcept;
        }
        continue;
      }

      // Detect major heading
      const headingMatch = line.match(/^\[(?:major_heading|heading)\]:\s*(.+)$/i);
      if (headingMatch) {
        const name = headingMatch[1].replace(/[:.]\s*$/, "").trim();
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (
          name.length >= 3 &&
          !seen.has(key) &&
          !/^(overview|summary|introduction|conclusion|key points|notes|exercises|examples|review|discussion)$/i.test(name)
        ) {
          seen.add(key);

          let desc = `Core concept covering ${name}.`;
          if (i + 1 < lines.length && (lines[i + 1].startsWith("[topic_context]:") || lines[i + 1].startsWith("[definition]:"))) {
            desc = lines[i + 1].replace(/^\[[a-z_]+\]:\s*/, "").trim();
          }

          const sentences = desc.match(/[^.!?]+[.!?]+/g);
          if (sentences && sentences.length > 2) {
            desc = sentences.slice(0, 2).join(" ").trim();
          }

          const newConcept = {
            name,
            description: desc.length > 250 ? `${desc.slice(0, 247)}...` : desc,
            parentConcept: currentChapter && currentChapter !== name ? currentChapter : null,
            importance: 4,
          };
          concepts.push(newConcept);
          activeConcept = newConcept;
        }
        continue;
      }

      // Fold definitions or subtopics into active concept's description rather than creating granular concepts
      const defMatch = line.match(/^\[definition\]:\s*([A-Z][A-Za-z0-9\s\-]{2,50})\s+(?:is defined as|refers to|means|is an algorithm|is a technique|is a method)\s+(.+)$/i);
      if (defMatch && activeConcept) {
        const termName = defMatch[1].trim();
        if (!activeConcept.description.toLowerCase().includes(termName.toLowerCase())) {
          const updated = `${activeConcept.description.replace(/\.$/, "")}; includes ${termName.toLowerCase()}.`;
          if (updated.length <= 250) {
            activeConcept.description = updated;
          }
        }
      }
    }

    return { concepts };
  }

  /**
   * Persist AIUsage record to MongoDB
   */
  async recordUsage({ userId, projectId, model, latency, inputTokens, outputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "CONCEPT_EXTRACTION",
        model,
        latency,
        inputTokens,
        outputTokens,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[LlmService] Failed to record AIUsage: ${err.message}`);
    }
  }
}

module.exports = new LlmService();
