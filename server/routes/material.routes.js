const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { handlePdfUpload } = require("../middleware/upload.middleware");
const {
  uploadMaterial,
  getMaterialsByProject,
  getMaterialById,
  deleteMaterial,
  getMaterialContent,
  getMaterialConcepts,
  getMaterialChunks,
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

// GET /api/materials/:id/content (structured extracted segments with page provenance)
router.get("/:id/content", getMaterialContent);

// GET /api/materials/:id/concepts (extracted knowledge concepts)
router.get("/:id/concepts", getMaterialConcepts);

// GET /api/materials/:id/chunks (retrieval chunks with page provenance)
router.get("/:id/chunks", getMaterialChunks);

// DELETE /api/materials/:id
router.delete("/:id", deleteMaterial);

module.exports = router;
