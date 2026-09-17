const recommendationService = require("../services/ai/recommendation.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Get active recommendations for a project
 * GET /api/recommendations/project/:projectId
 */
const getProjectRecommendations = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const recommendations = await recommendationService.getProjectRecommendations({
      userId,
      projectId,
      autoGenerate: true,
    });

    return apiResponse(res, 200, "Recommendations retrieved successfully", {
      projectId,
      recommendations,
    });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Complete a recommendation
 * POST /api/recommendations/:id/complete
 */
const completeRecommendation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id) {
      return apiResponse(res, 400, "Recommendation ID is required");
    }

    const updated = await recommendationService.completeRecommendation({
      userId,
      recommendationId: id,
    });

    return apiResponse(res, 200, "Recommendation completed successfully", updated);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Dismiss a recommendation
 * POST /api/recommendations/:id/dismiss
 */
const dismissRecommendation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id) {
      return apiResponse(res, 400, "Recommendation ID is required");
    }

    const updated = await recommendationService.dismissRecommendation({
      userId,
      recommendationId: id,
    });

    return apiResponse(res, 200, "Recommendation dismissed successfully", updated);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  getProjectRecommendations,
  completeRecommendation,
  dismissRecommendation,
};
