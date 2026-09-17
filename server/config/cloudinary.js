const { v2: cloudinary } = require("cloudinary");
const loadEnv = require("./env");

const env = loadEnv();

const cleanEnv = (val) => (val || "").replace(/^["']|["']$/g, "").trim();

const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME || env.cloudinaryCloudName);
const apiKey = cleanEnv(process.env.CLOUDINARY_API_KEY || env.cloudinaryApiKey);
const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET || env.cloudinaryApiSecret);

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

/**
 * Checks whether valid Cloudinary credentials have been provided in the environment.
 * @returns {boolean}
 */
const isCloudinaryConfigured = () => {
  return Boolean(cloudName && apiKey && apiSecret);
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
};
