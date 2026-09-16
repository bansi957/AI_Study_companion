const mongoose = require("mongoose");

const spaceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    icon: {
      type: String,
      default: "📚",
    },
  },
  {
    timestamps: true,
  }
);

const Space = mongoose.model("Space", spaceSchema);

module.exports = Space;