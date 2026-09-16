const mongoose = require("mongoose");

const masteryHistorySchema = new mongoose.Schema(
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
      required: true,
    },

    source: {
      type: String,
      enum: ["quiz", "assessment", "tutor"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const MasteryHistory = mongoose.model(
  "MasteryHistory",
  masteryHistorySchema
);

module.exports = MasteryHistory;