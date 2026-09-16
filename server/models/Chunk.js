const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
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

    page: {
      type: Number,
      default: null,
    },

    chunkIndex: {
      type: Number,
      required: true,
    },

    embedding: {
      type: [Number],
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

const Chunk = mongoose.model("Chunk", chunkSchema);

module.exports = Chunk;