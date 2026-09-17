const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const Project = require("../../models/Project");
const Conversation = require("../../models/Conversation");
const AIUsage = require("../../models/AIUsage");
const retrievalService = require("../retrieval/retrieval.service");
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
    this.primaryModel = process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
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
    allowDevFallback = false,
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

    // 5. Extract verified citations strictly from chunk metadata
    const verifiedSources = this.extractCitations(retrievedChunks);
    const dbSources = this.formatSourcesForDb(retrievedChunks);

    // 6. Build grounded prompt messages
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
      try {
        const completion = await groq.chat.completions.create({
          model: this.primaryModel,
          messages: promptMessages,
          temperature: 0.2, // low temperature for grounded, factual reasoning
          max_tokens: 1500,
        });

        const latency = Date.now() - startTime;
        answer = completion.choices?.[0]?.message?.content?.trim() || "";
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;

        // Record successful AIUsage
        await this.recordTutorUsage({
          userId,
          projectId,
          model: this.primaryModel,
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
          model: this.primaryModel,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });
        throw new Error(`AI Tutor generation failed: ${err.message}`);
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

    // 8. Append messages to Conversation and persist to MongoDB
    conversation.messages.push({
      role: "user",
      content: cleanMessage,
    });
    conversation.messages.push({
      role: "assistant",
      content: answer,
      sources: dbSources,
    });
    await conversation.save();

    return {
      conversationId: conversation._id.toString(),
      answer,
      supported,
      sources: supported ? verifiedSources : [],
    };
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
   * Extract unique, clean { materialName, page } citations from chunk metadata
   */
  extractCitations(chunks) {
    const citations = [];
    const seen = new Set();

    for (const chunk of chunks) {
      const materialName = chunk.materialName || "Document";
      const pages =
        Array.isArray(chunk.pages) && chunk.pages.length > 0
          ? chunk.pages
          : [chunk.page || 1];

      for (const page of pages) {
        const key = `${materialName}:${page}`;
        if (!seen.has(key)) {
          seen.add(key);
          citations.push({
            materialName,
            page: parseInt(page, 10),
          });
        }
      }
    }

    return citations;
  }

  /**
   * Format source citations for Conversation.messages.sources schema
   */
  formatSourcesForDb(chunks) {
    const dbSources = [];
    const seen = new Set();

    for (const chunk of chunks) {
      const materialName = chunk.materialName || "Document";
      const pages =
        Array.isArray(chunk.pages) && chunk.pages.length > 0
          ? chunk.pages
          : [chunk.page || 1];

      for (const page of pages) {
        const key = `${chunk.materialId}:${page}`;
        if (!seen.has(key)) {
          seen.add(key);
          dbSources.push({
            materialId: chunk.materialId,
            materialName,
            page: parseInt(page, 10),
            chunkId: chunk._id,
          });
        }
      }
    }

    return dbSources;
  }

  /**
   * Assemble LLM prompt messages with system instructions, limited conversation history, and grounded context
   */
  buildPromptMessages(conversation, ragContext, currentQuery) {
    const systemInstruction = `You are an expert AI Study Tutor.
Your goal is to explain concepts clearly, pedagogically, and accurately based on the user's project learning materials.

CRITICAL RULES:
1. Answer PRIMARILY and STRICTLY using the provided "Retrieved Learning Materials Context".
2. Do not fabricate unsupported facts or hallucinate external claims not supported by the context.
3. Do NOT invent citations or page numbers in your text output. Verified citations are attached separately by the system from chunk metadata.
4. If the retrieved materials do not provide enough information to answer the question, state explicitly:
"I couldn't find enough information in this Project's learning materials to answer that confidently."
5. Explain clearly and naturally with pedagogical clarity.`;

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

Please provide a clear, grounded explanation answering the user's question based strictly on the materials above:`;

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
}

module.exports = new TutorService();
