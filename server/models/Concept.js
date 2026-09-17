const mongoose = require("mongoose");

const conceptSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    sourceMaterialIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Material",
      },
    ],

    importance: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },

    sourcePages: [
      {
        type: Number,
      },
    ],

    relatedConcepts: [
      {
        type: String,
        trim: true,
      },
    ],

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index by project and concept name for fast lookups and deduplication
conceptSchema.index({ projectId: 1, name: 1 });
conceptSchema.index({ projectId: 1, "metadata.canonicalKey": 1 });
conceptSchema.index({ projectId: 1, importance: -1 });

const Concept = mongoose.model("Concept", conceptSchema);

module.exports = Concept;