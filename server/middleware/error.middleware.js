const errorMiddleware = (error, req, res, next) => {
  console.error(`[Server Error] ${req.method} ${req.originalUrl}:`, error);

  const statusCode = error.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production" && statusCode >= 500
      ? "Internal Server Error"
      : error.message || "An error occurred";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorMiddleware;
