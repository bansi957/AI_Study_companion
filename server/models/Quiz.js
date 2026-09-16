const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["mcq", "open-ended"],
      required: true,
    },

    question: {
      type: String,
      required: true,
    },

    options: {
      type: [String],
      default: [],
    },

    correctAnswer: {
      type: String,
      default: null,
    },

    conceptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Concept",
      required: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },

    explanation: {
      type: String,
      default: "",
    },
  },
  {
    _id: true,
  }
);

const quizSchema = new mongoose.Schema(
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

    questions: {
      type: [questionSchema],
      required: true,
    },

    difficulty: {
      type: String,
      enum: ["adaptive", "easy", "medium", "hard"],
      default: "adaptive",
    },

    totalQuestions: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Quiz = mongoose.model("Quiz", quizSchema);

module.exports = Quiz;