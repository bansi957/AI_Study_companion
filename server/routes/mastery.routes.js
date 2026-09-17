const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  getProjectMastery,
  getConceptMastery,
} = require("../controllers/mastery.controller");

const router = express.Router();

// Protect all mastery routes with authentication middleware
router.use(authMiddleware);

// GET /api/mastery/project/:projectId
router.get("/project/:projectId", getProjectMastery);

// GET /api/mastery/concept/:conceptId
router.get("/concept/:conceptId", getConceptMastery);

module.exports = router;
