const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const Project = require("../../models/Project");
const Conversation = require("../../models/Conversation");
const AIUsage = require("../../models/AIUsage");
const retrievalService = require("../retrieval/retrieval.service");
const activityService = require("../analytics/activity.service");
const llmService = require("./llm.service");

/**
 * AI Tutor Service
 *
 * Provides grounded, pedagogical conversational tutoring based strictly on
 * retrieved project materials. Generates verified source citations from
 * chunk metadata, records AIUsage, and manages conversation history.
 */
class TutorService {
  constructor() {
    this.primaryModel = process.env.LLM_MODEL || process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
    this.relevanceThreshold = parseFloat(process.env.TUTOR_RELEVANCE_THRESHOLD || "0.20");
    this.maxHistoryMessages = 6;
  }

  getGroqClient() {
    return llmService.getGroqClient();
  }

  /**
   * Main Tutor Chat handler
   *
   * @param {Object} params - { userId, projectId, conversationId, message, topK, allowDevFallback }
   * @returns {Promise<{ conversationId: string, answer: string, supported: boolean, sources: Array }>}
   */
  async askTutor({
    userId,
    projectId,
    conversationId = null,
    message,
    topK = 5,
    allowDevFallback = true,
  }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      const err = new Error("Message text is required");
      err.statusCode = 400;
      throw err;
    }

    const cleanMessage = message.trim();

