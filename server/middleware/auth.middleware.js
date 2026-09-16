const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const apiResponse = require("../utils/apiResponse");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return apiResponse(res, 401, "Authentication token required");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return apiResponse(res, 401, "Authentication token required");
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return apiResponse(res, 401, "Invalid or expired token");
    }

    if (!decoded || !decoded.userId) {
      return apiResponse(res, 401, "Invalid token payload");
    }

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
      return apiResponse(res, 401, "User not found or no longer active");
    }

    req.user = {
      userId: user._id.toString(),
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    return apiResponse(res, 500, "Internal server error");
  }
};

module.exports = authMiddleware;
