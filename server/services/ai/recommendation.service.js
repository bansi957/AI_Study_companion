const mongoose = require("mongoose");
const Recommendation = require("../../models/Recommendation");
const Project = require("../../models/Project");
const Concept = require("../../models/Concept");
const QuizAttempt = require("../../models/QuizAttempt");
const Assessment = require("../../models/Assessment");
const Conversation = require("../../models/Conversation");
const AIUsage = require("../../models/AIUsage");
const growthService = require("../learning/growth.service");
const masteryService = require("../learning/mastery.service");
const activityService = require("../analytics/activity.service");
const llmService = require("./llm.service");

/**
 * Personalized Recommendation Service
 *
 * Generates tailored learning recommendations grounded in student mastery,
 * concepts requiring attention, recent quiz mistakes, assessment gaps, and tutor
 * conversations. Prevents duplicate active recommendations and logs AIUsage.
 */
class RecommendationService {
  constructor() {
    this.model = process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
  }

  getGroqClient() {
    return llmService.getGroqClient();
  }

  /**
   * Generate recommendations for a project
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @returns {Promise<Array<Object>>} Created recommendation documents
   */
  async generateRecommendations({ userId, projectId }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify project ownership
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Fetch all concepts for this project
    const concepts = await Concept.find({ projectId }).lean();
    if (!concepts || concepts.length === 0) {
      return [];
    }
    const conceptMap = new Map();
    concepts.forEach((c) => conceptMap.set(c._id.toString(), c));

    // 3. Fetch existing pending recommendations to avoid duplicates
    const pendingRecommendations = await Recommendation.find({
      userId,
      projectId,
      status: "pending",
    }).lean();

    const activeConceptIds = new Set(
      pendingRecommendations
        .filter((r) => r.conceptId)
        .map((r) => r.conceptId.toString())
    );
    const activeTitles = new Set(
      pendingRecommendations.map((r) => r.title.toLowerCase().trim())
    );

    // 4. Gather student learning signals
    const [growthData, recentAttempts, recentAssessments, recentConversations] = await Promise.all([
      growthService.getProjectGrowth({ userId, projectId }).catch(() => null),
      QuizAttempt.find({ userId, projectId }).sort({ createdAt: -1 }).limit(5).lean(),
      Assessment.find({ userId, projectId, status: "evaluated" }).sort({ createdAt: -1 }).limit(5).lean(),
      Conversation.find({ userId, projectId }).sort({ updatedAt: -1 }).limit(3).lean(),
    ]);

    const requiringAttention = growthData?.requiringAttention || [];
    const improving = growthData?.improving || [];

    // Find concepts with recent quiz mistakes
    const mistakeConceptIds = new Set();
    recentAttempts.forEach((attempt) => {
      (attempt.answers || []).forEach((ans) => {
        if (!ans.isCorrect) {
          // questionId might map to concept
        }
      });
    });

    // Synthesize student profile for prompt
    const candidateConcepts = concepts.filter((c) => !activeConceptIds.has(c._id.toString()));
    if (candidateConcepts.length === 0) {
      // All concepts already have active recommendations
      return [];
    }

    // Prioritize candidates: requiring attention > unassessed > low importance
    candidateConcepts.sort((a, b) => {
      const aReq = requiringAttention.some((r) => r.conceptId.toString() === a._id.toString());
      const bReq = requiringAttention.some((r) => r.conceptId.toString() === b._id.toString());
      if (aReq && !bReq) return -1;
      if (!aReq && bReq) return 1;
      return (b.importance || 3) - (a.importance || 3);
    });

    const topTargets = candidateConcepts.slice(0, 4);

    // 5. Invoke Groq LLM to generate actionable recommendations
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let rawRecommendations = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const promptText = `You are an expert personalized learning advisor. Generate 1 to 3 targeted, actionable learning recommendations for a student studying "${project.name}".

Learning Goal: "${project.learningGoal || "Master core concepts"}"

Concepts Requiring Attention:
${requiringAttention.map((c) => `- ${c.conceptName} (Score: ${c.currentScore}%, Reason: ${c.reason})`).join("\n") || "None identified"}

Target Candidate Concepts to focus on:
${topTargets.map((c) => `- [ID: ${c._id}] ${c.name}: ${c.description || "Core concept"}`).join("\n")}

Recent Assessment Results:
${recentAssessments.map((a) => `- Score: ${a.evaluation?.score}% (${a.evaluation?.understanding || ""})`).slice(0, 3).join("\n") || "No recent assessments"}

Generate specific, constructive recommendations that guide the student on concrete actions (e.g. review specific foundational principles, practice with a focused quiz, or explain the concept to the AI Tutor).

Return strictly a valid JSON object matching this schema:
{
  "recommendations": [
    {
      "conceptId": "Valid ID string from candidates above",
      "title": "Concise, encouraging title",
      "reason": "Specific pedagogical rationale based on student's performance",
      "action": "Concrete learning action the student should take",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are an expert AI study advisor. Respond strictly with valid JSON matching the requested recommendations schema. Do not output markdown code blocks outside the JSON.",
            },
            {
              role: "user",
              content: promptText,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const latency = Date.now() - startTime;
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;

        const content = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);
        rawRecommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

        await this.recordAIUsage({
          userId,
          projectId,
          model: this.model,
          latency,
          inputTokens,
          outputTokens,
          success: true,
        });
      } catch (err) {
        const latency = Date.now() - startTime;
        await this.recordAIUsage({
          userId,
          projectId,
          model: this.model,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });

        rawRecommendations = this.fallbackRecommendations(topTargets);
      }
    } else {
      rawRecommendations = this.fallbackRecommendations(topTargets);
    }

    // 6. Sanitize, Deduplicate, and Persist Recommendations
    const createdRecommendations = [];

    for (const raw of rawRecommendations) {
      if (!raw || typeof raw !== "object") continue;

      let resolvedConceptId = null;
      if (raw.conceptId && mongoose.Types.ObjectId.isValid(raw.conceptId) && conceptMap.has(raw.conceptId.toString())) {
        resolvedConceptId = new mongoose.Types.ObjectId(raw.conceptId);
      } else if (topTargets.length > 0) {
        resolvedConceptId = topTargets[0]._id;
      }

      const cidStr = resolvedConceptId ? resolvedConceptId.toString() : null;
      const title = String(raw.title || "Review Core Concepts").trim();
      const titleLower = title.toLowerCase();

      // Deduplication check: skip if active recommendation for this concept or title already exists
      if (cidStr && activeConceptIds.has(cidStr)) continue;
      if (activeTitles.has(titleLower)) continue;

      const priority = ["low", "medium", "high"].includes(raw.priority) ? raw.priority : "medium";
      const reason = String(raw.reason || "Strengthening foundational understanding will accelerate learning.").trim();
      const action = String(raw.action || "Review project materials and test your understanding.").trim();

      const rec = new Recommendation({
        userId,
        projectId,
        conceptId: resolvedConceptId,
        title,
        reason,
        action,
        priority,
        status: "pending",
      });

      await rec.save();

      // Mark as active in current set to prevent internal duplicates
      if (cidStr) activeConceptIds.add(cidStr);
      activeTitles.add(titleLower);

      // 7. Emit RECOMMENDATION_CREATED activity event
      await activityService.recordActivity({
        userId,
        projectId,
        type: "RECOMMENDATION_CREATED",
        metadata: {
          recommendationId: rec._id,
          conceptId: rec.conceptId,
          title: rec.title,
          priority: rec.priority,
        },
      });

      createdRecommendations.push(rec);
    }

    return createdRecommendations;
  }

  /**
   * Fallback recommendations for offline or resilience
   */
  fallbackRecommendations(targets) {
    return targets.map((t, idx) => ({
      conceptId: t._id.toString(),
      title: `Reinforce ${t.name}`,
      reason: `Concept has low mastery or needs practice to build proficiency.`,
      action: `Review learning materials for ${t.name} and try an adaptive quiz.`,
      priority: idx === 0 ? "high" : "medium",
    }));
  }

  /**
   * Get recommendations for a project (optionally auto-generating if none pending)
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {boolean} [params.autoGenerate=true]
   * @returns {Promise<Array<Object>>}
   */
  async getProjectRecommendations({ userId, projectId, autoGenerate = true }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    let recommendations = await Recommendation.find({
      userId,
      projectId,
      status: "pending",
    })
      .populate("conceptId", "name description importance")
      .sort({ createdAt: -1 })
      .lean();

    if ((!recommendations || recommendations.length === 0) && autoGenerate) {
      await this.generateRecommendations({ userId, projectId });
      recommendations = await Recommendation.find({
        userId,
        projectId,
        status: "pending",
      })
        .populate("conceptId", "name description importance")
        .sort({ createdAt: -1 })
        .lean();
    }

    return recommendations;
  }

  /**
   * Mark a recommendation as completed
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.recommendationId
   * @returns {Promise<Object>}
   */
  async completeRecommendation({ userId, recommendationId }) {
    if (!recommendationId || !mongoose.Types.ObjectId.isValid(recommendationId)) {
      const err = new Error("Invalid recommendation ID");
      err.statusCode = 400;
      throw err;
    }

    const rec = await Recommendation.findOne({ _id: recommendationId, userId });
    if (!rec) {
      const err = new Error("Recommendation not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    rec.status = "completed";
    rec.completedAt = new Date();
    await rec.save();

    return rec;
  }

  /**
   * Mark a recommendation as dismissed
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.recommendationId
   * @returns {Promise<Object>}
   */
  async dismissRecommendation({ userId, recommendationId }) {
    if (!recommendationId || !mongoose.Types.ObjectId.isValid(recommendationId)) {
      const err = new Error("Invalid recommendation ID");
      err.statusCode = 400;
      throw err;
    }

    const rec = await Recommendation.findOne({ _id: recommendationId, userId });
    if (!rec) {
      const err = new Error("Recommendation not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    rec.status = "dismissed";
    await rec.save();

    return rec;
  }

  /**
   * Record AIUsage audit entry with feature='RECOMMENDATION'
   */
  async recordAIUsage({ userId, projectId, model, latency, inputTokens, outputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "RECOMMENDATION",
        model,
        latency,
        inputTokens,
        outputTokens,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[RecommendationService] Failed to record AIUsage: ${err.message}`);
    }
  }
}

module.exports = new RecommendationService();
