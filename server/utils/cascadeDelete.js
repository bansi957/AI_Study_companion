const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Project = require("../models/Project");
const Space = require("../models/Space");
const Material = require("../models/Material");
const Chunk = require("../models/Chunk");
const Concept = require("../models/Concept");
const ExtractedContent = require("../models/ExtractedContent");
const Conversation = require("../models/Conversation");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const Mastery = require("../models/Mastery");
const MasteryHistory = require("../models/MasteryHistory");
const Activity = require("../models/Activity");
const Recommendation = require("../models/Recommendation");
const AIUsage = require("../models/AIUsage");
const { deleteCloudinaryAsset } = require("../config/cloudinary");

const uploadDir = path.join(__dirname, "..", "uploads");

/**
 * Completely purge one or more projects and all associated sub-resources:
 * - Conversations, chats, messages, and citations history
 * - Quizzes, quiz questions, and quiz attempt histories
 * - Concepts and extracted structured contents
 * - Mastery levels and mastery history logs
 * - Vector embedding chunks
 * - Materials (and their Cloudinary PDFs + local files)
 * - Recommendations
 * - Project activity history logs
 * - Project AI usage metrics
 * - The Project documents themselves
 *
 * @param {Array<string|mongoose.Types.ObjectId>} projectIds - Array of project IDs to purge
 * @returns {Promise<Object>} Summary of deleted items
 */
const cascadeDeleteProjects = async (projectIds) => {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return { deletedProjectsCount: 0 };
  }

  const rawIds = projectIds.filter(Boolean);
  const objectIds = rawIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const stringIds = rawIds.map((id) => id.toString());
  const allIds = Array.from(new Set([...objectIds, ...stringIds]));

  const filter = {
    $or: [{ projectId: { $in: objectIds } }, { projectId: { $in: stringIds } }],
  };

  // 1. Purge all associated PDFs from Cloudinary & local storage
  try {
    const materials = await Material.find(filter);
    if (materials && materials.length > 0) {
      await Promise.allSettled(
        materials.map(async (mat) => {
          // Cloudinary deletion
          if (mat.cloudinaryPublicId || mat.fileUrl) {
            await deleteCloudinaryAsset(
              mat.cloudinaryPublicId,
              mat.fileUrl,
              mat.cloudinaryResourceType || "raw"
            ).catch((err) => {
              console.warn(`[CascadeDelete] Cloudinary asset delete warning: ${err.message}`);
            });
          }
          // Local file deletion fallback
          if (mat.filename) {
            const filePath = path.join(uploadDir, mat.filename);
            await fs.promises.unlink(filePath).catch(() => {});
          }
        })
      );
    }
  } catch (fileErr) {
    console.warn(`[CascadeDelete] Material file cleanup warning: ${fileErr.message}`);
  }

  // 2. Cascade delete all project-associated collections concurrently
  const [
    conversationsRes,
    quizzesRes,
    quizAttemptsRes,
    masteryRes,
    masteryHistoryRes,
    materialsRes,
    chunksRes,
    conceptsRes,
    extractedRes,
    activitiesRes,
    recommendationsRes,
    aiUsageRes,
    projectsRes,
  ] = await Promise.all([
    // Entire conversations and chats history
    Conversation.deleteMany(filter),
    // All quizzes and quiz attempts
    Quiz.deleteMany(filter),
    QuizAttempt.deleteMany(filter),
    // Mastery records and progression history
    Mastery.deleteMany(filter),
    MasteryHistory.deleteMany(filter),
    // Materials, Chunks, Concepts, ExtractedContent
    Material.deleteMany(filter),
    Chunk.deleteMany(filter),
    Concept.deleteMany(filter),
    ExtractedContent.deleteMany(filter),
    // Activity logs matching projectId or metadata.projectId
    Activity.deleteMany({
      $or: [
        { projectId: { $in: objectIds } },
        { projectId: { $in: stringIds } },
        { "metadata.projectId": { $in: stringIds } },
      ],
    }),
    // Recommendations
    Recommendation.deleteMany(filter),
    // AI Usage logs
    AIUsage.deleteMany(filter),
    // Finally, Project documents themselves
    Project.deleteMany({ _id: { $in: allIds } }),
  ]);

  return {
    deletedProjectsCount: projectsRes.deletedCount,
    deletedConversationsCount: conversationsRes.deletedCount,
    deletedQuizzesCount: quizzesRes.deletedCount,
    deletedQuizAttemptsCount: quizAttemptsRes.deletedCount,
    deletedMaterialsCount: materialsRes.deletedCount,
    deletedChunksCount: chunksRes.deletedCount,
    deletedConceptsCount: conceptsRes.deletedCount,
  };
};

/**
 * Completely purge a Space and all of its associated projects,
 * including all conversations, chats, materials, quizzes, and history.
 *
 * @param {string|mongoose.Types.ObjectId} spaceId - Space ID to purge
 * @param {string|mongoose.Types.ObjectId} userId - Authenticated user ID
 * @returns {Promise<Object|null>} Summary or null if space not found
 */
const cascadeDeleteSpace = async (spaceId, userId) => {
  const spaceObjectId = mongoose.Types.ObjectId.isValid(spaceId)
    ? new mongoose.Types.ObjectId(spaceId)
    : spaceId;

  // 1. Verify Space exists and belongs to user
  const space = await Space.findOne({
    _id: spaceObjectId,
    userId,
  });

  if (!space) {
    return null;
  }

  // 2. Find all projects belonging to this space
  const projects = await Project.find({
    spaceId: { $in: [spaceId, spaceObjectId] },
    userId,
  }).select("_id");

  const projectIds = projects.map((p) => p._id);

  // 3. Purge all projects and all of their conversations, chats, materials, quizzes, etc.
  let projectDeletionSummary = { deletedProjectsCount: 0 };
  if (projectIds.length > 0) {
    projectDeletionSummary = await cascadeDeleteProjects(projectIds);
  }

  // 4. Delete Space-level activities
  await Activity.deleteMany({
    userId,
    $or: [
      { "metadata.spaceId": spaceId.toString() },
      { "metadata.spaceId": spaceObjectId },
    ],
  });

  // 5. Delete the Space document itself
  await Space.deleteOne({ _id: spaceObjectId });

  return {
    space,
    deletedProjectsCount: projectIds.length,
    projectDeletionSummary,
  };
};

module.exports = {
  cascadeDeleteProjects,
  cascadeDeleteSpace,
};
