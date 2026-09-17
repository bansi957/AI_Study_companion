const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const adminMiddleware = require("../middleware/admin.middleware");
const adminController = require("../controllers/admin.controller");

const router = express.Router();

// Enforce authentication and admin privileges on all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

// 1. Admin Dashboard
router.get("/dashboard", adminController.getDashboard);

// 2. User Management
router.get("/users", adminController.getUsers);
router.get("/users/:userId", adminController.getUserDetails);

// 3. Project & Activity Inspection
router.get("/projects", adminController.getProjects);
router.get("/activities", adminController.getActivities);
router.get("/activity", adminController.getActivities);

// 4. AI Usage Monitoring
router.get("/ai-usage", adminController.getAIUsage);

// 5. Document Processing Monitoring
router.get("/processing", adminController.getProcessing);

// 6. System Health Probe
router.get("/health", adminController.getHealth);

module.exports = router;
