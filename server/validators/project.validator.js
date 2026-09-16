const mongoose = require("mongoose");

const ALLOWED_STATUSES = ["active", "completed", "archived"];

const validateCreateProject = (data) => {
  const errors = [];
  const { spaceId, name, description, learningGoal, status } = data || {};

  if (!spaceId || typeof spaceId !== "string" || !mongoose.Types.ObjectId.isValid(spaceId)) {
    errors.push("A valid spaceId is required");
  }

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.push("Project name is required and must be at least 2 characters long");
  } else if (name.trim().length > 150) {
    errors.push("Project name must not exceed 150 characters");
  }

  if (!learningGoal || typeof learningGoal !== "string" || learningGoal.trim().length < 2) {
    errors.push("Learning goal is required and must be at least 2 characters long");
  } else if (learningGoal.trim().length > 1000) {
    errors.push("Learning goal must not exceed 1000 characters");
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.push("Description must be a string");
    } else if (description.trim().length > 1000) {
      errors.push("Description must not exceed 1000 characters");
    }
  }

  if (status !== undefined && status !== null) {
    if (!ALLOWED_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${ALLOWED_STATUSES.join(", ")}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateUpdateProject = (data) => {
  const errors = [];
  const { name, description, learningGoal, status } = data || {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      errors.push("Project name must be at least 2 characters long");
    } else if (name.trim().length > 150) {
      errors.push("Project name must not exceed 150 characters");
    }
  }

  if (learningGoal !== undefined) {
    if (typeof learningGoal !== "string" || learningGoal.trim().length < 2) {
      errors.push("Learning goal must be at least 2 characters long");
    } else if (learningGoal.trim().length > 1000) {
      errors.push("Learning goal must not exceed 1000 characters");
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.push("Description must be a string");
    } else if (description.trim().length > 1000) {
      errors.push("Description must not exceed 1000 characters");
    }
  }

  if (status !== undefined && status !== null) {
    if (!ALLOWED_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${ALLOWED_STATUSES.join(", ")}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateCreateProject,
  validateUpdateProject,
};
