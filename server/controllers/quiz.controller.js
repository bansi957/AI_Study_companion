const quizService = require("../services/ai/quiz.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Generate an adaptive quiz for a project
 * POST /api/quizzes/generate
 */
const generateQuiz = async (req, res, next) => {
  try {
    const {
      projectId,
      totalQuestions = 10,
      difficulty = "adaptive",
      conceptIds = [],
      questionFormat = "mixed",
    } = req.body;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    const userId = req.user.userId;

    const quiz = await quizService.generateAdaptiveQuiz({
      userId,
      projectId,
      totalQuestions,
      difficulty,
      conceptIds,
      questionFormat,
    });

    return apiResponse(res, 201, "Adaptive quiz generated successfully", quiz);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Start a new quiz attempt
 * POST /api/quizzes/:quizId/start
 */
const startAttempt = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.userId;

    if (!quizId) {
      return apiResponse(res, 400, "Quiz ID is required");
    }

    const attempt = await quizService.startAttempt({
      userId,
      quizId,
    });

    return apiResponse(res, 201, "Quiz attempt started successfully", attempt);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Submit an answer to a question
 * POST /api/quizzes/:quizId/answer
 */
const submitAnswer = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { attemptId, questionId, answer } = req.body;
    const userId = req.user.userId;

    if (!attemptId) {
      return apiResponse(res, 400, "Attempt ID is required");
    }

    if (!questionId) {
      return apiResponse(res, 400, "Question ID is required");
    }

    if (answer === undefined || answer === null) {
      return apiResponse(res, 400, "Answer is required");
    }

    const evaluation = await quizService.submitAnswer({
      userId,
      quizId,
      attemptId,
      questionId,
      answer,
    });

    return apiResponse(res, 200, "Answer submitted successfully", evaluation);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Complete a quiz attempt and return comprehensive feedback
 * POST /api/quizzes/:quizId/complete
 */
const completeQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { attemptId } = req.body;
    const userId = req.user.userId;

    if (!attemptId) {
      return apiResponse(res, 400, "Attempt ID is required");
    }

    const feedback = await quizService.completeQuiz({
      userId,
      quizId,
      attemptId,
    });

    return apiResponse(res, 200, "Quiz completed successfully", feedback);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Get quiz by ID
 * GET /api/quizzes/:quizId
 */
const getQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.userId;

    const quiz = await quizService.getQuizById({
      quizId,
      userId,
    });

    return apiResponse(res, 200, "Quiz retrieved successfully", quiz);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  generateQuiz,
  startAttempt,
  submitAnswer,
  completeQuiz,
  getQuiz,
};
