const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const Quiz = require("../../models/Quiz");
const QuizAttempt = require("../../models/QuizAttempt");
const Concept = require("../../models/Concept");
const Project = require("../../models/Project");
const AIUsage = require("../../models/AIUsage");
const retrievalService = require("../retrieval/retrieval.service");
const masteryService = require("../learning/mastery.service");
const activityService = require("../analytics/activity.service");
const llmService = require("./llm.service");

/**
 * Adaptive Quiz Service
 *
 * Implements intelligent adaptive quiz generation based on concept mastery,
 * past mistakes, performance history, concept importance, and difficulty balancing.
 * Manages quiz attempts, question evaluation, multi-dimensional feedback,
 * and mastery evidence recording.
 */
class QuizService {
  constructor() {
    this.primaryModel = process.env.LLM_MODEL || process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
  }

  getGroqClient() {
    return llmService.getGroqClient();
  }

  /**
   * Generate an adaptive or difficulty-specific quiz
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {number} [params.totalQuestions=10]
   * @param {string} [params.difficulty="adaptive"] - 'adaptive' | 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>} Created Quiz document
   */
  /**
   * Generate an adaptive or difficulty-specific quiz
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.projectId
   * @param {number} [params.totalQuestions=10]
   * @param {string} [params.difficulty="adaptive"] - 'adaptive' | 'easy' | 'medium' | 'hard'
   * @param {Array<string>} [params.conceptIds=[]] - Optional list of concept IDs to target
   * @param {string} [params.questionFormat="mixed"] - 'mixed' | 'mcq' | 'open-ended'
   * @returns {Promise<Object>} Created Quiz document
   */
  async generateAdaptiveQuiz({
    userId,
    projectId,
    totalQuestions = 10,
    difficulty = "adaptive",
    conceptIds = [],
    questionFormat = "mixed",
  }) {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      const err = new Error("Invalid or missing project ID");
      err.statusCode = 400;
      throw err;
    }

    const numQuestions = Math.min(Math.max(parseInt(totalQuestions, 10) || 10, 1), 50);

