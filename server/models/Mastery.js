const mongoose = require("mongoose");

const masterySchema = new mongoose.Schema(
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
    },

    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },

    lastEvidence: {
      type: String,
      enum: ["quiz", "assessment", "tutor", "manual"],
      default: "quiz",
    },

    lastAssessedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

masterySchema.index(
  {
    userId: 1,
    projectId: 1,
    conceptId: 1,
  },
  {
    unique: true,
  }
);

const Mastery = mongoose.model("Mastery", masterySchema);

module.exports = Mastery;