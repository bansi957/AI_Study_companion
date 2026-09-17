const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  getProjectActivity,
  getUserActivity,
} = require("../controllers/activity.controller");

const router = express.Router();

// Protect all activity endpoints with authentication middleware
router.use(authMiddleware);

// GET /api/activity/project/:projectId
router.get("/project/:projectId", getProjectActivity);

// GET /api/activity
router.get("/", getUserActivity);

module.exports = router;
