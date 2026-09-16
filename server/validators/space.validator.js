const validateCreateSpace = (data) => {
  const errors = [];
  const { name, description, icon } = data || {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.push("Space name is required and must be at least 2 characters long");
  } else if (name.trim().length > 100) {
    errors.push("Space name must not exceed 100 characters");
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.push("Description must be a string");
    } else if (description.trim().length > 500) {
      errors.push("Description must not exceed 500 characters");
    }
  }

  if (icon !== undefined && icon !== null && typeof icon !== "string") {
    errors.push("Icon must be a string");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateUpdateSpace = (data) => {
  const errors = [];
  const { name, description, icon } = data || {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      errors.push("Space name must be at least 2 characters long");
    } else if (name.trim().length > 100) {
      errors.push("Space name must not exceed 100 characters");
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.push("Description must be a string");
    } else if (description.trim().length > 500) {
      errors.push("Description must not exceed 500 characters");
    }
  }

  if (icon !== undefined && icon !== null && typeof icon !== "string") {
    errors.push("Icon must be a string");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateCreateSpace,
  validateUpdateSpace,
};
