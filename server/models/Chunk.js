const mongoose = require("mongoose");

const sourceSegmentSchema = new mongoose.Schema(
  {
    page: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    segmentType: {
      type: String,
      default: "paragraph",
    },
  },
  { _id: false }
);

const chunkSchema = new mongoose.Schema(
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

    text: {
      type: String,
      required: true,
    },

    // Primary / start page
    page: {
      type: Number,
      default: null,
    },

    // All pages spanned by this chunk
    pages: {
      type: [Number],
      default: [],
    },

    // Detailed source provenance per page segment
    sourceSegments: {
      type: [sourceSegmentSchema],
      default: [],
    },

    chunkIndex: {
      type: Number,
      required: true,
    },

    // Embedding vector (optional for Step 13, populated in future embedding stage)
    embedding: {
      type: [Number],
      required: false,
      default: null,
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

chunkSchema.index({ materialId: 1, chunkIndex: 1 }, { unique: true });
chunkSchema.index({ projectId: 1, chunkIndex: 1 });

const Chunk = mongoose.model("Chunk", chunkSchema);

module.exports = Chunk;