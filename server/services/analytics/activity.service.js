const mongoose = require("mongoose");
const Activity = require("../../models/Activity");
const Project = require("../../models/Project");

/**
 * Activity Tracking Service
 *
 * Centralized service for logging student and learning milestone events,
 * with debouncing/deduplication protection and project-isolated activity feeds.
 */
class ActivityService {
  constructor() {
    this.validTypes = new Set([
      "SPACE_CREATED",
      "PROJECT_CREATED",
      "MATERIAL_UPLOADED",
      "MATERIAL_PROCESSED",
      "TUTOR_MESSAGE",
      "QUIZ_STARTED",
      "QUESTION_ANSWERED",
      "QUIZ_COMPLETED",
      "ASSESSMENT_COMPLETED",
      "MASTERY_UPDATED",
      "RECOMMENDATION_CREATED",
    ]);

    // In-memory cache for short-window deduplication (5 seconds window)
    this.recentEventCache = new Map();
  }

  /**
   * Record a learning activity event with deduplication protection
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} [params.projectId]
   * @param {string} params.type - Enum value from Activity model
   * @param {Object} [params.metadata]
   * @returns {Promise<Object>} Created Activity document or null
   */
  async recordActivity({ userId, projectId = null, type, metadata = {} }) {
    if (!userId) return null;

    if (!this.validTypes.has(type)) {
      console.warn(`[ActivityService] Invalid activity type: ${type}`);
      return null;
    }

    // Deduplication Key: userId + projectId + type + specific identifier if provided
    const idKey = metadata.id || metadata.questionId || metadata.attemptId || metadata.conceptId || metadata.materialId || "";
    const dedupKey = `${userId}:${projectId || "global"}:${type}:${idKey}`;
    const now = Date.now();

    const lastTime = this.recentEventCache.get(dedupKey);
    if (lastTime && now - lastTime < 3000) {
      // Duplicate event within 3 seconds, suppress
      return null;
    }
    this.recentEventCache.set(dedupKey, now);

    // Garbage-collect old cache entries if map gets large
    if (this.recentEventCache.size > 2000) {
      const expiration = now - 60000;
      for (const [k, v] of this.recentEventCache.entries()) {
        if (v < expiration) this.recentEventCache.delete(k);
      }
    }

    try {
      const activity = await Activity.create({
        userId,
        projectId: projectId ? new mongoose.Types.ObjectId(projectId) : null,
        type,
        metadata: metadata || {},
      });

      return activity;
    } catch (error) {
      console.warn(`[ActivityService] Failed to record activity ${type}:`, error.message);
      return null;
    }
  }

  /**
   * Get activity feed for a specific project
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {number} [params.limit=30]
   * @returns {Promise<Array<Object>>}
   */
  async getProjectActivity({ userId, projectId, limit = 30 }) {
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

    const cappedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 30, 100));

    const activities = await Activity.find({
      userId,
      projectId,
    })
      .sort({ createdAt: -1 })
      .limit(cappedLimit)
      .lean();

    return activities;
  }

  /**
   * Get global activity feed for the authenticated user
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {number} [params.limit=30]
   * @returns {Promise<Array<Object>>}
   */
  async getUserActivity({ userId, limit = 30 }) {
    if (!userId) {
      const err = new Error("User ID is required");
      err.statusCode = 400;
      throw err;
    }

    const cappedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 30, 100));

    const activities = await Activity.find({ userId })
      .populate("projectId", "name")
      .sort({ createdAt: -1 })
      .limit(cappedLimit)
      .lean();

    return activities;
  }
}

module.exports = new ActivityService();
