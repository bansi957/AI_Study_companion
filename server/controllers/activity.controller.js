const activityService = require("../services/analytics/activity.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Get recent activity for a project
 * GET /api/activity/project/:projectId
 */
const getProjectActivity = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { limit } = req.query;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const activities = await activityService.getProjectActivity({
      userId,
      projectId,
      limit: limit ? parseInt(limit, 10) : 30,
    });

    return apiResponse(res, 200, "Project activity retrieved successfully", {
      projectId,
      activities,
    });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Get global activity feed for authenticated user
 * GET /api/activity
 */
const getUserActivity = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const userId = req.user.userId;

    const activities = await activityService.getUserActivity({
      userId,
      limit: limit ? parseInt(limit, 10) : 30,
    });

    return apiResponse(res, 200, "User activity retrieved successfully", {
      activities,
    });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  getProjectActivity,
  getUserActivity,
};