    // 1. Verify project ownership
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      const err = new Error("Project not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const knowledgeService = require("../documents/knowledge.service");

    // 2. Fetch concepts for this project (optional - Quiz works without any Concept documents)
    let concepts = await knowledgeService.getConceptsByProject(projectId);

    // Filter concepts if user explicitly specified conceptIds
    if (Array.isArray(conceptIds) && conceptIds.length > 0 && concepts && concepts.length > 0) {
      const targetIdSet = new Set(conceptIds.map((id) => String(id)));
      const filtered = concepts.filter(
        (c) => targetIdSet.has(c._id.toString()) || (c.recId && targetIdSet.has(String(c.recId)))
      );
      if (filtered.length > 0) {
        concepts = filtered;
      }
    }

    let selectedTargets = [];
    let contextSnippets = "";
    let selectionReason = "";

    if (concepts && concepts.length > 0) {
      // 3. Gather student learning history: mastery map + recent quiz attempts
      const masteryMap = await masteryService.getProjectMasteryMap({ userId, projectId });
      const pastAttempts = await QuizAttempt.find({ userId, projectId, completed: true })
        .sort({ completedAt: -1 })
        .limit(10)
        .lean();

      // 4. Analyze previous mistakes & question history
      const pastMistakeConceptCounts = new Map();
      let totalPastAnswers = 0;
      let totalPastCorrect = 0;

      // Load past quizzes to map questionIds back to conceptIds
      const pastQuizIds = pastAttempts.map((a) => a.quizId);
      const pastQuizzes = await Quiz.find({ _id: { $in: pastQuizIds } }).lean();
      const questionToConceptMap = new Map();
      for (const pq of pastQuizzes) {
        for (const q of pq.questions) {
          if (q.conceptId) {
            questionToConceptMap.set(q._id.toString(), q.conceptId.toString());
          }
        }
      }

      for (const attempt of pastAttempts) {
        for (const ans of attempt.answers || []) {
          totalPastAnswers++;
          if (ans.isCorrect) {
            totalPastCorrect++;
          } else {
            const conceptIdStr = questionToConceptMap.get(ans.questionId.toString());
            if (conceptIdStr) {
              pastMistakeConceptCounts.set(
                conceptIdStr,
                (pastMistakeConceptCounts.get(conceptIdStr) || 0) + 1
              );
            }
          }
        }
      }

      const recentAccuracy = totalPastAnswers > 0 ? totalPastCorrect / totalPastAnswers : 0.5;

      // 5. Adaptive Concept Selection & Difficulty Assignment
      let weakCount = 0;
      let unassessedCount = 0;

      const scoredConcepts = concepts.map((concept) => {
        const cid = concept._id.toString();
        const mastery = masteryMap.get(cid);
        const mistakeCount = pastMistakeConceptCounts.get(cid) || 0;
        const importance = concept.importance || 3;

        let priorityScore = 0;

        // Unassessed concepts or low mastery get high priority
        if (!mastery) {
          priorityScore += 35; // Needs baseline assessment
          unassessedCount++;
        } else {
          // Lower mastery score = higher need for practice
          priorityScore += (100 - mastery.score) * 0.45;
          if (mastery.score < 50) weakCount++;
        }

        // Concepts with repeated past mistakes get extra reinforcement
        priorityScore += mistakeCount * 14;

        // High importance concepts get weight
        priorityScore += importance * 5;

        // Assign targeted question difficulty for this concept
        let assignedDifficulty = "medium";
        if (difficulty === "adaptive") {
          if (!mastery || mastery.score < 40 || mistakeCount > 1) {
            assignedDifficulty = "easy"; // Reinforce fundamentals
          } else if (mastery.score >= 75 && recentAccuracy >= 0.7) {
            assignedDifficulty = "hard"; // Challenge higher mastery
          } else {
            assignedDifficulty = "medium";
          }
        } else {
          assignedDifficulty = ["easy", "medium", "hard"].includes(difficulty)
            ? difficulty
            : "medium";
        }

        return {
          concept,
          priorityScore,
          assignedDifficulty,
          masteryScore: mastery ? mastery.score : null,
          mistakeCount,
        };
      });

      // Sort concepts by priority score descending
      scoredConcepts.sort((a, b) => b.priorityScore - a.priorityScore);

      // Determine open-ended allocation
      let openEndedTargetCount = 0;
      if (questionFormat === "open-ended") {
        openEndedTargetCount = numQuestions;
      } else if (questionFormat === "mixed") {
        if (numQuestions <= 5) openEndedTargetCount = 1;
        else if (numQuestions <= 10) openEndedTargetCount = 3;
        else openEndedTargetCount = 4;
      }

      // Pick top candidates up to numQuestions
      for (let i = 0; i < numQuestions; i++) {
        const candidate = scoredConcepts[i % scoredConcepts.length];
        const isTargetOpenEnded =
          questionFormat === "open-ended" ||
          (questionFormat === "mixed" && i < openEndedTargetCount);

        selectedTargets.push({
          conceptId: candidate.concept.recId || candidate.concept._id,
          conceptName: candidate.concept.name,
          description: candidate.concept.description || "",
          difficulty: candidate.assignedDifficulty,
          type: isTargetOpenEnded ? "open-ended" : "mcq",
        });
      }

      // Build informative selection reason
      const sampleNames = scoredConcepts
        .slice(0, 2)
        .map((c) => c.concept.name)
        .join(", ");

      if (difficulty === "adaptive") {
        if (weakCount > 0 || unassessedCount > 0) {
          selectionReason = `Adaptive mode prioritized ${weakCount > 0 ? `${weakCount} concept(s) requiring reinforcement` : ""}${
            weakCount > 0 && unassessedCount > 0 ? " and " : ""
          }${unassessedCount > 0 ? `${unassessedCount} unassessed concept(s) for baseline evaluation` : ""} (e.g. ${sampleNames}).`;
        } else {
          selectionReason = `Targeting ${concepts.length} key concepts to reinforce mastery across application-level difficulties.`;
        }
      } else {
        selectionReason = `Targeting selected concepts at ${difficulty.toUpperCase()} difficulty with ${questionFormat} assessment.`;
      }

      // 6. Retrieve relevant project context excerpts for selected concepts
      const snippets = [];
      for (let i = 0; i < Math.min(selectedTargets.length, 5); i++) {
        const target = selectedTargets[i];
        try {
          const retrieval = await retrievalService.retrieveForQuery({
            projectId,
            userId,
            query: `${target.conceptName} ${target.description.slice(0, 100)}`,
            topK: 2,
            allowDevFallback: true,
          });
          if (retrieval.results && retrieval.results.length > 0) {
            snippets.push(
              `Concept: ${target.conceptName}\nContext: ${retrieval.results
                .map((r) => r.text)
                .join(" ")
                .slice(0, 500)}`
            );
          }
        } catch (e) {
          // Retrieval non-blocking for quiz generation
        }
      }
      contextSnippets = snippets.join("\n\n---\n\n");
    } else {
      // 3. ZERO CONCEPTS: Generate directly from relevant retrieved chunks via Vector Search!
      const retrieval = await retrievalService.retrieveForQuery({
        projectId,
        userId,
        query: project.learningGoal || project.name || "core concepts principles overview",
        topK: Math.min(numQuestions * 2, 8),
        allowDevFallback: true,
      });

      let retrievedChunks = (retrieval && retrieval.results) ? [...retrieval.results] : [];
      if (retrievedChunks.length === 0) {
        const Chunk = require("../../models/Chunk");
        const directChunks = await Chunk.find({ projectId }).limit(8).lean();
        if (!directChunks || directChunks.length === 0) {
          const err = new Error("No study materials or content found for this project. Please upload materials first.");
          err.statusCode = 400;
          throw err;
        }
        retrievedChunks = directChunks.map((c) => ({
          text: c.text,
          pages: c.pages || [],
        }));
      }

      const openEndedTargetCount = questionFormat === "open-ended" ? numQuestions : questionFormat === "mixed" ? Math.max(1, Math.round(numQuestions * 0.25)) : 0;

      for (let i = 0; i < numQuestions; i++) {
        const chunk = retrievedChunks[i % retrievedChunks.length];
        const pageLabel = chunk.pages && chunk.pages.length > 0 ? `Page ${chunk.pages.join(",")}` : `Section ${i + 1}`;
        const isTargetOpenEnded = i < openEndedTargetCount;

        selectedTargets.push({
          conceptId: null,
          conceptName: `Material Topic (${pageLabel})`,
          topic: `Material Topic (${pageLabel})`,
          description: chunk.text ? chunk.text.slice(0, 200) : "Key topic from study material",
          difficulty: difficulty === "adaptive" ? (i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard") : difficulty,
          type: isTargetOpenEnded ? "open-ended" : "mcq",
        });
      }

      selectionReason = `Generated directly from indexed study material chunks with adaptive difficulty balancing.`;
      contextSnippets = retrievedChunks
        .map((c, idx) => `[Excerpt ${idx + 1} (Page ${c.pages?.join(",") || "N/A"})]:\n${c.text}`)
        .join("\n\n---\n\n");
    }

    // 7. Invoke Groq LLM to generate quiz questions (MCQ + open-ended)
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let rawQuestions = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const generationPrompt = this.buildQuizPrompt({
      projectTitle: project.name,
      targets: selectedTargets,
      contextSnippets,
      totalQuestions: numQuestions,
      overallDifficulty: difficulty,
      questionFormat,
    });

    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: this.primaryModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert educational assessment creator. Generate rigorous, pedagogically sound questions strictly formatted in JSON. For 'mcq', provide 4 options, 1 unambiguous correctAnswer, and an instructive explanation. For 'open-ended', provide thought-provoking conceptual questions, rubric guidelines, expectedKeyPoints, and a comprehensive model explanation with empty options. Do not return markdown blocks outside the JSON.",
            },
            {
              role: "user",
              content: generationPrompt,
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
        rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

        // Record successful AIUsage
        await this.recordQuizUsage({
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
        await this.recordQuizUsage({
          userId,
          projectId,
          model: this.primaryModel,
          latency,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          errorMessage: err.message,
        });
        console.warn(`[QuizService] Groq generation failed, using local template fallback: ${err.message}`);
        rawQuestions = this.generateFallbackQuestions(selectedTargets);
      }
    } else {
      rawQuestions = this.generateFallbackQuestions(selectedTargets);
      outputTokens = Math.ceil(JSON.stringify(rawQuestions).length / 4);
    }

    // 8. Sanitize, map to Concept IDs, and format into Quiz schema
    const formattedQuestions = [];
    for (let i = 0; i < selectedTargets.length; i++) {
      const target = selectedTargets[i];
      const rawQ = rawQuestions[i] || rawQuestions[i % (rawQuestions.length || 1)] || {};
      const isTargetOpenEnded = target.type === "open-ended" || rawQ.type === "open-ended";

      if (isTargetOpenEnded) {
        // Format open-ended question
        formattedQuestions.push({
          type: "open-ended",
          question:
            rawQ.question && rawQ.question.length > 10
              ? String(rawQ.question).trim()
              : `Explain how ${target.conceptName} functions and its architectural role.`,
          options: [],
          correctAnswer: null,
          rubric:
            rawQ.rubric && rawQ.rubric.length > 10
              ? String(rawQ.rubric).trim()
              : `Demonstrate thorough understanding of ${target.conceptName}, citing mechanics, tradeoffs, and key principles.`,
          expectedKeyPoints:
            Array.isArray(rawQ.expectedKeyPoints) && rawQ.expectedKeyPoints.length > 0
              ? rawQ.expectedKeyPoints.map((k) => String(k).trim())
              : [target.conceptName, "Core mechanism", "Operational significance"],
          conceptId: target.conceptId || null,
          topic: target.topic || target.conceptName || null,
          difficulty: ["easy", "medium", "hard"].includes(rawQ.difficulty)
            ? rawQ.difficulty
            : target.difficulty,
          explanation:
            rawQ.explanation && rawQ.explanation.length > 10
              ? String(rawQ.explanation).trim()
              : `${target.conceptName} is vital: ${target.description || "It provides fundamental operational guarantees and system coordination."}`,
        });
      } else {
        // Format MCQ question
        let options = Array.isArray(rawQ.options) && rawQ.options.length >= 2
          ? rawQ.options.map((o) => String(o).trim())
          : [
              `Accurate description of ${target.conceptName}`,
              `Incorrect alternative definition`,
              `Unrelated distractor mechanism`,
              `Contradictory principle`,
            ];

        while (options.length < 4) {
          options.push(`Option ${options.length + 1} for ${target.conceptName}`);
        }
        if (options.length > 4) {
          options = options.slice(0, 4);
        }

        let correctAnswer = String(rawQ.correctAnswer || "").trim();
        if (!options.includes(correctAnswer)) {
          correctAnswer = options[0];
        }

        formattedQuestions.push({
          type: "mcq",
          question:
            rawQ.question && rawQ.question.length > 10
              ? String(rawQ.question).trim()
              : `Which of the following best describes ${target.conceptName}?`,
          options,
          correctAnswer,
          conceptId: target.conceptId || null,
          topic: target.topic || target.conceptName || null,
          difficulty: ["easy", "medium", "hard"].includes(rawQ.difficulty)
            ? rawQ.difficulty
            : target.difficulty,
          explanation:
            rawQ.explanation ||
            `The correct answer is "${correctAnswer}" because it accurately defines ${target.conceptName}.`,
        });
      }
    }

    // 9. Persist Quiz document
    const quiz = new Quiz({
      userId,
      projectId,
      questions: formattedQuestions,
      difficulty,
      questionFormat,
      selectionReason: selectionReason || `Adaptive quiz targeting ${formattedQuestions.length} key areas.`,
      totalQuestions: formattedQuestions.length,
    });

    await quiz.save();
    return quiz;
  }

  /**
   * Build prompt text for LLM quiz generation
   */
  buildQuizPrompt({ projectTitle, targets, contextSnippets, totalQuestions, overallDifficulty, questionFormat }) {
    return `Generate an adaptive educational assessment of ${totalQuestions} questions for the project "${projectTitle}".

Overall Difficulty Mode: ${overallDifficulty}
Question Format Style: ${questionFormat}

Target Items, Formats, and assigned difficulties:
${targets
  .map(
    (t, i) =>
      `${i + 1}. Concept: "${t.conceptName}" | Type: "${t.type}" | Target difficulty: "${t.difficulty}"\n   Description: ${t.description}`
  )
  .join("\n")}

Retrieved Context Excerpts:
${contextSnippets || "Use foundational educational knowledge for each concept."}

Return strictly a valid JSON object with the following schema:
{
  "questions": [
    {
      "conceptName": "Name of concept",
      "type": "mcq" | "open-ended",
      "difficulty": "easy" | "medium" | "hard",
      "question": "Clear, specific question stem",
      "options": ["Option A", "Option B", "Option C", "Option D"], // empty [] if type is open-ended
      "correctAnswer": "Exact matching string from options, or null if open-ended",
      "rubric": "Grading guidance highlighting key evaluation criteria (for open-ended)",
      "expectedKeyPoints": ["Key concept 1", "Key concept 2"], // key concepts/terms to mention
      "explanation": "Clear explanation of the ideal answer and pedagogical reasoning"
    }
  ]
}`;
  }

  /**
   * Fallback question generator for offline/resilience
   */
  generateFallbackQuestions(targets) {
    return targets.map((target) => {
      if (target.type === "open-ended") {
        return {
          conceptName: target.conceptName,
          type: "open-ended",
          difficulty: target.difficulty,
          question: `Explain the architectural importance and functional mechanism of ${target.conceptName}. How does it operate in practice?`,
          options: [],
          correctAnswer: null,
          rubric: `Explain foundational principles, key trade-offs, and practical implementations of ${target.conceptName}.`,
          expectedKeyPoints: [target.conceptName, "Mechanisms", "Trade-offs", "Use cases"],
          explanation: `${target.conceptName} is fundamental: ${target.description || "It provides core structural and operational capabilities."}`,
        };
      }

      const correct = `A core principle or mechanism defined by ${target.conceptName}.`;
      return {
        conceptName: target.conceptName,
        type: "mcq",
        difficulty: target.difficulty,
        question: `What is the primary significance of ${target.conceptName}?`,
        options: [
          correct,
          `An arbitrary configuration unrelated to ${target.conceptName}.`,
          `A legacy protocol deprecated before modern standards.`,
          `A redundant component with no functional contribution.`,
        ],
        correctAnswer: correct,
        explanation: `${target.conceptName} is fundamental: ${target.description || correct}`,
      };
    });
  }

  /**
   * Start a new QuizAttempt
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.quizId
   * @returns {Promise<Object>} Created QuizAttempt document
   */
  async startAttempt({ userId, quizId }) {
    if (!quizId || !mongoose.Types.ObjectId.isValid(quizId)) {
      const err = new Error("Invalid or missing quiz ID");
      err.statusCode = 400;
      throw err;
    }

    const quiz = await Quiz.findOne({ _id: quizId, userId });
    if (!quiz) {
      const err = new Error("Quiz not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const attempt = new QuizAttempt({
      userId,
      projectId: quiz.projectId,
      quizId: quiz._id,
      answers: [],
      score: 0,
      completed: false,
      startedAt: new Date(),
    });

    await attempt.save();

    await activityService.recordActivity({
      userId,
      projectId: quiz.projectId,
      type: "QUIZ_STARTED",
      metadata: {
        quizId: quiz._id,
        attemptId: attempt._id,
        totalQuestions: quiz.questions ? quiz.questions.length : quiz.totalQuestions,
      },
    });

    return attempt;
  }

  /**
   * Submit an answer to a question in an ongoing attempt
   *
   * Supports both Multiple-Choice (MCQ) and Open-Ended questions.
   * For Open-Ended questions, invokes Groq LLM to evaluate understanding,
   * accuracy, relevance, key concepts covered, missing concepts, and reasoning.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.quizId
   * @param {string|mongoose.Types.ObjectId} params.attemptId
   * @param {string|mongoose.Types.ObjectId} params.questionId
   * @param {string} params.answer
   * @returns {Promise<Object>} Answer evaluation result
   */
  async submitAnswer({ userId, quizId, attemptId, questionId, answer }) {
    if (!quizId || !mongoose.Types.ObjectId.isValid(quizId)) {
      const err = new Error("Invalid or missing quiz ID");
      err.statusCode = 400;
      throw err;
    }

    if (!attemptId || !mongoose.Types.ObjectId.isValid(attemptId)) {
      const err = new Error("Invalid or missing attempt ID");
      err.statusCode = 400;
      throw err;
    }

    if (!questionId || !mongoose.Types.ObjectId.isValid(questionId)) {
      const err = new Error("Invalid or missing question ID");
      err.statusCode = 400;
      throw err;
    }

    // Verify attempt ownership
    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      quizId,
      userId,
    });

