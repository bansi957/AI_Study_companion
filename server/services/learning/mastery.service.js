const mongoose = require("mongoose");
const Mastery = require("../../models/Mastery");
const MasteryHistory = require("../../models/MasteryHistory");
const Concept = require("../../models/Concept");
const Project = require("../../models/Project");
const Activity = require("../../models/Activity");

/**
 * Concept Mastery Service
 *
 * Implements weighted Bayesian / exponential moving update of concept mastery,
 * historical snapshot preservation in MasteryHistory, and Activity event logging.
 */
class MasteryService {
  /**
   * Weights (alpha) for different evidence sources.
   * Qualitative open-ended assessments carry higher weight than MCQ quizzes.
   */
  getWeights() {
    return {
      assessment: 0.40,
      quiz: 0.30,
      tutor: 0.20,
      manual: 0.50,
    };
  }

  /**
   * Record new evidence and update concept mastery
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {string|mongoose.Types.ObjectId} params.conceptId
   * @param {number} [params.score] - Score 0-100 or 0-1
   * @param {boolean} [params.isCorrect] - Boolean correctness (for quizzes)
   * @param {string} [params.source="quiz"] - "quiz" | "assessment" | "tutor" | "manual"
   * @returns {Promise<Object>} Updated Mastery document
   */
  async recordMasteryEvidence({
    userId,
    projectId,
    conceptId,
    score,
    isCorrect,
    source = "quiz",
  }) {
    if (!userId || !projectId || !conceptId) {
      return null;
    }

    const validSources = ["quiz", "assessment", "tutor", "manual"];
    const evidenceSource = validSources.includes(source) ? source : "quiz";

    // 1. Determine normalized evidence score (0-100)
    let evidenceScore;
    if (score !== undefined && score !== null && !isNaN(score)) {
      // If score is a ratio (0 <= score <= 1), scale to 100
      evidenceScore = score <= 1 && score >= 0 && typeof isCorrect === "boolean"
        ? Math.round(score * 100)
        : Math.max(0, Math.min(100, Math.round(Number(score))));
    } else if (typeof isCorrect === "boolean") {
      evidenceScore = isCorrect ? 100 : 20;
    } else {
      evidenceScore = 50;
    }

    try {
      let mastery = await Mastery.findOne({ userId, projectId, conceptId });
      const now = new Date();

      if (!mastery) {
        // Initial baseline assessment
        const initialScore = evidenceScore;
        const initialConfidence = evidenceSource === "assessment" ? 65 : 50;

        mastery = new Mastery({
          userId,
          projectId,
          conceptId,
          score: initialScore,
          confidence: initialConfidence,
          lastEvidence: evidenceSource,
          lastAssessedAt: now,
        });

        await mastery.save();

        // Save initial entry in MasteryHistory
        await MasteryHistory.create({
          userId,
          projectId,
          conceptId,
          score: initialScore,
          source: evidenceSource,
        });

        // Record Activity
        await this.recordActivity({
          userId,
          projectId,
          conceptId,
          previousScore: 0,
          newScore: initialScore,
          source: evidenceSource,
        });

        return mastery;
      }

      // 2. Existing mastery: Preserve previous score in MasteryHistory BEFORE updating
      const previousScore = mastery.score;

      await MasteryHistory.create({
        userId,
        projectId,
        conceptId,
        score: previousScore,
        source: evidenceSource,
      });

      // 3. Compute weighted moving update
      const weights = this.getWeights();
      const alpha = weights[evidenceSource] || 0.30;

      // newScore = round( (1 - alpha) * previousScore + alpha * evidenceScore )
      const calculatedScore = Math.round((1 - alpha) * previousScore + alpha * evidenceScore);
      const newScore = Math.max(0, Math.min(100, calculatedScore));

      // Asymptotic confidence growth towards 100
      const confidenceBoost = evidenceSource === "assessment" ? 8 : 4;
      const newConfidence = Math.min(100, (mastery.confidence || 50) + confidenceBoost);

      mastery.score = newScore;
      mastery.confidence = newConfidence;
      mastery.lastEvidence = evidenceSource;
      mastery.lastAssessedAt = now;

      await mastery.save();

      // 4. Record Activity event for score update
      await this.recordActivity({
        userId,
        projectId,
        conceptId,
        previousScore,
        newScore,
        source: evidenceSource,
      });

      return mastery;
    } catch (error) {
      console.error(`[MasteryService] Failed to record mastery evidence for concept ${conceptId}:`, error.message);
      return null;
    }
  }

