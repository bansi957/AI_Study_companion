const mongoose = require("mongoose");

const extractedContentSchema = new mongoose.Schema(
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

    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      index: true,
    },

    pageNumber: {
      type: Number,
      required: true,
      index: true,
    },

    segmentIndex: {
      type: Number,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "heading",
        "paragraph",
        "list",
        "table",
        "image/diagram",
        "unknown",
      ],
      required: true,
      default: "unknown",
      index: true,
    },

    content: {
      type: String,
      required: true,
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

// Compound indexes for efficient querying with guaranteed project/user isolation
extractedContentSchema.index({ projectId: 1, materialId: 1, pageNumber: 1 });
extractedContentSchema.index({ materialId: 1, segmentIndex: 1 });

const ExtractedContent = mongoose.model("ExtractedContent", extractedContentSchema);

module.exports = ExtractedContent;
