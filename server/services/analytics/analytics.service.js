const mongoose = require("mongoose");
const Space = require("../../models/Space");
const Project = require("../../models/Project");
const Material = require("../../models/Material");
const Quiz = require("../../models/Quiz");
const QuizAttempt = require("../../models/QuizAttempt");
const Assessment = require("../../models/Assessment");
const Concept = require("../../models/Concept");
const Mastery = require("../../models/Mastery");
const MasteryHistory = require("../../models/MasteryHistory");
const Activity = require("../../models/Activity");
const Recommendation = require("../../models/Recommendation");
const growthService = require("../learning/growth.service");

/**
 * Analytics Service
 *
 * Computes deep, progress-oriented analytics for individual Projects
 * and global cross-project learning summaries, including time-based trend
 * series formatted for React / Recharts.
 */
class AnalyticsService {
  /**
   * Format Date to "YYYY-MM-DD"
   */
  formatDateKey(date) {
    const d = new Date(date);
    return d.toISOString().split("T")[0];
  }

  /**
   * Aggregate MasteryHistory records into chronological daily trend points
   */
  buildMasteryTrend(historyRecords) {
    if (!historyRecords || historyRecords.length === 0) return [];

    const dateBuckets = new Map();
    for (const h of historyRecords) {
      if (!h.createdAt) continue;
      const key = this.formatDateKey(h.createdAt);
      if (!dateBuckets.has(key)) {
        dateBuckets.set(key, { total: 0, count: 0 });
      }
      const b = dateBuckets.get(key);
      b.total += Number(h.score) || 0;
      b.count++;
    }

    const sortedKeys = Array.from(dateBuckets.keys()).sort();
    return sortedKeys.map((date) => {
      const b = dateBuckets.get(date);
      return {
        date,
        score: Math.round(b.total / b.count),
        sampleCount: b.count,
      };
    });
  }

  /**
   * Aggregate Activity records into daily count points for timeline charts
   */
  buildActivityTrend(activities) {
    if (!activities || activities.length === 0) return [];

    const dateBuckets = new Map();
    for (const a of activities) {
      if (!a.createdAt) continue;
      const key = this.formatDateKey(a.createdAt);
      dateBuckets.set(key, (dateBuckets.get(key) || 0) + 1);
    }

    const sortedKeys = Array.from(dateBuckets.keys()).sort();
    return sortedKeys.map((date) => ({
      date,
      count: dateBuckets.get(date),
    }));
  }