    if (!attempt) {
      const err = new Error("Quiz attempt not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    if (attempt.completed) {
      const err = new Error("Cannot submit answers to a completed quiz attempt");
      err.statusCode = 400;
      throw err;
    }

    // Verify quiz and locate question
    const quiz = await Quiz.findOne({ _id: quizId, userId });
    if (!quiz) {
      const err = new Error("Quiz not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const question = quiz.questions.id(questionId);
    if (!question) {
      const err = new Error("Question not found in this quiz");
      err.statusCode = 404;
      throw err;
    }

    const cleanedUserAnswer = String(answer || "").trim();
    const isQuestionOpenEnded = question.type === "open-ended" || question.type === "open_ended";

    let isCorrect = false;
    let score = 0;
    let feedback = "";
    let evaluationData = null;

    if (isQuestionOpenEnded) {
      // -------------------------------------------------------------
      // OPEN-ENDED AI EVALUATION
      // -------------------------------------------------------------
      if (!cleanedUserAnswer) {
        const err = new Error("Answer text is required for open-ended assessment");
        err.statusCode = 400;
        throw err;
      }

      const startTime = Date.now();
      const groq = this.getGroqClient();

      const evalPrompt = `You are an expert pedagogical evaluator. Evaluate the student's open-ended answer strictly against the topic and learning guidance.
Do NOT invent false requirements. Assess whether the student demonstrates clear understanding of the concept.

Target Concept / Topic: "${question.topic || "Core Concept"}"
Question: "${question.question}"
Rubric Guidelines: "${question.rubric || "Evaluate accuracy, depth of understanding, and relevance"}"
Expected Key Points: "${(question.expectedKeyPoints || []).join(", ") || "Key architectural and operational concepts"}"
Ideal Reference Explanation: "${question.explanation || ""}"

[Student Answer]:
${cleanedUserAnswer}

Evaluate the student's submission considering:
- understanding (depth of comprehension vs superficiality)
- accuracy (factual correctness against learning materials)
- relevance (how directly it answers the question stem)
- keyConceptsCovered (list of concepts correctly discussed)
- missingConcepts (important mechanisms, principles, or trade-offs omitted)
- strengths (list of strong points in student's answer)
- reasoning (clear explanation of how the score was determined)
- feedback (actionable, constructive pedagogical feedback explaining what the learner understood and what is missing)

Return strictly a valid JSON object matching this schema:
{
  "score": integer between 0 and 100,
  "understanding": "Detailed assessment of the student's depth of understanding",
  "accuracy": "Assessment of factual correctness and validity",
  "relevance": "Assessment of how directly the student answered the question",
  "keyConceptsCovered": ["List of concepts accurately covered"],
  "missingConcepts": ["List of key concepts or mechanisms omitted or incorrect"],
  "strengths": ["List of strong points demonstrated in the answer"],
  "reasoning": "Clear explanation of how the score was determined based on evidence",
  "feedback": "Actionable, encouraging feedback on what was understood and what needs review"
}`;

      if (groq) {
        try {
          const completion = await groq.chat.completions.create({
            model: this.primaryModel,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert educational evaluator. Respond strictly with valid JSON matching the requested evaluation schema. Do not output markdown code fences outside the JSON.",
              },
              {
                role: "user",
                content: evalPrompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          });

          const latency = Date.now() - startTime;
          const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");

          score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 70;
          isCorrect = score >= 60;

          evaluationData = {
            score,
            understanding: String(parsed.understanding || "Demonstrates general conceptual understanding.").trim(),
            accuracy: String(parsed.accuracy || (score >= 60 ? "Factually accurate explanation." : "Partial accuracy with minor inaccuracies.")).trim(),
            relevance: String(parsed.relevance || "Directly addresses the prompt.").trim(),
            keyConceptsCovered: Array.isArray(parsed.keyConceptsCovered) && parsed.keyConceptsCovered.length > 0
              ? parsed.keyConceptsCovered
              : [question.topic || "Core Concept"],
            missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts : [],
            strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0
              ? parsed.strengths
              : ["Answer directly addresses the question."],
            reasoning: String(parsed.reasoning || "Evaluation grounded in conceptual depth.").trim(),
            feedback: String(parsed.feedback || (isCorrect ? "Well-reasoned response!" : "Good effort. Review key concepts for deeper coverage.")).trim(),
          };

          feedback = evaluationData.feedback;

          await this.recordQuizUsage({
            userId,
            projectId: quiz.projectId,
            model: this.primaryModel,
            latency,
            inputTokens: completion.usage?.prompt_tokens || 0,
            outputTokens: completion.usage?.completion_tokens || 0,
            success: true,
          });
        } catch (err) {
          console.warn(`[QuizService] Groq open-ended evaluation failed: ${err.message}`);
          score = cleanedUserAnswer.length > 50 ? 75 : 50;
          isCorrect = score >= 60;
          evaluationData = {
            score,
            understanding: "Answer reviewed with local heuristic evaluation.",
            accuracy: "Valid answer attempt.",
            relevance: "Addresses question topic.",
            keyConceptsCovered: [question.topic || "Core Concept"],
            missingConcepts: ["Review detailed material documentation for comprehensive depth."],
            strengths: ["Clear response structure."],
            reasoning: "Local assessment fallback.",
            feedback: "Answer recorded. Review recommended materials to refine specific technical terminology.",
          };
          feedback = evaluationData.feedback;
        }
      } else {
        score = cleanedUserAnswer.length > 50 ? 75 : 50;
        isCorrect = score >= 60;
        evaluationData = {
          score,
          understanding: "Demonstrates baseline conceptual understanding.",
          accuracy: "Answer addresses the prompt directly.",
          relevance: "Directly relevant to the question stem.",
          keyConceptsCovered: [question.topic || "Core Concept"],
          missingConcepts: [],
          strengths: ["Clear articulated explanation."],
          reasoning: "Answer covers foundational requirements.",
          feedback: "Great work formulating your explanation!",
        };
        feedback = evaluationData.feedback;
      }
    } else {
      // -------------------------------------------------------------
      // MCQ EVALUATION
      // -------------------------------------------------------------
      const cleanedCorrectAnswer = String(question.correctAnswer || "").trim();
      isCorrect = cleanedUserAnswer.toLowerCase() === cleanedCorrectAnswer.toLowerCase();
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? `Correct! ${question.explanation || ""}`
        : `Incorrect. The correct answer was: "${question.correctAnswer}". ${question.explanation || ""}`;
    }

    // Update or push answer in attempt
    const existingIndex = attempt.answers.findIndex(
      (a) => a.questionId.toString() === questionId.toString()
    );

    const answerRecord = {
      questionId: question._id,
      answer: cleanedUserAnswer,
      isCorrect,
      score,
      feedback,
      evaluation: evaluationData || undefined,
    };

    if (existingIndex >= 0) {
      attempt.answers[existingIndex] = answerRecord;
    } else {
      attempt.answers.push(answerRecord);
    }

    await attempt.save();

    await activityService.recordActivity({
      userId,
      projectId: quiz.projectId,
      type: "QUESTION_ANSWERED",
      metadata: {
        quizId: quiz._id,
        attemptId: attempt._id,
        questionId: question._id,
        conceptId: question.conceptId,
        isCorrect,
      },
    });

    return {
      isCorrect,
      score,
      explanation: question.explanation || "",
      feedback,
      evaluation: evaluationData,
      conceptId: question.conceptId ? question.conceptId.toString() : null,
      questionId: question._id.toString(),
      questionType: question.type || "mcq",
    };
  }

  /**
   * Complete quiz attempt, compute final scores, generate rich feedback,
   * track before/after mastery shifts, and recommend actionable next steps.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.quizId
   * @param {string|mongoose.Types.ObjectId} params.attemptId
   * @returns {Promise<Object>} Final attempt with comprehensive feedback and mastery deltas
   */
  async completeQuiz({ userId, quizId, attemptId }) {
    if (!quizId || !mongoose.Types.ObjectId.isValid(quizId)) {
      const err = new Error("Invalid or missing quiz ID");
      err.statusCode = 400;
      throw err;
    }

    if (!attemptId || !mongoose.Types.ObjectId.isValid(attemptId)) {
      const err = new Error("Invalid or missing attempt ID");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify attempt ownership
    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      quizId,
      userId,
    });

    if (!attempt) {
      const err = new Error("Quiz attempt not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    // 2. Fetch Quiz
    const quiz = await Quiz.findOne({ _id: quizId, userId }).lean();
    if (!quiz) {
      const err = new Error("Quiz not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const knowledgeService = require("../documents/knowledge.service");
    const projectConcepts = await knowledgeService.getConceptsByProject(quiz.projectId);
    const conceptLookup = new Map(projectConcepts.map((c) => [c._id.toString(), c]));

    // 3. Capture baseline mastery scores BEFORE evidence recording
    const previousMasteryMap = await masteryService.getProjectMasteryMap({
      userId,
      projectId: quiz.projectId,
    });

    const totalQuestions = quiz.questions.length || 1;
    const answeredCount = attempt.answers.length;
    const correctCount = attempt.answers.filter((a) => a.isCorrect).length;
    const totalScorePercentage = Math.round((correctCount / totalQuestions) * 100);

    const completedAt = new Date();
    const startedAt = attempt.startedAt ? new Date(attempt.startedAt) : completedAt;
    const durationSeconds = Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));

    // 4. Update attempt completion state
    attempt.completed = true;
    attempt.completedAt = completedAt;
    attempt.score = totalScorePercentage;
    await attempt.save();

    // 5. Build comprehensive, multi-dimensional feedback
    const conceptsTestedMap = new Map();
    const incorrectConceptsMap = new Map();
    const questionBreakdown = [];

    for (const q of quiz.questions) {
      const qid = q._id.toString();
      const userAns = attempt.answers.find((a) => a.questionId.toString() === qid);
      const isCorrect = userAns ? !!userAns.isCorrect : false;

      const conceptObj = (q.conceptId ? conceptLookup.get(q.conceptId.toString()) : null) || {};
      const conceptIdStr = conceptObj._id ? conceptObj._id.toString() : (q.conceptId ? q.conceptId.toString() : "chunk_topic");
      const conceptName = conceptObj.name || q.topic || "General Concept";

      // Track concept testing statistics
      if (!conceptsTestedMap.has(conceptIdStr)) {
        conceptsTestedMap.set(conceptIdStr, {
          conceptId: conceptIdStr,
          conceptName,
          totalQuestions: 0,
          correctQuestions: 0,
        });
      }
      const cStat = conceptsTestedMap.get(conceptIdStr);
      cStat.totalQuestions++;
      if (isCorrect) {
        cStat.correctQuestions++;
      } else {
        incorrectConceptsMap.set(conceptIdStr, {
          conceptId: conceptIdStr,
          conceptName,
          reason: userAns?.feedback || "Question answered incorrectly during quiz",
        });
      }

      questionBreakdown.push({
        questionId: qid,
        type: q.type || "mcq",
        question: q.question,
        options: q.options || [],
        difficulty: q.difficulty,
        userAnswer: userAns ? userAns.answer : null,
        correctAnswer: q.correctAnswer,
        isCorrect,
        score: userAns ? userAns.score : 0,
        explanation: q.explanation,
        rubric: q.rubric || "",
        expectedKeyPoints: q.expectedKeyPoints || [],
        feedback: userAns ? userAns.feedback : null,
        evaluation: userAns ? userAns.evaluation : null,
        conceptId: conceptIdStr,
        conceptName,
      });

      // 6. Record Mastery Evidence with weighted source
      if (userAns && conceptObj._id) {
        const isOE = q.type === "open-ended" || q.type === "open_ended";
        const evidenceScore = isOE
          ? (userAns.evaluation?.score ?? (isCorrect ? 80 : 30))
          : (isCorrect ? 100 : 20);

        await masteryService.recordMasteryEvidence({
          userId,
          projectId: quiz.projectId,
          conceptId: conceptObj._id,
          score: evidenceScore,
          isCorrect,
          source: isOE ? "assessment" : "quiz",
        });
      }
    }

    // 7. Capture updated mastery scores and compute deltas
    const newMasteryMap = await masteryService.getProjectMasteryMap({
      userId,
      projectId: quiz.projectId,
    });

    const masteryChanges = [];
    for (const [cidStr, cStat] of conceptsTestedMap.entries()) {
      const prevRecord = previousMasteryMap.get(cidStr);
      const newRecord = newMasteryMap.get(cidStr);

      const previousScore = prevRecord ? prevRecord.score : null;
      const newScore = newRecord ? newRecord.score : (cStat.correctQuestions > 0 ? 60 : 30);
      const isNewBaseline = previousScore === null;
      const delta = isNewBaseline ? newScore : (newScore - previousScore);

      masteryChanges.push({
        conceptId: cidStr,
        conceptName: cStat.conceptName,
        previousScore,
        newScore,
        delta,
        isNewBaseline,
      });
    }

    // 8. Determine Strengths and Concepts Needing Attention
    const strengths = [];
    const conceptsNeedingAttention = [];

    for (const c of conceptsTestedMap.values()) {
      const accuracyPct = Math.round((c.correctQuestions / c.totalQuestions) * 100);
      const change = masteryChanges.find((m) => m.conceptId === c.conceptId);
      const currentScore = change ? change.newScore : 50;

      if (accuracyPct >= 70 || currentScore >= 70) {
        strengths.push({
          conceptId: c.conceptId,
          conceptName: c.conceptName,
          accuracy: accuracyPct,
          masteryScore: currentScore,
        });
      } else {
        conceptsNeedingAttention.push({
          conceptId: c.conceptId,
          conceptName: c.conceptName,
          accuracy: accuracyPct,
          masteryScore: currentScore,
          reason: `Accuracy was ${accuracyPct}% with low retention.`,
        });
      }
    }

    // 9. Generate Actionable Next Steps
    const nextActions = [];
    if (conceptsNeedingAttention.length > 0) {
      const worstConcept = conceptsNeedingAttention[0];
      nextActions.push({
        type: "ask_tutor",
        title: `Review ${worstConcept.conceptName} with Tutor`,
        description: `Deep-dive into ${worstConcept.conceptName} with the AI Tutor to clarify key misconceptions.`,
        actionLabel: "Ask Tutor",
        targetTab: "tutor",
        prompt: `Can you explain ${worstConcept.conceptName} to me in detail and help me understand where I went wrong on my recent quiz?`,
        conceptId: worstConcept.conceptId,
      });

      nextActions.push({
        type: "retry_weak",
        title: "Retry Weak Concepts",
        description: `Take a focused assessment dedicated only to ${conceptsNeedingAttention.map((c) => c.conceptName).join(", ")}.`,
        actionLabel: "Retry Weak Concepts",
        conceptIds: conceptsNeedingAttention.map((c) => c.conceptId),
      });
    } else {
      nextActions.push({
        type: "advance_quiz",
        title: "Take a Challenge Quiz",
        description: "You demonstrated solid mastery! Step up to Hard difficulty to test deeper synthesis.",
        actionLabel: "Challenge Quiz",
        difficulty: "hard",
      });
    }

    nextActions.push({
      type: "take_quiz",
      title: "Take Another Focused Quiz",
      description: "Continue adaptive assessment across remaining project concepts.",
      actionLabel: "New Quiz",
    });

    nextActions.push({
      type: "review_growth",
      title: "View Cognitive Growth",
      description: "Inspect historical mastery trajectories and cognitive retention curves.",
      actionLabel: "View Growth",
      targetTab: "growth",
    });

    const mistakes = questionBreakdown.filter((q) => !q.isCorrect);

    const feedback = {
      attemptId: attempt._id,
      quizId: quiz._id,
      projectId: quiz.projectId,
      completed: true,
      score: totalScorePercentage,
      correctCount,
      totalQuestions,
      answeredCount,
      durationSeconds,
      conceptsTested: Array.from(conceptsTestedMap.values()),
      conceptsWithIncorrectAnswers: Array.from(incorrectConceptsMap.values()),
      masteryChanges,
      strengths,
      conceptsNeedingAttention,
      nextActions,
      mistakes,
      questionBreakdown,
    };

    await activityService.recordActivity({
      userId,
      projectId: quiz.projectId,
      type: "QUIZ_COMPLETED",
      metadata: {
        quizId: quiz._id,
        attemptId: attempt._id,
        score: totalScorePercentage,
        correctCount,
        totalQuestions,
      },
    });

    return feedback;
  }

  /**
   * Get Quiz details for taking or reviewing
   */
  async getQuizById({ quizId, userId }) {
    const quiz = await Quiz.findOne({ _id: quizId, userId }).lean();
    if (!quiz) {
      const err = new Error("Quiz not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }
    return quiz;
  }

  /**
   * Record AIUsage audit entry with feature='QUIZ_GENERATION'
   */
  async recordQuizUsage({ userId, projectId, model, latency, inputTokens, outputTokens, success, errorMessage }) {
    try {
      await AIUsage.create({
        userId,
        projectId,
        feature: "QUIZ_GENERATION",
        model,
        latency,
        inputTokens,
        outputTokens,
        success,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
      });
    } catch (err) {
      console.warn(`[QuizService] Failed to record AIUsage: ${err.message}`);
    }
  }
}

module.exports = new QuizService();
