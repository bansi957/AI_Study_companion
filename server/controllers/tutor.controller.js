const tutorService = require("../services/ai/tutor.service");
const apiResponse = require("../utils/apiResponse");

/**
 * Handle AI Tutor conversational queries
 * POST /api/tutor/chat
 */
const chat = async (req, res, next) => {
  try {
    const { projectId, conversationId, message } = req.body;

    if (!projectId) {
      return apiResponse(res, 400, "Project ID is required");
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return apiResponse(res, 400, "Message is required");
    }

    const userId = req.user.userId;

    const data = await tutorService.askTutor({
      userId,
      projectId,
      conversationId,
      message,
    });

    return apiResponse(res, 200, "Tutor response generated successfully", data);
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

/**
 * Retrieve conversation history
 * GET /api/tutor/conversations/:id
 */
const getConversationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const conversation = await tutorService.getConversation(id, userId);

    return apiResponse(res, 200, "Conversation retrieved successfully", {
      conversation,
    });
  } catch (error) {
    if (error.statusCode) {
      return apiResponse(res, error.statusCode, error.message);
    }
    return next(error);
  }
};

module.exports = {
  chat,
  getConversationById,
};
