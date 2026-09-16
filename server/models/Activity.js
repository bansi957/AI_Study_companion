const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: [
        "SPACE_CREATED",
        "PROJECT_CREATED",
        "MATERIAL_UPLOADED",
        "MATERIAL_PROCESSED",
        "TUTOR_MESSAGE",
        "QUIZ_STARTED",
        "QUESTION_ANSWERED",
        "QUIZ_COMPLETED",
        "ASSESSMENT_COMPLETED",
        "MASTERY_UPDATED",
        "RECOMMENDATION_CREATED",
      ],
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

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;