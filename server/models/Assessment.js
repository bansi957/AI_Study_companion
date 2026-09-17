const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema(
  {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    understanding: {
      type: String,
      default: null,
    },
    strengths: {
      type: [String],
      default: [],
    },
    missingConcepts: {
      type: [String],
      default: [],
    },
    feedback: {
      type: String,
      default: null,
    },
    conceptsCovered: {
      type: [String],
      default: [],
    },
    reasoning: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const assessmentSchema = new mongoose.Schema(
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

    conceptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Concept",
      required: true,
      index: true,
    },

    question: {
      type: String,
      required: true,
    },

    referenceContext: {
      type: String,
      default: "",
    },

    rubric: {
      type: String,
      default: "",
    },

    userAnswer: {
      type: String,
      default: null,
    },

    evaluation: {
      type: evaluationSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: ["pending", "submitted", "evaluated"],
      default: "pending",
      index: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    evaluatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

assessmentSchema.index({ userId: 1, projectId: 1, createdAt: -1 });
assessmentSchema.index({ userId: 1, conceptId: 1 });

const Assessment = mongoose.model("Assessment", assessmentSchema);

module.exports = Assessment;
