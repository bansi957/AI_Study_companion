const analyticsService = require("../services/analytics/analytics.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Get analytics for a specific project
 * GET /api/analytics/project/:projectId
 */
const getProjectAnalytics = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const data = await analyticsService.getProjectAnalytics({
      userId,
      projectId,
    });

    return apiResponse(res, 200, "Project analytics retrieved successfully", data);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Get global cross-project analytics for the authenticated user
 * GET /api/analytics/global
 */
const getGlobalAnalytics = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const data = await analyticsService.getGlobalAnalytics({
      userId,
    });

    return apiResponse(res, 200, "Global analytics retrieved successfully", data);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  getProjectAnalytics,
  getGlobalAnalytics,
};