  /**
   * Get detailed analytics for a single project
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @returns {Promise<Object>} Project analytics payload
   */
  async getProjectAnalytics({ userId, projectId }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify project ownership
    const project = await Project.findOne({ _id: projectId, userId }).lean();
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const pId = new mongoose.Types.ObjectId(projectId);
    const uId = new mongoose.Types.ObjectId(userId);

    // 2. Parallel data fetching scoped strictly to this project & user
    const [
      materials,
      quizzesCount,
      quizAttempts,
      assessments,
      concepts,
      masteries,
      masteryHistories,
      activities,
      growthData,
    ] = await Promise.all([
      Material.find({ projectId: pId, userId: uId }).lean(),
      Quiz.countDocuments({ projectId: pId, userId: uId }),
      QuizAttempt.find({ projectId: pId, userId: uId, completed: true }).lean(),
      Assessment.find({ projectId: pId, userId: uId }).lean(),
      Concept.find({ projectId: pId }).lean(),
      Mastery.find({ projectId: pId, userId: uId }).lean(),
      MasteryHistory.find({ projectId: pId, userId: uId }).sort({ createdAt: 1 }).lean(),
      Activity.find({ projectId: pId, userId: uId }).sort({ createdAt: -1 }).limit(50).lean(),
      growthService.getProjectGrowth({ userId, projectId }).catch(() => null),
    ]);

    // Material metrics
    const totalMaterials = materials.length;
    const processedMaterials = materials.filter((m) => m.status === "READY" || m.status === "PROCESSED").length;

    // Quiz metrics
    const totalQuizzes = quizzesCount;
    const quizAttemptsCount = quizAttempts.length;
    const quizTotalScore = quizAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
    const averageQuizScore = quizAttemptsCount > 0 ? Math.round(quizTotalScore / quizAttemptsCount) : 0;

    // Assessment metrics
    const totalAssessments = assessments.length;
    const evaluatedAssessments = assessments.filter((a) => a.status === "evaluated");
    const assessedScoreSum = evaluatedAssessments.reduce(
      (sum, a) => sum + (a.evaluation && typeof a.evaluation.score === "number" ? a.evaluation.score : 0),
      0
    );
    const averageAssessmentScore = evaluatedAssessments.length > 0
      ? Math.round(assessedScoreSum / evaluatedAssessments.length)
      : 0;

    // Concept & Mastery metrics
    const totalConcepts = concepts.length;
    const masteryScoreSum = masteries.reduce((sum, m) => sum + (Number(m.score) || 0), 0);
    const averageMastery = masteries.length > 0 ? Math.round(masteryScoreSum / masteries.length) : 0;

    // Growth counts
    const improvingConceptsCount = growthData?.summary?.improvingCount || 0;
    const stableConceptsCount = growthData?.summary?.stableCount || 0;
    const attentionConceptsCount = growthData?.summary?.requiringAttentionCount || 0;

    // Recent activity within 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentActivityCount = activities.filter((a) => new Date(a.createdAt) >= sevenDaysAgo).length;

    // Time-based trends for Recharts
    const masteryTrend = this.buildMasteryTrend(masteryHistories);
    const activityTrend = this.buildActivityTrend(activities);

    // Recent activity timeline
    const recentActivityTimeline = activities.slice(0, 15).map((a) => ({
      id: a._id,
      type: a.type,
      metadata: a.metadata || {},
      createdAt: a.createdAt,
    }));

    // Concept breakdown
    const masteryMap = new Map();
    masteries.forEach((m) => masteryMap.set(m.conceptId.toString(), m));

    const conceptsBreakdown = concepts.map((c) => {
      const m = masteryMap.get(c._id.toString());
      return {
        conceptId: c._id,
        name: c.name,
        importance: c.importance || 3,
        score: m ? m.score : 0,
        confidence: m ? m.confidence : 0,
        lastEvidence: m ? m.lastEvidence : null,
      };
    });

    return {
      projectId: project._id,
      projectName: project.name,
      summary: {
        totalMaterials,
        processedMaterials,
        totalQuizzes,
        quizAttempts: quizAttemptsCount,
        averageQuizScore,
        totalAssessments,
        evaluatedAssessments: evaluatedAssessments.length,
        averageAssessmentScore,
        totalConcepts,
        averageMastery,
        improvingConceptsCount,
        stableConceptsCount,
        attentionConceptsCount,
        recentActivityCount,
      },
      assessmentPerformance: {
        total: totalAssessments,
        evaluated: evaluatedAssessments.length,
        averageScore: averageAssessmentScore,
      },
      masteryTrend,
      activityTrend,
      recentActivityTimeline,
      concepts: conceptsBreakdown,
    };
  }

