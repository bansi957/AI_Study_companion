const retrievalService = require("../services/retrieval/retrieval.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Search relevant chunks for a user query within a project
 * POST /api/retrieval/search
 */
const search = async (req, res, next) => {
  try {
    const { projectId, query, topK, materialId } = req.body;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    if (!query || typeof query !== "string" || !query.trim()) {
      return apiResponse(res, 400, "Query string is required");
    }

    const userId = req.user.userId;

    const data = await retrievalService.retrieveForQuery({
      projectId,
      userId,
      query,
      topK,
      materialId,
    });

    return apiResponse(res, 200, "Retrieval completed successfully", data);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  search,
};
