const Groq = require("groq-sdk");
const AIUsage = require("../../models/AIUsage");

/**
 * Groq-based LLM Service
 *
 * Handles batched concept extraction requests with strict token budgeting,
 * structured JSON output enforcement, and comprehensive AIUsage tracking.
 * Uses Groq as the AI provider with open weights models:
 *  - Primary (High-Quality/Complex): openai/gpt-oss-120b
 *  - Fast (Lightweight/Fast): openai/gpt-oss-20b
 */
class LlmService {
  constructor() {
    this.groqClient = null;
    this._cachedApiKey = null;
  }

  /**
   * Resolve primary generative model name from environment
   */
  getPrimaryModel() {
    return process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
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
      this.groqClient = new Groq({ apiKey });
      this._cachedApiKey = apiKey;
    }
    return this.groqClient;
  }

  /**
   * Extract concepts from a single batch of page-aware text
   *
   * @param {string} batchText - Formatted text for the batch with page indicators
   * @param {Object} context - { userId, projectId, materialId, batchIndex }
   * @param {Object} options - Options { forceFailure: boolean, model: string, useFast: boolean, useLocalOnly: boolean }
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
    const { userId, projectId } = context;

    if (!batchText || typeof batchText !== "string" || !batchText.trim()) {
      return { concepts: [], model: "none", inputTokens: 0, outputTokens: 0, latency: 0 };
    }

    // Resolve model: explicit option > fast flag (20b) > configured primary (120b)
    const modelName =
      options.model ||
      (options.useFast ? this.getFastModel() : this.getPrimaryModel());

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

    try {
      let rawConcepts = [];

      // 1. If Groq SDK client is available and local-only mode is not requested, call Groq
      if (groqClient && !options.useLocalOnly) {
        const groqResult = await this.callGroq(batchText, modelName, groqClient);
        rawConcepts = groqResult.concepts || [];
        if (groqResult.usage) {
          inputTokens = groqResult.usage.prompt_tokens || estimatedInputTokens;
          outputTokens =
            groqResult.usage.completion_tokens ||
            Math.ceil(JSON.stringify(rawConcepts).length / 4);
        }
      }
      // 2. Fallback / Local Deterministic Engine (for local dev, offline, or test environments)
      else {
        const localResult = this.heuristicBatchExtraction(batchText);
        rawConcepts = localResult.concepts || [];
        outputTokens = Math.max(Math.ceil(JSON.stringify(rawConcepts).length / 4), 10);
      }

      // 3. Validate and sanitize structured concept response
      const validatedConcepts = this.sanitizeConcepts(rawConcepts);
      const latency = Date.now() - startTime;

      // 4. Record AIUsage metric in MongoDB
      if (userId && projectId) {
        await this.recordUsage({
          userId,
          projectId,
          model: modelName,
          latency,
          inputTokens,
          outputTokens,
          success: true,
          errorMessage: null,
        });
      }

      return {
        concepts: validatedConcepts,
        model: modelName,
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
   * Build structured prompt for concept extraction
   */
  buildPrompt(batchText) {
    return `Analyze the following document batch text and extract all important educational concepts, principles, and terms.

Return strictly a JSON object with this exact format:
{
  "concepts": [
    {
      "name": "Concept Name",
      "description": "Clear educational explanation based strictly on the text",
      "importance": 1 to 5 (integer, 5 = highest importance)
    }
  ]
}

Batch Content:
${batchText}`;
  }

  /**
   * Call Groq API via official Groq SDK with structured JSON enforcement
   *
   * @param {string} batchText - Content to extract concepts from
   * @param {string} modelName - e.g., 'openai/gpt-oss-120b' or 'openai/gpt-oss-20b'
   * @param {Groq} client - Initialized Groq SDK client
   */
  async callGroq(batchText, modelName, client) {
    const promptText = this.buildPrompt(batchText);

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
  }

  /**
   * Sanitize and enforce schema constraints (name, description, importance 1-5)
   */
  sanitizeConcepts(rawList) {
    if (!Array.isArray(rawList)) return [];

    const sanitized = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") continue;
      const rawName = String(item.name || "").trim();
      if (!rawName || rawName.length < 2) continue;

      const desc = String(item.description || "").trim();
      const rawImportance = parseInt(item.importance, 10);
      const importance = isNaN(rawImportance) ? 3 : Math.min(Math.max(rawImportance, 1), 5);

      sanitized.push({
        name: rawName,
        description: desc || `Concept definition for ${rawName}.`,
        importance,
      });
    }

    return sanitized;
  }

  /**
   * Deterministic local concept extraction from batch text (offline fallback)
   */
  heuristicBatchExtraction(batchText) {
    const concepts = [];
    const seen = new Set();

    const lines = batchText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Definition patterns: "X is ...", "X refers to ...", "X solves ..."
    const defRegex = /^([A-Z][A-Za-z0-9\s\-]{2,50})\s+(?:is|are|refers to|represents|defines|solves|provides|operates as)\s+(.+)$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect heading indicators: "[heading]: Chapter X" or "### Header"
      const headingMatch =
        line.match(/^\[heading\]:\s*(?:Chapter\s+\d+[:\.\-\s]*)?(?:Section\s+\d+[:\.\-\s]*)?([A-Z][A-Za-z0-9\s,\-]{2,60})$/i) ||
        line.match(/^#{1,6}\s+([A-Z][A-Za-z0-9\s,\-]{2,60})$/);

      if (headingMatch) {
        const name = headingMatch[1].replace(/[:.]\s*$/, "").trim();
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (
          name.length >= 3 &&
          !seen.has(key) &&
          !/^(Overview|Summary|Introduction|Conclusion|Key Points|Notes)$/i.test(name)
        ) {
          seen.add(key);

          let desc = `Core structural concept covering ${name}.`;
          if (i + 1 < lines.length && lines[i + 1].startsWith("[paragraph]:")) {
            desc = lines[i + 1].replace(/^\[paragraph\]:\s*/, "").trim();
          }

          concepts.push({
            name,
            description: desc.length > 250 ? `${desc.slice(0, 247)}...` : desc,
            importance: 5,
          });
        }
      }

      // Detect explicit definition sentences
      const cleanLine = line.replace(/^\[[a-z_\/]+\]:\s*/i, "").trim();
      const defMatch = cleanLine.match(defRegex);
      if (defMatch) {
        const candidateName = defMatch[1].trim();
        const candidateDesc = defMatch[2].trim();
        const key = candidateName.toLowerCase().replace(/[^a-z0-9]/g, "");

        if (
          candidateName.length >= 3 &&
          !seen.has(key) &&
          !/^(this|that|these|those|it|there|here|we|they|summary|conclusion|key points?)$/i.test(candidateName)
        ) {
          seen.add(key);
          concepts.push({
            name: candidateName,
            description: candidateDesc.length > 250 ? `${candidateDesc.slice(0, 247)}...` : candidateDesc,
            importance: 4,
          });
        }
      }

      // Detect list key points: "* Name: description"
      if (cleanLine.startsWith("*") || cleanLine.startsWith("-") || /^\d+[\.\)]/.test(cleanLine)) {
        const itemClean = cleanLine.replace(/^[•\*\-\–\—◦▪0-9.\)\s]+/, "").trim();
        const colonMatch = itemClean.match(/^([A-Z][A-Za-z0-9\s\-]{2,40}):\s*(.+)$/);
        if (colonMatch) {
          const name = colonMatch[1].trim();
          const desc = colonMatch[2].trim();
          const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!seen.has(key)) {
            seen.add(key);
            concepts.push({
              name,
              description: desc,
              importance: 3,
            });
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
