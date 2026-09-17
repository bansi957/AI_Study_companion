const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Material = require("../models/Material");
const Project = require("../models/Project");
const ExtractedContent = require("../models/ExtractedContent");
const Concept = require("../models/Concept");
const Chunk = require("../models/Chunk");
const apiResponse = require("../utils/apiResponse");
const { addDocumentJob } = require("../queues/document.queue");
const activityService = require("../services/analytics/activity.service");
const { cloudinary, isCloudinaryConfigured } = require("../config/cloudinary");

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
  cloudinaryPublicId: m.cloudinaryPublicId || null,
  fileType: m.fileType,
  fileSize: m.fileSize,
  status: m.status,
  pageCount: m.pageCount || 0,
  extractedTextLength: m.extractedTextLength || 0,
  structureStats: m.structureStats || {},
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

    // 4. Upload PDF to Cloudinary (or local fallback if not yet configured)
    let fileUrl;
    let cloudinaryPublicId = null;
    let cloudinaryResourceType = "raw";
    let cloudinaryMetadata = null;
    let fileSize = req.file.size;

    if (isCloudinaryConfigured()) {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: `ai-study-companion/projects/${projectId}/materials`,
        resource_type: "raw",
        public_id: `${uniqueSuffix}`,
        use_filename: true,
      });

      fileUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
      cloudinaryResourceType = uploadResult.resource_type || "raw";
      fileSize = uploadResult.bytes || req.file.size;
      cloudinaryMetadata = {
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        resourceType: uploadResult.resource_type,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
      };

      // Remove the local temporary file immediately so no permanent files remain in uploads/
      await fs.promises.unlink(req.file.path).catch(() => {});
    } else {
      fileUrl = `/uploads/${req.file.filename}`;
    }

    // 5. Create Material document with QUEUED status
    const material = await Material.create({
      userId: req.user.userId,
      projectId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileUrl,
      cloudinaryPublicId,
      cloudinaryResourceType,
      fileType: "application/pdf",
      fileSize,
      status: "QUEUED",
      metadata: {
        ...(cloudinaryMetadata ? { cloudinary: cloudinaryMetadata } : {}),
      },
    });

    // 6. Enqueue background document processing job
    try {
      await addDocumentJob({
        materialId: material._id.toString(),
        projectId: material.projectId.toString(),
      });
    } catch (queueError) {
      console.warn(`[MaterialController] Failed to enqueue background job: ${queueError.message}`);
    }

    // 7. Record activity
    await activityService.recordActivity({
      userId: req.user.userId,
      projectId: material.projectId,
      type: "MATERIAL_UPLOADED",
      metadata: {
        materialId: material._id,
        filename: material.originalName,
        size: material.fileSize,
      },
    });

    // 8. Return success response with sanitized metadata
    return apiResponse(res, 201, "PDF uploaded successfully", {
      material: formatMaterialResponse(material),
    });
  } catch (error) {
    return next(error);
  } finally {
    // When Cloudinary is active or if an upload error occurs, delete the local temporary staging file
    if (req.file && req.file.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
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

    // Delete material, extracted content, chunks, and unbind concepts
    await Material.findByIdAndDelete(id);
    await ExtractedContent.deleteMany({ materialId: id });
    await Chunk.deleteMany({ materialId: id });
    await Concept.deleteMany({ sourceMaterialIds: [id] });
    await Concept.updateMany(
      { sourceMaterialIds: id },
      { $pull: { sourceMaterialIds: id } }
    );

    // Delete from Cloudinary if stored in Cloudinary
    if (material.cloudinaryPublicId && isCloudinaryConfigured()) {
      try {
        const resourceType = material.cloudinaryResourceType || "raw";
        await cloudinary.uploader.destroy(material.cloudinaryPublicId, {
          resource_type: resourceType,
        });
      } catch (cloudErr) {
        console.warn(`[MaterialController] Failed to delete Cloudinary asset ${material.cloudinaryPublicId}: ${cloudErr.message}`);
      }
    }

    // Delete stored physical file if legacy local file exists (gracefully handle if missing)
    if (material.filename) {
      const filePath = path.join(uploadDir, material.filename);
      await fs.promises.unlink(filePath).catch(() => {});
    }

    return apiResponse(res, 200, "Material deleted successfully");
  } catch (error) {
    return next(error);
  }
};

/**
 * Get structured extracted content for a material
 * GET /api/materials/:id/content
 */
const getMaterialContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid material ID");
    }

    // Verify material belongs to authenticated user
    const material = await Material.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!material) {
      return apiResponse(res, 404, "Material not found");
    }

    // Strict project isolation verification
    const project = await Project.findOne({
      _id: material.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Project not found");
    }

    // Build query with isolation filters
    const query = {
      materialId: id,
      projectId: material.projectId,
      userId: req.user.userId,
    };

    if (page) {
      const pageNum = parseInt(page, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        query.pageNumber = pageNum;
      }
    }

    const segments = await ExtractedContent.find(query)
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .select("-__v");

    return apiResponse(res, 200, "Extracted content retrieved successfully", {
      materialId: id,
      projectId: material.projectId,
      pageCount: material.pageCount,
      totalSegments: segments.length,
      structureStats: material.structureStats || {},
      segments,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get extracted concepts for a material
 * GET /api/materials/:id/concepts
 */
const getMaterialConcepts = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid material ID");
    }

    const material = await Material.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!material) {
      return apiResponse(res, 404, "Material not found");
    }

    const concepts = await Concept.find({
      projectId: material.projectId,
      sourceMaterialIds: id,
    })
      .sort({ importance: -1, name: 1 })
      .select("-__v");

    return apiResponse(res, 200, "Concepts retrieved successfully", {
      materialId: id,
      projectId: material.projectId,
      count: concepts.length,
      concepts,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get chunks for a material with pagination and page filtering
 * GET /api/materials/:id/chunks
 */
const getMaterialChunks = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page, limit = 50 } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid material ID");
    }

    const material = await Material.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!material) {
      return apiResponse(res, 404, "Material not found");
    }

    const query = {
      materialId: id,
      projectId: material.projectId,
      userId: req.user.userId,
    };

    if (page) {
      const pageNum = parseInt(page, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        query.pages = pageNum;
      }
    }

    const chunks = await Chunk.find(query)
      .sort({ chunkIndex: 1 })
      .limit(parseInt(limit, 10) || 50)
      .select("-__v");

    return apiResponse(res, 200, "Chunks retrieved successfully", {
      materialId: id,
      projectId: material.projectId,
      count: chunks.length,
      chunks,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  uploadMaterial,
  getMaterialsByProject,
  getMaterialById,
  deleteMaterial,
  getMaterialContent,
  getMaterialConcepts,
  getMaterialChunks,
};


