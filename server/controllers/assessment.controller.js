const assessmentService = require("../services/ai/assessment.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Generate an open-ended assessment question
 * POST /api/assessments/generate
 */
const generateAssessment = async (req, res, next) => {
  try {
    const { projectId, conceptId } = req.body;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const assessment = await assessmentService.generateAssessment({
      userId,
      projectId,
      conceptId,
    });

    return apiResponse(res, 201, "Open-ended assessment generated successfully", assessment);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Submit and evaluate an open-ended answer
 * POST /api/assessments/:id/submit
 */
const submitAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    const userId = req.user.userId;

    if (!id) {
      return apiResponse(res, 400, "Assessment ID is required");
    }

    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return apiResponse(res, 400, "Answer text is required");
    }

    const assessment = await assessmentService.submitAndEvaluate({
      userId,
      assessmentId: id,
      answer,
    });

    return apiResponse(res, 200, "Answer evaluated successfully", assessment);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Get assessment by ID
 * GET /api/assessments/:id
 */
const getAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const assessment = await assessmentService.getAssessmentById({
      userId,
      assessmentId: id,
    });

    return apiResponse(res, 200, "Assessment retrieved successfully", assessment);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * List assessments for a project
 * GET /api/assessments?projectId=...
 */
const listAssessments = async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const userId = req.user.userId;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID query parameter is required");
    }

    const assessments = await assessmentService.listAssessmentsByProject({
      userId,
      projectId,
    });

    return apiResponse(res, 200, "Assessments retrieved successfully", { assessments });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  generateAssessment,
  submitAssessment,
  getAssessment,
  listAssessments,
};
