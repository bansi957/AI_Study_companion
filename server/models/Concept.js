const mongoose = require("mongoose");

const conceptItemSchema = new mongoose.Schema(
  {
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
    parentConcept: {
      type: String,
      trim: true,
      default: null,
    },
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
  { _id: true }
);

const conceptSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      unique: true,
      index: true,
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
      index: true,
    },
    concepts: [conceptItemSchema],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);


/**
 * Helper to fetch all flattened concept items for a project
 */
conceptSchema.statics.findConceptsByProject = async function (projectId) {
  if (!projectId) return [];
  const docs = await this.find({ projectId }).lean();
  const all = [];
  for (const doc of docs) {
    if (Array.isArray(doc.concepts)) {
      for (const c of doc.concepts) {
        all.push({
          ...c,
          materialId: doc.materialId,
          projectId: doc.projectId,
        });
      }
    }
  }
  return all.sort((a, b) => (b.importance || 3) - (a.importance || 3));
};

/**
 * Helper to find a specific concept item by its subdocument _id
 */
conceptSchema.statics.findConceptById = async function (conceptId) {
  if (!conceptId) return null;
  const cid = conceptId.toString();
  const doc = await this.findOne({ "concepts._id": cid }).lean();
  if (!doc || !Array.isArray(doc.concepts)) return null;
  const found = doc.concepts.find((c) => c._id && c._id.toString() === cid);
  if (!found) return null;
  return {
    ...found,
    materialId: doc.materialId,
    projectId: doc.projectId,
  };
};

const Concept = mongoose.model("Concept", conceptSchema);

module.exports = Concept;