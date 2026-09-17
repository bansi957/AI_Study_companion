const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const Assessment = require("../../models/Assessment");
const Concept = require("../../models/Concept");
const Project = require("../../models/Project");
const AIUsage = require("../../models/AIUsage");
const retrievalService = require("../retrieval/retrieval.service");
const masteryService = require("../learning/mastery.service");
const llmService = require("./llm.service");

/**
 * Open-Ended Assessment Service
 *
 * Generates conceptual open-ended questions targeting specific project concepts,
 * grounds evaluations strictly in retrieved project materials, provides deep
 * structured pedagogical feedback (understanding, accuracy, relevance, reasoning,
 * covered and missing concepts), and stores evidence for mastery.
 */
class AssessmentService {
  constructor() {
    this.primaryModel = process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
  }

  getGroqClient() {
    return llmService.getGroqClient();
  }

  /**
   * Generate an open-ended assessment question for a Project
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {string|mongoose.Types.ObjectId} [params.conceptId] - Optional specific concept to target
   * @returns {Promise<Object>} Created Assessment document
   */
  async generateAssessment({ userId, projectId, conceptId = null }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify project ownership
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Select Target Concept
    let targetConcept = null;
    if (conceptId) {
      if (!mongoose.Types.ObjectId.isValid(conceptId)) {
        const err = new Error("Invalid concept ID");
        err.statusCode = 400;
        throw err;
      }
      targetConcept = await Concept.findOne({ _id: conceptId, projectId }).lean();
      if (!targetConcept) {
        const err = new Error("Concept not found in this project");
        err.statusCode = 404;
        throw err;
      }
    } else {
      // Auto-select: Fetch project concepts and find lowest mastery or highest importance
      const concepts = await Concept.find({ projectId }).lean();
      if (!concepts || concepts.length === 0) {
        const err = new Error("No concepts found for this project. Please extract concepts or add materials first.");
        err.statusCode = 400;
        throw err;
      }

      const masteryMap = await masteryService.getProjectMasteryMap({ userId, projectId });
      const scored = concepts.map((c) => {
        const m = masteryMap.get(c._id.toString());
        const masteryScore = m ? m.score : 0;
        const importance = c.importance || 3;
        // Priority score: higher need for lower mastery and higher importance
        const priority = (100 - masteryScore) * 0.6 + importance * 8;
        return { concept: c, priority };
      });

      scored.sort((a, b) => b.priority - a.priority);
      targetConcept = scored[0].concept;
    }

    // 3. Retrieve relevant project material chunks to ground the question
    let contextText = "";
    try {
      const retrieval = await retrievalService.retrieveForQuery({
        projectId,
        userId,
        query: `${targetConcept.name} ${targetConcept.description || ""}`,
        topK: 3,
        allowDevFallback: true,
      });
      if (retrieval.results && retrieval.results.length > 0) {
        contextText = retrieval.results.map((r) => r.text).join("\n\n");
      } else {
        const rawChunks = await Chunk.find({ projectId }).limit(3).lean();
        if (rawChunks && rawChunks.length > 0) {
          contextText = rawChunks.map((c) => c.text).join("\n\n");
        }
      }
    } catch (e) {
      try {
        const rawChunks = await Chunk.find({ projectId }).limit(3).lean();
        if (rawChunks && rawChunks.length > 0) {
          contextText = rawChunks.map((c) => c.text).join("\n\n");
        }
      } catch (innerErr) {}
    }

    // 4. Generate open-ended question using Groq LLM
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let question = "";
    let rubric = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const promptText = `Generate a rigorous, pedagogical open-ended assessment question for the concept "${targetConcept.name}" in project "${project.name}".
Concept Description: ${targetConcept.description || "Foundational concept"}

Project Context Excerpts:
${contextText || "General project educational materials"}

The question should prompt the student to explain the underlying principles, how it functions, and why it is important (not just a yes/no or superficial definition).
Also generate a brief 2-3 sentence rubric of key points an ideal answer should cover.

Return strictly a valid JSON object with the following schema:
{
  "question": "Clear, thoughtful open-ended question",
  "rubric": "Key concepts and mechanisms the student must address"
}`;

    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: this.primaryModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert professor designing open-ended assessment questions grounded in course materials. Respond ONLY with valid JSON matching the requested schema.",
            },
            {
              role: "user",
              content: promptText,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const latency = Date.now() - startTime;
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;

        const content = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        question = parsed.question || `Explain the mechanism and importance of ${targetConcept.name}.`;
        rubric = parsed.rubric || `Covers definitions, mechanism, and practical significance of ${targetConcept.name}.`;

        await this.recordAssessmentUsage({
          userId,
          projectId,
          model: this.primaryModel,
          latency,
          inputTokens,
          outputTokens,
          success: true,
        });
      } catch (err) {
        const latency = Date.now() - startTime;
        await this.recordAssessmentUsage({
          userId,
          projectId,
          model: this.primaryModel,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });
        question = `In your own words, explain the core principles and significance of ${targetConcept.name}. How does it operate within ${project.name}?`;
        rubric = `Must define ${targetConcept.name}, describe how it functions, and explain its primary role.`;
      }
    } else {
      question = `In your own words, explain the core principles and significance of ${targetConcept.name}. How does it operate within ${project.name}?`;
      rubric = `Must define ${targetConcept.name}, describe how it functions, and explain its primary role.`;
    }

    // 5. Persist Assessment document
    const assessment = new Assessment({
      userId,
      projectId,
      conceptId: targetConcept._id,
      question,
      referenceContext: contextText.slice(0, 1500),
      rubric,
      status: "pending",
    });

    await assessment.save();
    return assessment;
  }

  /**
   * Submit answer to an open-ended assessment and evaluate with Groq LLM
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.assessmentId
   * @param {string} params.answer
   * @returns {Promise<Object>} Evaluated Assessment document with structured evaluation
   */
  async submitAndEvaluate({ userId, assessmentId, answer }) {
    if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
      const err = new Error("Invalid or missing assessment ID");
      err.statusCode = 400;
      throw err;
    }

    if (!answer || typeof answer !== "string" || !answer.trim()) {
      const err = new Error("Answer text is required");
      err.statusCode = 400;
      throw err;
    }

    const cleanAnswer = answer.trim();

    // 1. Verify assessment and ownership
    const assessment = await Assessment.findOne({ _id: assessmentId, userId });
    if (!assessment) {
      const err = new Error("Assessment not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Fetch target Concept and Project
    const [project, concept] = await Promise.all([
      Project.findOne({ _id: assessment.projectId, userId }),
      Concept.findById(assessment.conceptId).lean(),
    ]);

    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 3. Grounding: Retrieve relevant Project material chunks
    let retrievedContext = "";
    let retrievedChunks = [];
    try {
      const retrieval = await retrievalService.retrieveForQuery({
        projectId: assessment.projectId,
        userId,
        query: `${assessment.question} ${concept ? concept.name : ""}`,
        topK: 4,
        allowDevFallback: true,
      });
      retrievedChunks = retrieval.results || [];
      if (retrievedChunks.length > 0) {
        retrievedContext = retrieval.context || retrievedChunks.map((c) => c.text).join("\n\n");
      } else {
        const rawChunks = await Chunk.find({ projectId: assessment.projectId }).limit(4).lean();
        if (rawChunks && rawChunks.length > 0) {
          retrievedContext = rawChunks.map((c) => c.text).join("\n\n");
        }
      }
    } catch (e) {
      try {
        const rawChunks = await Chunk.find({ projectId: assessment.projectId }).limit(4).lean();
        if (rawChunks && rawChunks.length > 0) {
          retrievedContext = rawChunks.map((c) => c.text).join("\n\n");
        } else {
          retrievedContext = assessment.referenceContext || "";
        }
      } catch (innerErr) {
        retrievedContext = assessment.referenceContext || "";
      }
    }

    // 4. Handle insufficient Project evidence
    const hasEvidence = (retrievedContext && retrievedContext.trim().length > 30) || (assessment.referenceContext && assessment.referenceContext.trim().length > 30);
    if (!hasEvidence) {
      const fallbackEvaluation = {
        score: 50,
        understanding: "Unable to verify full depth due to limited project material context.",
        strengths: ["Student provided a structured answer."],
        missingConcepts: ["Insufficient project reference material available to verify all specific claims."],
        feedback: "The project does not currently contain enough reference materials to comprehensively evaluate this specific answer against course content.",
        conceptsCovered: concept ? [concept.name] : [],
        reasoning: "Evaluation constrained by insufficient source materials in the project.",
      };

      assessment.userAnswer = cleanAnswer;
      assessment.evaluation = fallbackEvaluation;
      assessment.status = "evaluated";
      assessment.submittedAt = new Date();
      assessment.evaluatedAt = new Date();
      await assessment.save();

      return assessment;
    }

    const effectiveContext = retrievedContext || assessment.referenceContext;

    // 5. Invoke Groq LLM for comprehensive pedagogical evaluation
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let evaluation = null;
    let inputTokens = 0;
    let outputTokens = 0;

    const evalPrompt = `You are an expert academic evaluator. Evaluate the student's open-ended answer strictly against the provided Project Learning Materials Context.
Do NOT invent facts or evaluate based on external claims not grounded in the context.

Target Concept: "${concept ? concept.name : "Concept"}"
Question: "${assessment.question}"
Rubric Guidelines: "${assessment.rubric || "Evaluate understanding, accuracy, and completeness"}"

[Project Learning Materials Context]:
${effectiveContext}

[Student Answer]:
${cleanAnswer}

Evaluate the student's submission considering:
- understanding (depth vs superficiality)
- accuracy (factual correctness against the project materials)
- relevance (how directly it answers the question)
- concepts covered (which concepts/mechanisms the student correctly explained)
- missing concepts (key ideas or mechanisms omitted)
- reasoning (clarity of logical explanations)

Return strictly a valid JSON object with the following schema:
{
  "score": integer between 0 and 100,
  "understanding": "Detailed assessment of the student's depth of understanding",
  "strengths": ["List of specific strong points in the student's explanation"],
  "missingConcepts": ["List of key concepts or mechanisms the student omitted or got wrong"],
  "feedback": "Actionable, constructive pedagogical feedback to improve understanding",
  "conceptsCovered": ["List of concepts accurately covered in the answer"],
  "reasoning": "Clear explanation of how the score was determined based on evidence"
}`;

    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: this.primaryModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert academic evaluator. Respond strictly with valid JSON matching the requested evaluation schema. Do not output markdown code fences outside the JSON.",
            },
            {
              role: "user",
              content: evalPrompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1, // low temperature for consistent, grounded evaluation
        });

        const latency = Date.now() - startTime;
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;

        const content = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        evaluation = {
          score: typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 70,
          understanding: String(parsed.understanding || "Demonstrates general conceptual understanding.").trim(),
          strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths : ["Answer attempts to address the core question."],
          missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts : [],
          feedback: String(parsed.feedback || "Good effort. Review project materials for deeper mechanics.").trim(),
          conceptsCovered: Array.isArray(parsed.conceptsCovered) && parsed.conceptsCovered.length > 0 ? parsed.conceptsCovered : [concept ? concept.name : "Target Concept"],
          reasoning: String(parsed.reasoning || "Evaluation grounded in project learning materials.").trim(),
        };

        await this.recordAssessmentUsage({
          userId,
          projectId: assessment.projectId,
          model: this.primaryModel,
          latency,
          inputTokens,
          outputTokens,
          success: true,
        });
      } catch (err) {
        const latency = Date.now() - startTime;
        await this.recordAssessmentUsage({
          userId,
          projectId: assessment.projectId,
          model: this.primaryModel,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });

        evaluation = this.heuristicEvaluation({ answer: cleanAnswer, concept, context: effectiveContext });
      }
    } else {
      evaluation = this.heuristicEvaluation({ answer: cleanAnswer, concept, context: effectiveContext });
    }

    // 6. Persist Answer, Evaluation, and Timestamps to Assessment Model
    assessment.userAnswer = cleanAnswer;
    assessment.evaluation = evaluation;
    assessment.status = "evaluated";
    assessment.submittedAt = new Date();
    assessment.evaluatedAt = new Date();
    await assessment.save();

    // 7. Record Mastery Evidence from Assessment
    if (assessment.conceptId && evaluation && typeof evaluation.score === "number") {
      await masteryService.recordMasteryEvidence({
        userId,
        projectId: assessment.projectId,
        conceptId: assessment.conceptId,
        score: evaluation.score,
        source: "assessment",
      });
    }

    return assessment;
  }

  /**
   * Deterministic local evaluation fallback for testing or offline environments
   */
  heuristicEvaluation({ answer, concept, context }) {
    const conceptName = concept ? concept.name : "Concept";
    const answerLower = answer.toLowerCase();
    const hasConceptMention = answerLower.includes(conceptName.toLowerCase());
    const length = answer.trim().split(/\s+/).length;

    let score = 50;
    if (hasConceptMention) score += 20;
    if (length > 30) score += 15;
    if (length > 70) score += 10;
    score = Math.min(score, 95);

    return {
      score,
      understanding: score >= 75 ? "Strong conceptual understanding demonstrated." : "Foundational understanding with some gaps in explanation.",
      strengths: [
        `Directly addresses ${conceptName}.`,
        length > 20 ? "Provides descriptive elaboration." : "Succinct response.",
      ],
      missingConcepts: score < 75 ? [`Deeper mathematical or operational details of ${conceptName}.`] : [],
      feedback: `To achieve maximum score, expand on how ${conceptName} interacts with other components in the project.`,
      conceptsCovered: [conceptName],
      reasoning: `Scored ${score}/100 based on keyword presence, elaboration depth, and conceptual alignment.`,
    };
  }

  /**
   * Get single assessment by ID for authorized user
   */
  async getAssessmentById({ userId, assessmentId }) {
    if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
      const err = new Error("Invalid assessment ID");
      err.statusCode = 400;
      throw err;
    }

    const assessment = await Assessment.findOne({ _id: assessmentId, userId })
      .populate("conceptId", "name description importance")
      .lean();

    if (!assessment) {
      const err = new Error("Assessment not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    return assessment;
  }

  /**
   * List assessments for a project
   */
  async listAssessmentsByProject({ userId, projectId }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid project ID");
      err.statusCode = 400;
      throw err;
    }

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const assessments = await Assessment.find({ projectId, userId })
      .populate("conceptId", "name description importance")
      .sort({ createdAt: -1 })
      .lean();

    return assessments;
  }

  /**
   * Record AIUsage audit entry with feature='ASSESSMENT'
   */
  async recordAssessmentUsage({ userId, projectId, model, latency, inputTokens, outputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "ASSESSMENT",
        model,
        latency,
        inputTokens,
        outputTokens,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[AssessmentService] Failed to record AIUsage: ${err.message}`);
    }
  }
}

module.exports = new AssessmentService();
