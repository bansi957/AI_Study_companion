const mongoose = require("mongoose");

const aiUsageSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },

    feature: {
      type: String,
      enum: [
        "TUTOR",
        "QUIZ_GENERATION",
        "ASSESSMENT",
        "RECOMMENDATION",
        "CONCEPT_EXTRACTION",
        "EMBEDDING",
      ],
      required: true,
    },

    model: {
      type: String,
      required: true,
    },

    latency: {
      type: Number,
      default: 0,
    },

    inputTokens: {
      type: Number,
      default: 0,
    },

    outputTokens: {
      type: Number,
      default: 0,
    },

    estimatedCost: {
      type: Number,
      default: 0,
    },

    success: {
      type: Boolean,
      default: true,
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const AIUsage = mongoose.model("AIUsage", aiUsageSchema);

module.exports = AIUsage;