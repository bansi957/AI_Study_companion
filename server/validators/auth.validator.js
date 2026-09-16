const validateRegisterInput = (data) => {
  const errors = [];
  const { name, email, password } = data || {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.push("Name is required and must be at least 2 characters long");
  } else if (name.trim().length > 50) {
    errors.push("Name must not exceed 50 characters");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    errors.push("A valid email address is required");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    errors.push("Password is required and must be at least 6 characters long");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateLoginInput = (data) => {
  const errors = [];
  const { email, password } = data || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    errors.push("A valid email address is required");
  }

  if (!password || typeof password !== "string" || password.length === 0) {
    errors.push("Password is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateRegisterInput,
  validateLoginInput,
};
