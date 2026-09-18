const mongoose = require("mongoose");
const Project = require("../../models/Project");
const Concept = require("../../models/Concept");
const Mastery = require("../../models/Mastery");
const MasteryHistory = require("../../models/MasteryHistory");

/**
 * Growth Analysis Service
 *
 * Analyzes historical mastery snapshots to classify concepts into:
 *  - Improving (upward score progression)
 *  - Stable (consistent performance at or above threshold)
 *  - Requiring Attention (score < 50 or declining trajectory)
 */
class GrowthService {
  /**
   * Compute project growth analysis
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @returns {Promise<Object>} Structured growth analysis
   */
  async getProjectGrowth({ userId, projectId }) {
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

    const knowledgeService = require("../documents/knowledge.service");

    // 2. Fetch concepts, current masteries, and historical snapshots
    let [concepts, masteries, histories] = await Promise.all([
      knowledgeService.getConceptsByProject(projectId),
      Mastery.find({ userId, projectId }).lean(),
      MasteryHistory.find({ userId, projectId }).sort({ createdAt: 1 }).lean(),
    ]);

    // On-demand concept generation if no concepts exist yet for this project
    if (!concepts || concepts.length === 0) {
      const generated = await knowledgeService.generateConceptsOnDemand({
        projectId,
        userId,
      }).catch((err) => {
        console.warn(`[GrowthService] On-demand concept generation note: ${err.message}`);
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

    const historyByConcept = new Map();
    for (const h of histories) {
      const cid = h.conceptId.toString();
      if (!historyByConcept.has(cid)) {
        historyByConcept.set(cid, []);
      }
      historyByConcept.get(cid).push(h);
    }

    // 3. Classify concepts based on score changes and thresholds
    const improving = [];
    const stable = [];
    const requiringAttention = [];
    const unassessed = [];
    const recentTrends = [];

    let totalScoreSum = 0;
    let assessedCount = 0;

    for (const concept of concepts) {
      const cid = concept._id.toString();
      const mastery = masteryMap.get(cid);
      const historyList = historyByConcept.get(cid) || [];

      const currentScore = mastery ? mastery.score : 0;
      if (mastery) {
        totalScoreSum += currentScore;
        assessedCount++;
      }

      // Determine baseline and recent previous scores
      const historyScores = historyList.map((h) => h.score);
      const baselineScore = historyScores.length > 0 ? historyScores[0] : currentScore;
      const previousScore = historyScores.length > 0 ? historyScores[historyScores.length - 1] : currentScore;
      const delta = currentScore - baselineScore;

      const item = {
        conceptId: concept._id,
        conceptName: concept.name,
        importance: concept.importance || 3,
        currentScore,
        previousScore,
        baselineScore,
        delta,
        scoreChange: delta,
        confidence: mastery ? mastery.confidence : 0,
        lastEvidence: mastery ? mastery.lastEvidence : null,
        lastAssessedAt: mastery ? mastery.lastAssessedAt : null,
        historyCount: historyList.length,
        isAssessed: !!mastery,
      };

      // Classification Logic:
      // - Unassessed: no assessment/quiz history yet
      // - Improving: currentScore >= 70 OR positive growth delta >= 5
      // - Stable: currentScore between 50 and 69 with non-negative trajectory
      // - Requiring Attention: currentScore < 50 OR delta <= -5 (regression)
      if (!mastery) {
        item.status = "Unassessed";
        item.reason = "Not assessed yet. Complete a quiz to evaluate.";
        unassessed.push(item);
      } else if (currentScore >= 70 || delta >= 5) {
        item.status = "Improving";
        item.reason =
          delta >= 5
            ? `Positive growth of +${delta} pts from baseline`
            : `High conceptual mastery (${currentScore}%)`;
        improving.push(item);
      } else if (currentScore >= 50 && delta > -5) {
        item.status = "Stable";
        item.reason = "Consistent performance at proficiency level";
        stable.push(item);
      } else {
        item.status = "Requiring Attention";
        item.reason =
          currentScore < 50
            ? `Mastery score (${currentScore}%) below proficiency threshold (50%)`
            : `Declining trend (${delta} pts from baseline)`;
        requiringAttention.push(item);
      }

      recentTrends.push({
        conceptId: concept._id,
        conceptName: concept.name,
        currentScore,
        trend: item.status,
        snapshots: historyList.map((h) => ({
          score: h.score,
          source: h.source,
          timestamp: h.createdAt,
        })),
      });
    }

    const averageMastery = assessedCount > 0 ? Math.round(totalScoreSum / assessedCount) : 0;

    // 4. Compute data-driven Next Step recommendation
    let nextStep = null;
    if (concepts.length === 0) {
      nextStep = {
        type: "upload_material",
        action: "materials",
        title: "Upload Study Materials",
        description: "Add a PDF document to extract concepts, generate embeddings, and unlock grounded AI tutoring.",
        reason: "No learning materials or target concepts exist yet for this project.",
        badge: "Initial Step",
        priority: 1,
      };
    } else if (requiringAttention.length > 0) {
      const target = requiringAttention[0];
      nextStep = {
        type: "review_weak_concept",
        action: "tutor",
        title: `Review Weak Concept: ${target.conceptName}`,
        description: `Your mastery in "${target.conceptName}" is at ${target.currentScore}%. Review foundational definitions and explanations with the AI Tutor.`,
        reason: target.reason || "Concept requires retention reinforcement based on recent evaluation.",
        targetConcept: target.conceptName,
        badge: "Weak Area",
        priority: 2,
      };
    } else if (unassessed.length > 0) {
      const target = unassessed[0];
      nextStep = {
        type: "take_focused_quiz",
        action: "quiz",
        title: `Evaluate "${target.conceptName}" in a Quiz`,
        description: `You have ${unassessed.length} unassessed concept${unassessed.length === 1 ? "" : "s"}. Take an adaptive quiz to baseline your knowledge and track growth.`,
        reason: "Unassessed target concept ready for evaluation.",
        targetConcept: target.conceptName,
        badge: "Recommended",
        priority: 3,
      };
    } else if (averageMastery >= 75) {
      nextStep = {
        type: "challenge_quiz",
        action: "quiz",
        title: "Take a Comprehensive Challenge Quiz",
        description: `Great progress! You have achieved an average mastery of ${averageMastery}%. Test your full retention across all project concepts.`,
        reason: "High mastery achieved across all assessed concepts.",
        badge: "Mastery Challenge",
        priority: 4,
      };
    } else {
      nextStep = {
        type: "deepen_understanding",
        action: "tutor",
        title: "Deepen Concept Comprehension with Tutor",
        description: "Engage in an interactive pedagogical session with your AI Tutor to strengthen conceptual connections.",
        reason: "Steady learning progression underway.",
        badge: "Next Step",
        priority: 5,
      };
    }

    return {
      projectId: project._id,
      projectName: project.name,
      summary: {
        totalConcepts: concepts.length,
        assessedConcepts: assessedCount,
        unassessedConcepts: concepts.length - assessedCount,
        averageMastery,
        improvingCount: improving.length,
        stableCount: stable.length,
        requiringAttentionCount: requiringAttention.length,
        unassessedCount: unassessed.length,
      },
      nextStep,
      improving,
      stable,
      requiringAttention,
      unassessed,
      recentTrends,
    };
  }
}

module.exports = new GrowthService();
