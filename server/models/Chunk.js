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

    // Primary exact citation page
    page: {
      type: Number,
      required: true,
    },

    // Only populated when chunk genuinely spans multiple pages
    pages: {
      type: [Number],
      default: undefined,
    },

    // Detailed source provenance per page segment (only for multi-page chunks)
    sourceSegments: {
      type: [sourceSegmentSchema],
      default: undefined,
    },

    chunkIndex: {
      type: Number,
      required: true,
    },

    // Embedding vector: 1024-dimensional unit-normalized vector (embed-v4.0)
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