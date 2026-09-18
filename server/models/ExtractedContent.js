const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "heading",
        "paragraph",
        "list",
        "table",
        "image/diagram",
        "unknown",
      ],
      default: "unknown",
    },
    text: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const pageSchema = new mongoose.Schema(
  {
    page: {
      type: Number,
      required: true,
    },
    blocks: [blockSchema],
  },
  { _id: false }
);

const extractedContentSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    pages: [pageSchema],

    totalPages: {
      type: Number,
      default: 0,
    },

    totalCharacters: {
      type: Number,
      default: 0,
    },

    stats: {
      headings: { type: Number, default: 0 },
      paragraphs: { type: Number, default: 0 },
      lists: { type: Number, default: 0 },
      tables: { type: Number, default: 0 },
      images: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 },
      ocrPages: { type: Number, default: 0 },
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

// Indexes: Strict 1-to-1 material mapping with unique index
extractedContentSchema.index({ materialId: 1 }, { unique: true });
extractedContentSchema.index({ projectId: 1, materialId: 1 });

const ExtractedContent = mongoose.model("ExtractedContent", extractedContentSchema);

module.exports = ExtractedContent;
