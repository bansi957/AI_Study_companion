const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  generateQuiz,
  startAttempt,
  submitAnswer,
  completeQuiz,
  getQuiz,
} = require("../controllers/quiz.controller");

const router = express.Router();

// Protect all quiz endpoints with authentication middleware
router.use(authMiddleware);

// POST /api/quizzes/generate
router.post("/generate", generateQuiz);

// POST /api/quizzes/:quizId/start
router.post("/:quizId/start", startAttempt);

// POST /api/quizzes/:quizId/answer
router.post("/:quizId/answer", submitAnswer);

// POST /api/quizzes/:quizId/complete
router.post("/:quizId/complete", completeQuiz);

// GET /api/quizzes/:quizId
router.get("/:quizId", getQuiz);

module.exports = router;
