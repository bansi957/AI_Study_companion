const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  getProjectAnalytics,
  getGlobalAnalytics,
} = require("../controllers/analytics.controller");

const router = express.Router();

// Protect all analytics endpoints with authentication middleware
router.use(authMiddleware);

// GET /api/analytics/project/:projectId
router.get("/project/:projectId", getProjectAnalytics);

// GET /api/analytics/global
router.get("/global", getGlobalAnalytics);

module.exports = router;