  /**
   * Get global cross-project analytics for the authenticated user
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @returns {Promise<Object>} Global analytics payload
   */
  async getGlobalAnalytics({ userId }) {
    if (!userId) {
      const err = new Error("User ID is required");
      err.statusCode = 400;
      throw err;
    }

    const uId = new mongoose.Types.ObjectId(userId);

    // Parallel queries across all user's spaces and projects
    const [
      totalSpaces,
      totalProjects,
      materials,
      totalQuizzes,
      quizAttempts,
      assessments,
      masteries,
      recommendations,
      masteryHistories,
      activities,
    ] = await Promise.all([
      Space.countDocuments({ userId: uId }),
      Project.countDocuments({ userId: uId }),
      Material.find({ userId: uId }).lean(),
      Quiz.countDocuments({ userId: uId }),
      QuizAttempt.find({ userId: uId, completed: true }).lean(),
      Assessment.find({ userId: uId }).lean(),
      Mastery.find({ userId: uId }).populate("conceptId", "name projectId").lean(),
      Recommendation.find({ userId: uId }).lean(),
      MasteryHistory.find({ userId: uId }).sort({ createdAt: 1 }).lean(),
      Activity.find({ userId: uId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    // Material stats
    const totalMaterials = materials.length;
    const processedMaterials = materials.filter((m) => m.status === "READY" || m.status === "PROCESSED").length;

    // Quiz stats
    const totalQuizAttempts = quizAttempts.length;
    const quizScoreSum = quizAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
    const averageQuizScore = totalQuizAttempts > 0 ? Math.round(quizScoreSum / totalQuizAttempts) : 0;

    // Assessment stats
    const totalAssessments = assessments.length;
    const evaluatedAssessments = assessments.filter((a) => a.status === "evaluated");
    const evalScoreSum = evaluatedAssessments.reduce(
      (sum, a) => sum + (a.evaluation && typeof a.evaluation.score === "number" ? a.evaluation.score : 0),
      0
    );
    const averageAssessmentScore = evaluatedAssessments.length > 0
      ? Math.round(evalScoreSum / evaluatedAssessments.length)
      : 0;

    // Mastery stats
    const masteryScoreSum = masteries.reduce((sum, m) => sum + (Number(m.score) || 0), 0);
    const averageMastery = masteries.length > 0 ? Math.round(masteryScoreSum / masteries.length) : 0;

    // Strongest and weakest concepts
    const sortedMasteries = [...masteries].sort((a, b) => (b.score || 0) - (a.score || 0));

    const strongestConcepts = sortedMasteries.slice(0, 5).map((m) => ({
      conceptId: m.conceptId?._id || m.conceptId,
      conceptName: m.conceptId?.name || "Concept",
      score: m.score,
      confidence: m.confidence,
    }));

    const weakestConcepts = [...sortedMasteries].reverse().slice(0, 5).map((m) => ({
      conceptId: m.conceptId?._id || m.conceptId,
      conceptName: m.conceptId?.name || "Concept",
      score: m.score,
      confidence: m.confidence,
    }));

    // Recommendation stats
    const completedRecommendations = recommendations.filter((r) => r.status === "completed").length;
    const pendingRecommendations = recommendations.filter((r) => r.status === "pending").length;
    const dismissedRecommendations = recommendations.filter((r) => r.status === "dismissed").length;

    // Trend series for Recharts
    const overallMasteryTrend = this.buildMasteryTrend(masteryHistories);
    const activityTrend = this.buildActivityTrend(activities);

    // Recent activity feed
    const recentLearningActivity = activities.slice(0, 15).map((a) => ({
      id: a._id,
      type: a.type,
      metadata: a.metadata || {},
      createdAt: a.createdAt,
    }));

    return {
      summary: {
        totalSpaces,
        totalProjects,
        totalMaterials,
        processedMaterials,
        totalQuizzes,
        totalQuizAttempts,
        averageQuizScore,
        totalAssessments,
        evaluatedAssessments: evaluatedAssessments.length,
        averageAssessmentScore,
        totalConcepts: masteries.length,
        averageMastery,
        recommendationCompletionCount: completedRecommendations,
        recommendations: {
          total: recommendations.length,
          completed: completedRecommendations,
          pending: pendingRecommendations,
          dismissed: dismissedRecommendations,
        },
      },
      strongestConcepts,
      weakestConcepts,
      masteryTrend: overallMasteryTrend,
      overallMasteryTrend,
      activityTrend,
      recentLearningActivity,
    };
  }
}

module.exports = new AnalyticsService();
