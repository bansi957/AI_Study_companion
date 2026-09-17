const apiResponse = require("../utils/apiResponse");

const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return apiResponse(res, 401, "Authentication token required");
  }

  if (req.user.role !== "admin") {
    return apiResponse(res, 403, "Access denied. Admin privileges required.");
  }

  next();
};

module.exports = adminMiddleware;

