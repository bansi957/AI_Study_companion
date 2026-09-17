const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  generateAssessment,
  submitAssessment,
  getAssessment,
  listAssessments,
} = require("../controllers/assessment.controller");

const router = express.Router();

// Protect all assessment endpoints with authentication middleware
router.use(authMiddleware);

// POST /api/assessments/generate
router.post("/generate", generateAssessment);

// POST /api/assessments/:id/submit
router.post("/:id/submit", submitAssessment);

// GET /api/assessments/:id
router.get("/:id", getAssessment);

// GET /api/assessments
router.get("/", listAssessments);

module.exports = router;
