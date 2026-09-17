const apiResponse = require("../utils/apiResponse");
const adminService = require("../services/analytics/admin.service");

/**
 * GET /api/admin/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await adminService.getDashboardOverview();
    return apiResponse(res, 200, "Admin dashboard retrieved successfully", dashboard);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/users
 */
const getUsers = async (req, res, next) => {
  try {
    const { page, limit, search, role } = req.query;
    const result = await adminService.getUsers({ page, limit, search, role });
    return apiResponse(res, 200, "Users retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/users/:userId
 */
const getUserDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const details = await adminService.getUserById(userId);
    if (!details) {
      return apiResponse(res, 404, "User not found");
    }
    return apiResponse(res, 200, "User details retrieved successfully", details);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/projects
 */
const getProjects = async (req, res, next) => {
  try {
    const { page, limit, search, userId, spaceId } = req.query;
    const result = await adminService.getProjects({ page, limit, search, userId, spaceId });
    return apiResponse(res, 200, "Projects retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/activities
 */
const getActivities = async (req, res, next) => {
  try {
    const { page, limit, userId, projectId, type } = req.query;
    const result = await adminService.getActivities({ page, limit, userId, projectId, type });
    return apiResponse(res, 200, "Activities retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/ai-usage
 */
const getAIUsage = async (req, res, next) => {
  try {
    const { feature, model, startDate, endDate } = req.query;
    const stats = await adminService.getAIUsageSummary({ feature, model, startDate, endDate });
    return apiResponse(res, 200, "AI usage metrics retrieved successfully", stats);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/processing
 */
const getProcessing = async (req, res, next) => {
  try {
    const monitoring = await adminService.getProcessingMonitoring();
    return apiResponse(res, 200, "Processing monitoring retrieved successfully", monitoring);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/health
 */
const getHealth = async (req, res, next) => {
  try {
    const health = await adminService.getSystemHealth();
    const statusCode = health.status === "unhealthy" ? 503 : 200;
    return apiResponse(res, statusCode, "System health status", health);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getUsers,
  getUserDetails,
  getProjects,
  getActivities,
  getAIUsage,
  getProcessing,
  getHealth,
};
