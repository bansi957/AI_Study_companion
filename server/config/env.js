const dotenv = require("dotenv");

const loadEnv = () => {
  dotenv.config();

  return {
    port: process.env.PORT || 5000,
    db: process.env.DB || "",
    redisUrl: process.env.REDIS_URL || "",
    jwtSecret: process.env.JWT_SECRET || "",
    nodeEnv: process.env.NODE_ENV || "development",
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  };
};

module.exports = loadEnv;
