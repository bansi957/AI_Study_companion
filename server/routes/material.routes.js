const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { handlePdfUpload } = require("../middleware/upload.middleware");
const {
  uploadMaterial,
  getMaterialsByProject,
  getMaterialById,
  deleteMaterial,
} = require("../controllers/material.controller");

const router = express.Router();

// Protect all material routes with authentication middleware
router.use(authMiddleware);

// POST /api/materials/upload
router.post("/upload", handlePdfUpload, uploadMaterial);

// GET /api/materials/project/:projectId
router.get("/project/:projectId", getMaterialsByProject);

// GET /api/materials/:id
router.get("/:id", getMaterialById);

// DELETE /api/materials/:id
router.delete("/:id", deleteMaterial);

module.exports = router;
