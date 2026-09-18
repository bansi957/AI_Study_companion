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

/**
 * Extract publicId from a Cloudinary URL if not explicitly stored
 */
const extractCloudinaryPublicId = (url) => {
  if (!url || typeof url !== "string" || !url.includes("cloudinary.com")) return null;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    let pathAfterUpload = pathname.substring(uploadIndex + "/upload/".length);
    // Remove version tag if present e.g. v172654321/
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");
    return pathAfterUpload;
  } catch {
    return null;
  }
};

/**
 * Robustly delete an asset from Cloudinary:
 * Tries the given public_id (and public_id extracted from URL),
 * handles both "raw" and "image" resource types, handles extensions, and invalidates CDN cache.
 * @returns {Promise<boolean>}
 */
const deleteCloudinaryAsset = async (publicId, fileUrl, preferredType = "raw") => {
  if (!isCloudinaryConfigured()) return false;
  const idToDelete = publicId || extractCloudinaryPublicId(fileUrl);
  if (!idToDelete) return false;

  const typesToTry = preferredType === "raw" ? ["raw", "image"] : ["image", "raw"];
  const candidateIds = [idToDelete];
  if (idToDelete.endsWith(".pdf")) {
    candidateIds.push(idToDelete.replace(/\.pdf$/i, ""));
  } else {
    candidateIds.push(`${idToDelete}.pdf`);
  }

  for (const rType of typesToTry) {
    for (const candId of candidateIds) {
      try {
        const res = await cloudinary.uploader.destroy(candId, {
          resource_type: rType,
          invalidate: true,
        });
        if (res && (res.result === "ok" || res.result === "deleted")) {
          return true;
        }
      } catch (err) {
        // Fallthrough to next combination
      }
    }
  }
  return false;
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  extractCloudinaryPublicId,
  deleteCloudinaryAsset,
};

