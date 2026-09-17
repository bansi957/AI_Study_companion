const multer = require("multer");
const path = require("path");
const fs = require("fs");
const apiResponse = require("../utils/apiResponse");

const uploadDir = path.join(__dirname, "../uploads");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration:
// Acts as ephemeral staging for multipart streams before uploading to Cloudinary.
// Uploaded files are immediately deleted once transmitted to Cloudinary.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}.pdf`);
  },
});

// File filter: strict PDF validation
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype !== "application/pdf" || ext !== ".pdf") {
    return cb(new Error("Only PDF files are allowed"));
  }
  cb(null, true);
};

// Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

// Middleware wrapper for clean error responses
const handlePdfUpload = (req, res, next) => {
  const uploadSingle = upload.single("file");

  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return apiResponse(res, 400, "File size exceeds 10MB limit");
      }
      return apiResponse(res, 400, err.message);
    } else if (err) {
      return apiResponse(res, 400, err.message);
    }
    next();
  });
};

module.exports = {
  handlePdfUpload,
  uploadDir,
};
