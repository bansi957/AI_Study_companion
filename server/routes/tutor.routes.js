const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  chat,
  getConversationById,
  getConversations,
  getLatestConversation,
} = require("../controllers/tutor.controller");

const router = express.Router();

// Protect all AI Tutor endpoints with authentication middleware
router.use(authMiddleware);

// POST /api/tutor/chat
router.post("/chat", chat);

// GET /api/tutor/conversations?projectId=...
router.get("/conversations", getConversations);

// GET /api/tutor/project/:projectId/latest
router.get("/project/:projectId/latest", getLatestConversation);

// GET /api/tutor/conversations/:id
router.get("/conversations/:id", getConversationById);

module.exports = router;
