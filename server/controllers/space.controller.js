const mongoose = require("mongoose");
const Space = require("../models/Space");
const apiResponse = require("../utils/apiResponse");
const {
  validateCreateSpace,
  validateUpdateSpace,
} = require("../validators/space.validator");

const createSpace = async (req, res, next) => {
  try {
    const { name, description, icon } = req.body || {};

    const validation = validateCreateSpace({ name, description, icon });
    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    const newSpace = await Space.create({
      userId: req.user.userId,
      name: name.trim(),
      description: description ? description.trim() : undefined,
      icon: icon ? icon.trim() : undefined,
    });

    const activityService = require("../services/analytics/activity.service");
    await activityService.recordActivity({
      userId: req.user.userId,
      type: "SPACE_CREATED",
      metadata: {
        spaceId: newSpace._id,
        name: newSpace.name,
      },
    });

    return apiResponse(res, 201, "Space created successfully", {
      space: newSpace,
    });
  } catch (error) {
    return next(error);
  }
};

const getSpaces = async (req, res, next) => {
  try {
    const spaces = await Space.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });

    return apiResponse(res, 200, "Spaces retrieved successfully", {
      spaces,
    });
  } catch (error) {
    return next(error);
  }
};

const getSpaceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid space ID");
    }

    const space = await Space.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!space) {
      return apiResponse(res, 404, "Space not found");
    }

    return apiResponse(res, 200, "Space retrieved successfully", {
      space,
    });
  } catch (error) {
    return next(error);
  }
};

const updateSpace = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid space ID");
    }

    const { name, description, icon } = req.body || {};

    const validation = validateUpdateSpace({ name, description, icon });
    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    const space = await Space.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!space) {
      return apiResponse(res, 404, "Space not found");
    }

    if (name !== undefined) {
      space.name = name.trim();
    }

    if (description !== undefined) {
      space.description = description.trim();
    }

    if (icon !== undefined) {
      space.icon = icon.trim();
    }

    await space.save();

    return apiResponse(res, 200, "Space updated successfully", {
      space,
    });
  } catch (error) {
    return next(error);
  }
};

const { cascadeDeleteSpace } = require("../utils/cascadeDelete");

const deleteSpace = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse(res, 400, "Invalid space ID");
    }

    // Cascade delete space, all its projects, and all associated conversations, chats, quizzes, materials, chunks, etc.
    const result = await cascadeDeleteSpace(id, req.user.userId);

    if (!result) {
      return apiResponse(res, 404, "Space not found");
    }

    return apiResponse(res, 200, "Space deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSpace,
  getSpaces,
  getSpaceById,
  updateSpace,
  deleteSpace,
};
