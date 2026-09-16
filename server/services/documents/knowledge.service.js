/**
 * Knowledge Extraction Service
 * Pipeline contract for future extraction of concepts, topics, and relationships.
 */
class KnowledgeService {
  /**
   * Extract knowledge from extracted document content
   * @param {Object} extractedContent - Output from extractionService.extract
   * @param {Object} context - Context object { materialId, projectId, userId }
   * @returns {Promise<Object>} Structured contract result
   */
  async extract(extractedContent, context = {}) {
    // Contract stub for future AI-powered knowledge extraction.
    // Does not invent fake production records.
    return {
      status: "PENDING_IMPLEMENTATION",
      concepts: [],
      topics: [],
      metadata: {
        stage: "knowledge_extraction",
        ready: false,
        materialId: context.materialId || null,
        projectId: context.projectId || null,
      },
    };
  }
}

module.exports = new KnowledgeService();
