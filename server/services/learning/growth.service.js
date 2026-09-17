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

    // 2. Fetch concepts, current masteries, and historical snapshots
    const [concepts, masteries, histories] = await Promise.all([
      Concept.find({ projectId }).lean(),
      Mastery.find({ userId, projectId }).lean(),
      MasteryHistory.find({ userId, projectId }).sort({ createdAt: 1 }).lean(),
    ]);

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
        confidence: mastery ? mastery.confidence : 0,
        lastEvidence: mastery ? mastery.lastEvidence : null,
        lastAssessedAt: mastery ? mastery.lastAssessedAt : null,
        historyCount: historyList.length,
      };

      // Classification Logic:
      // - Requiring Attention: currentScore < 50 OR delta <= -5 (regression)
      // - Improving: delta >= +5 (meaningful improvement)
      // - Stable: currentScore >= 50 and delta between -4 and +4
      if (currentScore < 50 || delta <= -5) {
        item.status = "Requiring Attention";
        item.reason =
          currentScore < 50
            ? "Mastery score below proficiency threshold (50%)"
            : `Declining trend (${delta} pts from baseline)`;
        requiringAttention.push(item);
      } else if (delta >= 5) {
        item.status = "Improving";
        item.reason = `Positive growth of +${delta} pts from baseline`;
        improving.push(item);
      } else {
        item.status = "Stable";
        item.reason = "Consistent performance at proficiency level";
        stable.push(item);
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
      },
      improving,
      stable,
      requiringAttention,
      recentTrends,
    };
  }
}

module.exports = new GrowthService();
