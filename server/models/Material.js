const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    filename: {
      type: String,
      required: true,
      trim: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    fileUrl: {
      type: String,
      required: true,
    },

    fileType: {
      type: String,
      default: "application/pdf",
    },

    fileSize: {
      type: Number,
    },

    status: {
      type: String,
      enum: [
        "QUEUED",
        "PROCESSING",
        "READY",
        "FAILED"
      ],
      default: "QUEUED",
      index: true,
    },

    pageCount: {
      type: Number,
      default: 0,
    },

    extractedTextLength: {
      type: Number,
      default: 0,
    },

    processingError: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    structureStats: {
      headings: { type: Number, default: 0 },
      paragraphs: { type: Number, default: 0 },
      lists: { type: Number, default: 0 },
      tables: { type: Number, default: 0 },
      images: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 },
      ocrPages: { type: Number, default: 0 },
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Material = mongoose.model("Material", materialSchema);

module.exports = Material;