const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Material = require("../models/Material");
const Project = require("../models/Project");
const apiResponse = require("../utils/apiResponse");
const { addDocumentJob } = require("../queues/document.queue");

const uploadDir = path.join(__dirname, "../uploads");

/**
 * Format material response ensuring all required metadata is present
 * and internal server paths are never exposed.
 */
const formatMaterialResponse = (m) => ({
  id: m._id,
  _id: m._id,
  projectId: m.projectId,
  originalName: m.originalName,
  fileUrl: m.fileUrl,
  fileType: m.fileType,
  fileSize: m.fileSize,
  status: m.status,
  pageCount: m.pageCount || 0,
  extractedTextLength: m.extractedTextLength || 0,
  processedAt: m.processedAt || null,
  processingError: m.processingError || null,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/**
 * Upload a PDF material to a project
 * POST /api/materials/upload
 */
const uploadMaterial = async (req, res, next) => {
  try {
    const { projectId } = req.body || {};

    // 1. Validate file presence
    if (!req.file) {
      return apiResponse(res, 400, "PDF file is required");
    }

    // 2. Validate projectId
    if (!projectId || typeof projectId !== "string" || !mongoose.Types.ObjectId.isValid(projectId)) {
      // Clean up uploaded file if validation fails
      await fs.promises.unlink(req.file.path).catch(() => {});
      return apiResponse(res, 400, "Valid projectId is required");
    }

    // 3. Verify Project belongs to the authenticated user
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
    });

    if (!project) {
      // Clean up uploaded file so no orphan remains
      await fs.promises.unlink(req.file.path).catch(() => {});
      return apiResponse(res, 404, "Project not found");
    }

    // 4. Create Material document with QUEUED status
    const material = await Material.create({
      userId: req.user.userId,
      projectId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: "application/pdf",
      fileSize: req.file.size,
      status: "QUEUED",
    });

    // 5. Enqueue background document processing job
    try {
      await addDocumentJob({
        materialId: material._id.toString(),
        projectId: material.projectId.toString(),
      });
    } catch (queueError) {
      console.warn(`[MaterialController] Failed to enqueue background job: ${queueError.message}`);
    }

    // 6. Return success response with sanitized metadata
    return apiResponse(res, 201, "PDF uploaded successfully", {
      material: formatMaterialResponse(material),
    });
  } catch (error) {
    // If an error occurred and a file was written to disk, clean it up
    if (req.file && req.file.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    return next(error);
  }
};

/**
 * Get all materials for a project
 * GET /api/materials/project/:projectId
 */
const getMaterialsByProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return apiResponse(res, 400, "Invalid project ID");
    }

    // Verify project belongs to authenticated user
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Project not found");
    }

    // Fetch materials for this project owned by user, newest first
    const materials = await Material.find({
      projectId,
      userId: req.user.userId,
    })
      .sort({ createdAt: -1 })
      .select("-__v");

    return apiResponse(res, 200, "Materials retrieved successfully", {
      materials: materials.map(formatMaterialResponse),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get material details by ID
 * GET /api/materials/:id
 */
const getMaterialById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid material ID");
    }

    // Verify material belongs to authenticated user
    const material = await Material.findOne({
      _id: id,
      userId: req.user.userId,
    }).select("-__v");

    if (!material) {
      return apiResponse(res, 404, "Material not found");
    }

    // Verify project ownership
    const project = await Project.findOne({
      _id: material.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Material not found");
    }

    return apiResponse(res, 200, "Material retrieved successfully", {
      material: formatMaterialResponse(material),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Delete a material
 * DELETE /api/materials/:id
 */
const deleteMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid material ID");
    }

    // Verify material belongs to user
    const material = await Material.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!material) {
      return apiResponse(res, 404, "Material not found");
    }

    // Verify project belongs to user
    const project = await Project.findOne({
      _id: material.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Material not found");
    }

    // Delete material from database
    await Material.findByIdAndDelete(id);

    // Delete stored physical file if exists (gracefully handle if missing)
    if (material.filename) {
      const filePath = path.join(uploadDir, material.filename);
      await fs.promises.unlink(filePath).catch(() => {});
    }

    return apiResponse(res, 200, "Material deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  uploadMaterial,
  getMaterialsByProject,
  getMaterialById,
  deleteMaterial,
};