  /**
   * Backward-compatible wrapper for quiz evidence
   */
  async recordQuizEvidence({ userId, projectId, conceptId, isCorrect, score, source = "quiz" }) {
    return this.recordMasteryEvidence({
      userId,
      projectId,
      conceptId,
      score: score !== undefined ? (isCorrect ? 100 : 20) : undefined,
      isCorrect,
      source: source || "quiz",
    });
  }

  /**
   * Log MASTERY_UPDATED Activity event
   */
  async recordActivity({ userId, projectId, conceptId, previousScore, newScore, source }) {
    try {
      const concept = await Concept.findConceptById(conceptId);
      await Activity.create({
        userId,
        projectId,
        type: "MASTERY_UPDATED",
        metadata: {
          conceptId,
          conceptName: concept ? concept.name : undefined,
          previousScore,
          newScore,
          source,
        },
      });
    } catch (err) {
      console.warn(`[MasteryService] Failed to record Activity: ${err.message}`);
    }
  }

  /**
   * Get concept-level mastery for a user's project
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @returns {Promise<Array<Object>>}
   */
  async getProjectMastery({ userId, projectId }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    // Verify project ownership
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const knowledgeService = require("../documents/knowledge.service");

    // Fetch concepts and masteries
    let [concepts, masteries] = await Promise.all([
      knowledgeService.getConceptsByProject(projectId),
      Mastery.find({ userId, projectId }).lean(),
    ]);

    // On-demand concept generation if no concepts exist yet for this project
    if (!concepts || concepts.length === 0) {
      const generated = await knowledgeService.generateConceptsOnDemand({
        projectId,
        userId,
      }).catch((err) => {
        console.warn(`[MasteryService] On-demand concept generation note: ${err.message}`);
        return [];
      });
      if (generated && generated.length > 0) {
        concepts = generated;
      }
    }

    const masteryMap = new Map();
    for (const m of masteries) {
      masteryMap.set(m.conceptId.toString(), m);
    }

    const results = concepts.map((concept) => {
      const cid = concept._id.toString();
      const m = masteryMap.get(cid);

      return {
        conceptId: concept._id,
        conceptName: concept.name,
        description: concept.description,
        importance: concept.importance,
        score: m ? m.score : 0,
        confidence: m ? m.confidence : 0,
        lastEvidence: m ? m.lastEvidence : null,
        lastAssessedAt: m ? m.lastAssessedAt : null,
        isAssessed: !!m,
      };
    });

    return results;
  }

  /**
   * Get detailed mastery and history for a single concept
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.conceptId
   * @returns {Promise<Object>}
   */
  async getConceptMastery({ userId, conceptId }) {
    if (!conceptId || !mongoose.Types.ObjectId.isValid(conceptId)) {
      const err = new Error("Invalid concept ID");
      err.statusCode = 400;
      throw err;
    }

    const concept = await Concept.findConceptById(conceptId);
    if (!concept) {
      const err = new Error("Concept not found");
      err.statusCode = 404;
      throw err;
    }

    // Verify project ownership
    const project = await Project.findOne({ _id: concept.projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const [mastery, history] = await Promise.all([
      Mastery.findOne({ userId, projectId: concept.projectId, conceptId }).lean(),
      MasteryHistory.find({ userId, projectId: concept.projectId, conceptId })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    // Trend classification
    const currentScore = mastery ? mastery.score : 0;
    const historyScores = history.map((h) => h.score);
    const baselineScore = historyScores.length > 0 ? historyScores[0] : currentScore;
    const delta = currentScore - baselineScore;

    let trend = "Stable";
    if (currentScore < 50 || delta <= -5) {
      trend = "Requiring Attention";
    } else if (delta >= 5) {
      trend = "Improving";
    }

    return {
      conceptId: concept._id,
      conceptName: concept.name,
      projectId: concept.projectId,
      mastery: currentScore,
      confidence: mastery ? mastery.confidence : 0,
      lastEvidence: mastery ? mastery.lastEvidence : null,
      lastAssessedAt: mastery ? mastery.lastAssessedAt : null,
      history: history.map((h) => ({
        score: h.score,
        source: h.source,
        timestamp: h.createdAt,
      })),
      trend,
    };
  }

  /**
   * Get map of conceptId -> Mastery record for a project
   */
  async getProjectMasteryMap({ userId, projectId }) {
    const masteries = await Mastery.find({ userId, projectId }).lean();
    const masteryMap = new Map();
    for (const m of masteries) {
      masteryMap.set(m.conceptId.toString(), m);
    }
    return masteryMap;
  }
}

module.exports = new MasteryService();
