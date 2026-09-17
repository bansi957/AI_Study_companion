const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { search } = require("../controllers/retrieval.controller");

const router = express.Router();

// Protect all retrieval endpoints with authentication middleware
router.use(authMiddleware);

// POST /api/retrieval/search
router.post("/search", search);

module.exports = router;
