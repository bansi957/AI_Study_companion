const express = require("express");
const { register, login, googleAuth, getMe } = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/google", googleAuth);
router.post("/firebase", googleAuth);
router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);

module.exports = router;
