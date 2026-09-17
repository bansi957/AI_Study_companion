const growthService = require("../services/learning/growth.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Get project growth analysis and concept classifications
 * GET /api/growth/project/:projectId
 */
const getProjectGrowth = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const growthData = await growthService.getProjectGrowth({
      userId,
      projectId,
    });

    return apiResponse(res, 200, "Project growth analysis retrieved successfully", growthData);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  getProjectGrowth,
};
