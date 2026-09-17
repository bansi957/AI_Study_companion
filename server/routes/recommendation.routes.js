const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  getProjectRecommendations,
  completeRecommendation,
  dismissRecommendation,
} = require("../controllers/recommendation.controller");

const router = express.Router();

// Protect all recommendation endpoints with authentication middleware
router.use(authMiddleware);

// GET /api/recommendations/project/:projectId
router.get("/project/:projectId", getProjectRecommendations);

// POST /api/recommendations/:id/complete
router.post("/:id/complete", completeRecommendation);

// POST /api/recommendations/:id/dismiss
router.post("/:id/dismiss", dismissRecommendation);

module.exports = router;
