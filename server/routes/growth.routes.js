const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { getProjectGrowth } = require("../controllers/growth.controller");

const router = express.Router();

// Protect all growth routes with authentication middleware
router.use(authMiddleware);

// GET /api/growth/project/:projectId
router.get("/project/:projectId", getProjectGrowth);

module.exports = router;
