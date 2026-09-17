const masteryService = require("../services/learning/mastery.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Get concept-level mastery for a project
 * GET /api/mastery/project/:projectId
 */
const getProjectMastery = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const masteryData = await masteryService.getProjectMastery({
      userId,
      projectId,
    });

    return apiResponse(res, 200, "Project mastery retrieved successfully", {
      projectId,
      concepts: masteryData,
    });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Get detailed mastery and historical snapshots for a specific concept
 * GET /api/mastery/concept/:conceptId
 */
const getConceptMastery = async (req, res, next) => {
  try {
    const { conceptId } = req.params;
    const userId = req.user.userId;

    if (!conceptId) {
      return apiResponse(res, 400, "Concept ID is required");
    }

    const conceptData = await masteryService.getConceptMastery({
      userId,
      conceptId,
    });

    return apiResponse(res, 200, "Concept mastery retrieved successfully", conceptData);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  getProjectMastery,
  getConceptMastery,
};