    // 1. Verify that project belongs strictly to user
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Resolve or initialize Conversation
    let conversation;
    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      conversation = await Conversation.findOne({
        _id: conversationId,
        userId,
        projectId,
      });
    }

    if (!conversation) {
      const generatedTitle =
        cleanMessage.length > 40
          ? `${cleanMessage.slice(0, 37)}...`
          : cleanMessage;

      conversation = new Conversation({
        userId,
        projectId,
        title: generatedTitle,
        messages: [],
      });
    }

    // 3. Retrieve relevant project chunks
    const retrievalResult = await retrievalService.retrieveForQuery({
      projectId,
      userId,
      query: cleanMessage,
      topK,
      allowDevFallback,
    });

    const retrievedChunks = retrievalResult.results || [];

    // 4. Evidence Sufficiency Check (Unsupported question behavior)
    const isSupported = this.isEvidenceSufficient(cleanMessage, retrievedChunks);

    if (!isSupported) {
      const unsupportedAnswer =
        "I couldn't find enough information in this Project's learning materials to answer that confidently.";

      // Record user turn & unsupported assistant response
      conversation.messages.push({
        role: "user",
        content: cleanMessage,
      });
      conversation.messages.push({
        role: "assistant",
        content: unsupportedAnswer,
        sources: [],
      });
      await conversation.save();

      return {
        conversationId: conversation._id.toString(),
        answer: unsupportedAnswer,
        supported: false,
        sources: [],
      };
    }

    // 5. Build grounded prompt messages with [SOURCE S1] tags
    const promptMessages = this.buildPromptMessages(
      conversation,
      retrievalResult.context,
      cleanMessage
    );

    // 7. Invoke Groq generative model (openai/gpt-oss-120b)
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let answer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (groq) {
      let usedModel = this.primaryModel;
      try {
        let completion;
        try {
          completion = await groq.chat.completions.create({
            model: this.primaryModel,
            messages: promptMessages,
            temperature: 0.2, // low temperature for grounded, factual reasoning
            max_tokens: 1500,
          });
        } catch (primaryErr) {
          const isRateLimit =
            primaryErr.status === 429 ||
            primaryErr.statusCode === 429 ||
            (primaryErr.message && (primaryErr.message.includes("429") || primaryErr.message.includes("rate_limit")));
          const fastModel = process.env.LLM_FAST_MODEL || "openai/gpt-oss-20b";
          if (isRateLimit && this.primaryModel !== fastModel) {
            console.warn(`[TutorService] Primary model rate-limited. Falling back to fast model: ${fastModel}`);
            usedModel = fastModel;
            completion = await groq.chat.completions.create({
              model: fastModel,
              messages: promptMessages,
              temperature: 0.2,
              max_tokens: 1500,
            });
          } else {
            throw primaryErr;
          }
        }

        const latency = Date.now() - startTime;
        answer = completion.choices?.[0]?.message?.content?.trim() || "";
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;

        // Record successful AIUsage
        await this.recordTutorUsage({
          userId,
          projectId,
          model: usedModel,
          latency,
          inputTokens,
          outputTokens,
          success: true,
        });
      } catch (err) {
        const latency = Date.now() - startTime;
        await this.recordTutorUsage({
          userId,
          projectId,
          model: usedModel,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });
        const customErr = new Error(`AI Tutor generation failed: ${err.message}`);
        customErr.statusCode = err.status === 429 || err.statusCode === 429 ? 429 : 500;
        throw customErr;
      }
    } else {
      // Local fallback for offline/test environments without Groq API key
      answer = `Based on your materials in ${project.name}:\n\n${retrievalResult.context
        .split("\n\n---\n\n")[0]
        .replace(/^SOURCE \d+\nMaterial:[^\n]+\nPage\(s\):[^\n]+\nContent:\n/, "")
        .slice(0, 300)}...`;
      outputTokens = Math.ceil(answer.length / 4);
    }

    // Check if the model itself explicitly stated insufficient info
    let supported = true;
    if (
      /couldn't find enough information|do not provide enough information|materials do not mention/i.test(
        answer
      ) &&
      answer.length < 150
    ) {
      supported = false;
    }

    // 8. Extract verified citations based on LLM output and sourceUnits
    const sourceUnits = retrievalResult.sourceUnits || retrievalResult.sources || [];
    const { verifiedSources, resolvedAnswer } = this.processCitationsAndAnswer(
      sourceUnits,
      answer,
      supported
    );

    // 10. Append messages to Conversation and persist to MongoDB
    conversation.messages.push({
      role: "user",
      content: cleanMessage,
    });
    conversation.messages.push({
      role: "assistant",
      content: resolvedAnswer,
      sources: verifiedSources,
    });
    await conversation.save();

    await activityService.recordActivity({
      userId,
      projectId,
      type: "TUTOR_MESSAGE",
      metadata: {
        conversationId: conversation._id,
        question: cleanMessage.slice(0, 100),
        supported,
      },
    });

    const assistantMessage =
      conversation.messages[conversation.messages.length - 1];

    return {
      conversationId: conversation._id.toString(),
      messageId: assistantMessage._id,
      answer: resolvedAnswer,
      supported,
      sources: verifiedSources,
    };
  }

  /**
   * Process LLM answer, map cited sourceIds (e.g. [S1], [S2]) to sequential inline markers ([1], [2]),
   * extract exact supporting page provenance from sourceSegments, and append clickable Sources section.
   */
  processCitationsAndAnswer(sourceUnits = [], rawAnswer = "", supported = true) {
    if (!supported || !rawAnswer) {
      return { verifiedSources: [], resolvedAnswer: rawAnswer };
    }

    // Identify which source IDs were referenced in the LLM's text (supports [S1], [S1, S2], (S1), etc.)
    const citedSourceIds = [];
    const sourceMatches = String(rawAnswer).match(/\[([S\d+,\s&]+)\]/gi) || [];
    for (const match of sourceMatches) {
      const sids = match.match(/S\d+/gi) || [];
      for (const sid of sids) {
        const normalized = sid.toUpperCase();
        if (!citedSourceIds.includes(normalized)) {
          citedSourceIds.push(normalized);
        }
      }
    }
    const parenMatches = String(rawAnswer).match(/\((S\d+)\)/gi) || [];
    for (const match of parenMatches) {
      const sid = match.replace(/[()]/g, "").toUpperCase();
      if (!citedSourceIds.includes(sid)) {
        citedSourceIds.push(sid);
      }
    }

    let citedUnits = [];
    if (citedSourceIds.length > 0) {
      for (const sid of citedSourceIds) {
        const found = sourceUnits.find(
          (u) => (u.sourceId || "").toUpperCase() === sid
        );
        if (found && !citedUnits.some((cu) => cu.sourceId === found.sourceId)) {
          citedUnits.push(found);
        }
      }
    } else if (sourceUnits.length > 0) {
      // Fallback: if LLM answered without source tags, pick the top-scoring source unit
      citedUnits = [sourceUnits[0]];
    }

    if (citedUnits.length === 0) {
      return { verifiedSources: [], resolvedAnswer: this.cleanAnswerText(rawAnswer) };
    }

    // Deduplicate cited units by unique document page: (materialId + exactPage)
    // Multiple chunks or segments on the same page share the same citationIndex and single verifiedSource card
    const sourceMap = new Map();
    const pageIndexMap = new Map();
    const verifiedSources = [];

    for (const su of citedUnits) {
      const exactPage = parseInt(su.page, 10) || 1;
      const matIdStr = su.materialId ? String(su.materialId) : (su.materialName || "document");
      const pageKey = `${matIdStr}_${exactPage}`;
      const sIdUpper = (su.sourceId || "").toUpperCase();

      if (pageIndexMap.has(pageKey)) {
        // Page already registered — reuse existing citationIndex
        const existingIndex = pageIndexMap.get(pageKey);
        if (sIdUpper) {
          sourceMap.set(sIdUpper, existingIndex);
        }
        const existingSource = verifiedSources.find((vs) => vs.citationIndex === existingIndex);
        if (existingSource && su.text && existingSource.sourceExcerpt.length < 200) {
          const combined = `${existingSource.sourceExcerpt} ... ${su.text.trim()}`.slice(0, 300);
          existingSource.sourceExcerpt = combined;
        }
      } else {
        // First chunk/segment for this document page
        const citationIndex = verifiedSources.length + 1;
        pageIndexMap.set(pageKey, citationIndex);
        if (sIdUpper) {
          sourceMap.set(sIdUpper, citationIndex);
        }

        const citation = `${su.materialName || "Document"} — Page ${exactPage}`;

        verifiedSources.push({
          id: su.sourceId || `S${citationIndex}`,
          sourceId: su.sourceId || `S${citationIndex}`,
          citationIndex,
          materialId: su.materialId,
          materialName: su.materialName || "Document",
          page: exactPage,
          fileUrl: su.fileUrl || "",
          citation,
          sourceExcerpt: (su.text || "").slice(0, 300),
          chunkId: su.chunkId,
        });
      }
    }

    // Also map any remaining sourceUnits in pool that share the same document page
    for (const su of sourceUnits) {
      const sIdUpper = (su.sourceId || "").toUpperCase();
      if (!sIdUpper || sourceMap.has(sIdUpper)) continue;

      const exactPage = parseInt(su.page, 10) || 1;
      const matIdStr = su.materialId ? String(su.materialId) : (su.materialName || "document");
      const pageKey = `${matIdStr}_${exactPage}`;

      if (pageIndexMap.has(pageKey)) {
        sourceMap.set(sIdUpper, pageIndexMap.get(pageKey));
      }
    }

    // Replace [S1], [S2], [S1, S2] in answer text with clean inline citations like [1], [2]
    let formattedText = rawAnswer.replace(/\[([S\d+,\s&]+)\]/gi, (match, inner) => {
      const sids = inner.match(/S\d+/gi);
      if (!sids || sids.length === 0) return match;

      const indices = [];
      for (const sid of sids) {
        const idx = sourceMap.get(sid.toUpperCase());
        if (idx && !indices.includes(idx)) {
          indices.push(idx);
        }
      }

      if (indices.length === 0) return "";
      return indices.map((i) => `[${i}]`).join(", ");
    });

    // Also replace any (S1) or (S2) citations
    formattedText = formattedText.replace(/\((S\d+)\)/gi, (match, sid) => {
      const idx = sourceMap.get(sid.toUpperCase());
      return idx ? `[${idx}]` : "";
    });

    // Clean answer text: remove any accidental Sources section, raw URLs, SVGs, etc.
    const resolvedAnswer = this.cleanAnswerText(formattedText);

    return {
      verifiedSources,
      resolvedAnswer,
    };
  }

  /**
   * Clean accidental model artifacts from answer text before persisting or rendering.
   * Preserves genuine Markdown (headings, code blocks, lists, tables, bold, italics).
   */
  cleanAnswerText(text = "") {
    if (!text || typeof text !== "string") return "";

    let cleaned = text;

    // 1. Strip any accidental markdown Sources / References / Citations section at the end
    cleaned = cleaned.replace(/\n\s*#{1,4}\s*(Sources|Citations|References)\b[\s\S]*$/i, "");

    // 2. Remove [Source: ...] or (Source: ...) or [Sources: ...]
    cleaned = cleaned.replace(/\[\s*Sources?:\s*[^\]]*\]/gi, "");
    cleaned = cleaned.replace(/\(\s*Sources?:\s*[^)]*\)/gi, "");

    // 3. Remove raw Cloudinary or PDF URLs
    cleaned = cleaned.replace(/https?:\/\/res\.cloudinary\.com\/[^\s\)]+/gi, "");
    cleaned = cleaned.replace(/https?:\/\/[^\s\)]+\.pdf(?:#[^\s\)]*)?/gi, "");

    // 4. Clean up any raw markdown links created for sources like [1](http...), [Source](http...)
    cleaned = cleaned.replace(/\[(\d+|Source)\]\((?:https?:\/\/[^\)]+|#page=\d+)\)/gi, (match, p1) => {
      return /^\d+$/.test(p1) ? `[${p1}]` : "";
    });

    // 5. Remove HTML/SVG markup artifacts (e.g. <svg>...</svg>, <svg>, <div>, etc.)
    cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, "");
    cleaned = cleaned.replace(/<\/?(?:svg|path|g|div|span|p|br|hr)[^>]*>/gi, "");
    cleaned = cleaned.replace(/\bsvg\b(?=\s*[\/>])/gi, "");

    // 6. Clean dangling separator lines at the end of text (e.g. "---" or "___")
    cleaned = cleaned.replace(/(\r?\n|\r)\s*[-_*]{3,}\s*$/g, "");

    // 7. Remove duplicate inline citations like [1, 1] -> [1] and [1][1], [1] [1], [1], [1], [1] and [1] -> [1]
    cleaned = cleaned.replace(/\[(\d+)(?:\s*,\s*\1)+\]/g, "[$1]");
    cleaned = cleaned.replace(/(\[\d+\])(?:\s*(?:,|and|&)?\s*\1)+/gi, "$1");

    // 8. Normalize spacing and linebreaks
    cleaned = cleaned
      .replace(/[ \t]+$/gm, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ +([.,;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned;
  }

  /**
   * Determine whether retrieved evidence is sufficient to ground an answer
   */
  isEvidenceSufficient(query, retrievedChunks) {
    if (!retrievedChunks || retrievedChunks.length === 0) return false;

    const topChunk = retrievedChunks[0];
    if (topChunk.score >= this.relevanceThreshold) return true;

    // Filter out common conversational stop words
    const stopWords = new Set([
      "what", "is", "the", "how", "does", "and", "or", "to", "in", "of", "a", "an",
      "for", "with", "on", "by", "explain", "describe", "tell", "me", "about",
      "can", "you", "which", "are", "why", "it", "its", "please", "relate"
    ]);

    const queryTerms = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    if (queryTerms.length === 0) return false;

    // Check if query keywords appear in the retrieved chunks
    const combinedText = retrievedChunks
      .slice(0, 3)
      .map((c) => c.text.toLowerCase())
      .join(" ");

    const hasMatch = queryTerms.some((term) => combinedText.includes(term));
    return hasMatch;
  }

  /**
   * Extract clean citation STRICTLY for only a SINGLE page representing the TOP PRIORITY source
   */
  extractCitations(chunks, answerText = "") {
    if (!chunks || chunks.length === 0) return [];

    // Chunks are already ordered by similarity score descending (top priority first)
    const citedSourceIds = new Set();
    const sourceIdMatches = String(answerText || "").match(/\[(S\d+)\]/gi);
    if (sourceIdMatches) {
      for (const m of sourceIdMatches) {
        citedSourceIds.add(m.replace(/[\[\]]/g, "").toUpperCase());
      }
    }

    // Identify top-priority chunk:
    // 1. Highest-ranking chunk that was cited by the LLM (e.g. S1)
    // 2. Fallback to chunks[0] (top retrieval similarity score)
    let topChunk = null;
    if (citedSourceIds.size > 0) {
      topChunk = chunks.find((c, idx) => {
        const sId = (c.sourceId || `S${idx + 1}`).toUpperCase();
        return citedSourceIds.has(sId);
      });
    }

    if (!topChunk && chunks.length > 0) {
      topChunk = chunks[0];
    }

    if (!topChunk) return [];

    const materialName = topChunk.materialName || "Document";
    const exactPage = parseInt(
      topChunk.exactPage || topChunk.page || (topChunk.pages && topChunk.pages[0]) || 1,
      10
    );
    const sourceId = topChunk.sourceId || "S1";

    // Return strictly ONE citation for the single top-priority page
    return [
      {
        sourceId,
        materialName,
        page: exactPage,
        citation: `${materialName} — Page ${exactPage}`,
      },
    ];
  }

  /**
   * Format source citation for Conversation.messages.sources schema
   * STRICTLY returns only the single top-priority source entry.
   */
  formatSourcesForDb(chunks, verifiedSources = []) {
    if (!verifiedSources || verifiedSources.length === 0 || !chunks || chunks.length === 0) {
      return [];
    }

    const topVerified = verifiedSources[0];
    const topChunk =
      chunks.find((c, idx) => {
        const sId = (c.sourceId || `S${idx + 1}`).toUpperCase();
        return sId === topVerified.sourceId?.toUpperCase();
      }) || chunks[0];

    const materialName = topChunk.materialName || topVerified.materialName || "Document";
    const exactPage = topVerified.page;

    return [
      {
        sourceId: topVerified.sourceId || "S1",
        materialId: topChunk.materialId,
        materialName,
        page: exactPage,
        citation: topVerified.citation || `${materialName} — Page ${exactPage}`,
        chunkId: topChunk._id,
      },
    ];
  }

  /**
   * Assemble LLM prompt messages with system instructions, limited conversation history, and grounded context
   */
  buildPromptMessages(conversation, ragContext, currentQuery) {
    const systemInstruction = `You are a world-class AI Study Tutor.
Explain concepts clearly, naturally, and pedagogically based on the user's project learning materials, in the polished and natural style of ChatGPT.

RESPONSE STYLE & CHATGPT-LIKE FLOW:
1. Short Direct Answer First: Begin immediately with a crisp, direct 1-2 sentence core answer. Avoid unnecessary repetition, meta-commentary, or long introductory fluff (never say "Based on the provided documents..." or "In this lesson...").
2. Natural Explanatory Flow:
   - Direct Answer: High-level core summary.
   - Core Explanation: Short, readable paragraphs (2-3 sentences each). Do not write monolithic walls of text.
   - Examples & Steps: Use numbered steps for processes or algorithms, and clean bullet points for lists. Provide a concrete example when helpful.
   - Key Takeaways: Use **bold** for key terminology and critical takeaways.
3. Tables & Code:
   - Use Markdown tables ONLY when comparing concepts or presenting structured data that genuinely benefits from tabular layout.
   - Format technical syntax with proper Markdown code blocks including language identifiers (e.g. \`\`\`python, \`\`\`javascript) and inline code (\`variable\`) for functions, variables, and parameters.
4. Adaptive Depth:
   - Concise and crisp for simple/factual questions.
   - Structured and thorough for complex questions. Do not force every section onto simple questions.
   - Do not make every answer sound like an academic paper.

STRICT CITATION RULES (DO NOT VIOLATE):
- Answer PRIMARILY using the provided "Retrieved Learning Materials Context".
- Cite source IDs inline like [S1] or [S2] immediately after claims/facts grounded by that source.
- Only cite source IDs present in the context that directly support the claim.
- NEVER invent or write page numbers or URLs in your text.
- CRITICAL: NEVER output a "### Sources", "References", or "Citations" heading or section at the end. Sources are displayed separately by the user interface.
- NEVER output raw Cloudinary URLs, PDF links, or markdown links to files.
- NEVER output raw HTML or SVG markup tags.
- If the retrieved materials do not provide enough information to answer confidently, state:
"I couldn't find enough information in this Project's learning materials to answer that confidently."`;

    const messages = [{ role: "system", content: systemInstruction }];

    // Add recent conversation history (last maxHistoryMessages) for multi-turn continuity
    const history = conversation.messages.slice(-this.maxHistoryMessages);
    for (const msg of history) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    // Add current query with grounded retrieval context
    const userPromptWithContext = `[Retrieved Learning Materials Context]:
${ragContext}

[User Question]:
${currentQuery}

Please provide a clear, grounded explanation answering the user's question, citing source IDs like [S1] or [S2] where applicable:`;

    messages.push({
      role: "user",
      content: userPromptWithContext,
    });

    return messages;
  }

  /**
   * Record AIUsage audit entry with feature='TUTOR'
   */
  async recordTutorUsage({ userId, projectId, model, latency, inputTokens, outputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "TUTOR",
        model,
        latency,
        inputTokens,
        outputTokens,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[TutorService] Failed to record AIUsage: ${err.message}`);
    }
  }

  /**
   * Fetch conversation history for user and project
   */
  async getConversation(conversationId, userId) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
    }).lean();

    if (!conversation) {
      const err = new Error("Conversation not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    return conversation;
  }

  /**
   * Fetch all conversations for a specific project
   */
  async getProjectConversations(projectId, userId) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    const conversations = await Conversation.find({
      projectId,
      userId,
    })
      .select("_id title createdAt updatedAt messages")
      .sort({ updatedAt: -1 })
      .lean();

    return conversations.map((c) => ({
      _id: c._id.toString(),
      title: c.title || "Untitled Chat",
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
    }));
  }

  /**
   * Fetch the most recent conversation for a project
   */
  async getLatestConversation(projectId, userId) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    const conversation = await Conversation.findOne({
      projectId,
      userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return conversation;
  }
}

module.exports = new TutorService();
