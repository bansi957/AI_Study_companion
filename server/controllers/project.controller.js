const mongoose = require("mongoose");
const Project = require("../models/Project");
const Space = require("../models/Space");
const Material = require("../models/Material");
const Concept = require("../models/Concept");
const ExtractedContent = require("../models/ExtractedContent");
const Chunk = require("../models/Chunk");
const apiResponse = require("../utils/apiResponse");
const {
  validateCreateProject,
  validateUpdateProject,
} = require("../validators/project.validator");
const { deleteCloudinaryAsset } = require("../config/cloudinary");

const createProject = async (req, res, next) => {
  try {
    const { spaceId, name, description, learningGoal, status } = req.body || {};

    const validation = validateCreateProject({
      spaceId,
      name,
      description,
      learningGoal,
      status,
    });

    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    // Verify Space exists and belongs to the authenticated user
    const space = await Space.findOne({
      _id: spaceId,
      userId: req.user.userId,
    });

    if (!space) {
      return apiResponse(res, 404, "Space not found");
    }

    const newProject = await Project.create({
      userId: req.user.userId,
      spaceId,
      name: name.trim(),
      description: description ? description.trim() : undefined,
      learningGoal: learningGoal.trim(),
      status: status || "active",
    });

    const activityService = require("../services/analytics/activity.service");
    await activityService.recordActivity({
      userId: req.user.userId,
      projectId: newProject._id,
      type: "PROJECT_CREATED",
      metadata: {
        projectId: newProject._id,
        name: newProject.name,
        learningGoal: newProject.learningGoal,
      },
    });

    return apiResponse(res, 201, "Project created successfully", {
      project: newProject,
    });
  } catch (error) {
    return next(error);
  }
};

const getProjects = async (req, res, next) => {
  try {
    const query = { userId: req.user.userId };

    if (req.query.spaceId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.spaceId)) {
        return apiResponse(res, 400, "Invalid spaceId parameter");
      }

      const space = await Space.findOne({
        _id: req.query.spaceId,
        userId: req.user.userId,
      });

      if (!space) {
        return apiResponse(res, 404, "Space not found");
      }

      query.spaceId = req.query.spaceId;
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });

    return apiResponse(res, 200, "Projects retrieved successfully", {
      projects,
    });
  } catch (error) {
    return next(error);
  }
};

const getProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid project ID");
    }

    const project = await Project.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Project not found");
    }

    return apiResponse(res, 200, "Project retrieved successfully", {
      project,
    });
  } catch (error) {
    return next(error);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid project ID");
    }

    const { name, description, learningGoal, status } = req.body || {};

    const validation = validateUpdateProject({
      name,
      description,
      learningGoal,
      status,
    });

    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    const project = await Project.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Project not found");
    }

    if (name !== undefined) {
      project.name = name.trim();
    }

    if (description !== undefined) {
      project.description = description.trim();
    }

    if (learningGoal !== undefined) {
      project.learningGoal = learningGoal.trim();
    }

    if (status !== undefined) {
      project.status = status;
    }

    await project.save();

    return apiResponse(res, 200, "Project updated successfully", {
      project,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid project ID");
    }

    const project = await Project.findOneAndDelete({
      _id: id,
      userId: req.user.userId,
    });

    if (!project) {
      return apiResponse(res, 404, "Project not found");
    }

    // Cascade delete materials, concepts, chunks, and extractedContent belonging to this project
    const projObjectId = mongoose.Types.ObjectId.isValid(id)
      ? new mongoose.Types.ObjectId(id)
      : id;

    // Purge all associated PDFs from Cloudinary first
    try {
      const materials = await Material.find({
        $or: [{ projectId: id }, { projectId: projObjectId }],
      });
      await Promise.allSettled(
        materials.map((mat) =>
          deleteCloudinaryAsset(
            mat.cloudinaryPublicId,
            mat.fileUrl,
            mat.cloudinaryResourceType || "raw"
          )
        )
      );
    } catch (cloudErr) {
      console.warn(`[ProjectController] Cloudinary cleanup warning: ${cloudErr.message}`);
    }

    await Promise.all([
      Material.deleteMany({ $or: [{ projectId: id }, { projectId: projObjectId }] }),
      Concept.deleteMany({ $or: [{ projectId: id }, { projectId: projObjectId }] }),
      ExtractedContent.deleteMany({ $or: [{ projectId: id }, { projectId: projObjectId }] }),
      Chunk.deleteMany({ $or: [{ projectId: id }, { projectId: projObjectId }] }),
    ]);

    return apiResponse(res, 200, "Project deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
