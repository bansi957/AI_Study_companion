const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  createSpace,
  getSpaces,
  getSpaceById,
  updateSpace,
  deleteSpace,
} = require("../controllers/space.controller");

const router = express.Router();

// Protect all space routes with authentication middleware
router.use(authMiddleware);

router.post("/", createSpace);
router.get("/", getSpaces);
router.get("/:id", getSpaceById);
router.put("/:id", updateSpace);
router.delete("/:id", deleteSpace);

module.exports = router;
