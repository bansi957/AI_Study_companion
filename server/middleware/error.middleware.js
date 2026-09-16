const errorMiddleware = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode >= 500 ? "Internal Server Error" : (error.message || "An error occurred");

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorMiddleware;
