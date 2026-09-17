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
    this.primaryModel = process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
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
  async generateAdaptiveQuiz({
    userId,
    projectId,
    totalQuestions = 10,
    difficulty = "adaptive",
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

    // 2. Fetch all concepts for this project
    const concepts = await Concept.find({ projectId }).lean();
    if (!concepts || concepts.length === 0) {
      const err = new Error("No concepts found for this project. Please add materials and extract concepts first.");
      err.statusCode = 400;
      throw err;
    }

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
        questionToConceptMap.set(q._id.toString(), q.conceptId.toString());
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
    const scoredConcepts = concepts.map((concept) => {
      const cid = concept._id.toString();
      const mastery = masteryMap.get(cid);
      const mistakeCount = pastMistakeConceptCounts.get(cid) || 0;
      const importance = concept.importance || 3;

      let priorityScore = 0;

      // Unassessed concepts or low mastery get high priority
      if (!mastery) {
        priorityScore += 35; // Needs baseline assessment
      } else {
        // Lower mastery score = higher need for practice
        priorityScore += (100 - mastery.score) * 0.4;
      }

      // Concepts with repeated past mistakes get extra reinforcement
      priorityScore += mistakeCount * 12;

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
      };
    });

    // Sort concepts by priority score descending
    scoredConcepts.sort((a, b) => b.priorityScore - a.priorityScore);

    // Pick top candidates up to numQuestions
    const selectedTargets = [];
    for (let i = 0; i < numQuestions; i++) {
      const candidate = scoredConcepts[i % scoredConcepts.length];
      selectedTargets.push({
        conceptId: candidate.concept.recId || candidate.concept._id,
        conceptName: candidate.concept.name,
        description: candidate.concept.description || "",
        difficulty: candidate.assignedDifficulty,
      });
    }

    // 6. Retrieve relevant project context excerpts for selected concepts
    const conceptSnippets = [];
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
          conceptSnippets.push(
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

    // 7. Invoke Groq LLM to generate MCQ questions
    const startTime = Date.now();
    const groq = this.getGroqClient();

    let rawQuestions = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const generationPrompt = this.buildQuizPrompt({
      projectTitle: project.name,
      targets: selectedTargets,
      contextSnippets: conceptSnippets.join("\n\n---\n\n"),
      totalQuestions: numQuestions,
      overallDifficulty: difficulty,
    });

    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: this.primaryModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert educational assessment creator. Generate rigorous, pedagogically sound multiple-choice questions (MCQs) strictly formatted in JSON. Provide 4 distinct options per question, with 1 unambiguous correct answer and an instructive explanation. Do not return markdown blocks outside the JSON.",
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
      // Local fallback for test or offline environments
      rawQuestions = this.generateFallbackQuestions(selectedTargets);
      outputTokens = Math.ceil(JSON.stringify(rawQuestions).length / 4);
    }

    // 8. Sanitize, map to Concept IDs, and format into Quiz schema
    const formattedQuestions = [];
    for (let i = 0; i < selectedTargets.length; i++) {
      const target = selectedTargets[i];
      const rawQ = rawQuestions[i] || rawQuestions[i % (rawQuestions.length || 1)] || {};

      let options = Array.isArray(rawQ.options) && rawQ.options.length >= 2
        ? rawQ.options.map((o) => String(o).trim())
        : [
            `Accurate description of ${target.conceptName}`,
            `Incorrect alternative definition`,
            `Unrelated distractor mechanism`,
            `Contradictory principle`,
          ];

      // Ensure 4 options
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
        conceptId: target.conceptId,
        difficulty: ["easy", "medium", "hard"].includes(rawQ.difficulty)
          ? rawQ.difficulty
          : target.difficulty,
        explanation:
          rawQ.explanation ||
          `The correct answer is "${correctAnswer}" because it accurately defines ${target.conceptName}.`,
      });
    }

    // 9. Persist Quiz document
    const quiz = new Quiz({
      userId,
      projectId,
      questions: formattedQuestions,
      difficulty,
      totalQuestions: formattedQuestions.length,
    });

    await quiz.save();
    return quiz;
  }

  /**
   * Build prompt text for LLM quiz generation
   */
  buildQuizPrompt({ projectTitle, targets, contextSnippets, totalQuestions, overallDifficulty }) {
    return `Generate an adaptive educational multiple-choice quiz of ${totalQuestions} questions for the project "${projectTitle}".

Overall Difficulty Mode: ${overallDifficulty}

Target Concepts and assigned difficulties:
${targets
  .map(
    (t, i) =>
      `${i + 1}. Concept: "${t.conceptName}" (Target difficulty: ${t.difficulty})\n   Description: ${t.description}`
  )
  .join("\n")}

Retrieved Context Excerpts:
${contextSnippets || "Use foundational educational knowledge for each concept."}

Return strictly a valid JSON object with the following schema:
{
  "questions": [
    {
      "conceptName": "Name of concept",
      "difficulty": "easy" | "medium" | "hard",
      "question": "Clear, specific question stem",
      "options": [
        "Option A text",
        "Option B text",
        "Option C text",
        "Option D text"
      ],
      "correctAnswer": "Exact matching string from options",
      "explanation": "Clear explanation of why this answer is correct"
    }
  ]
}`;
  }

  /**
   * Fallback question generator for offline/resilience
   */
  generateFallbackQuestions(targets) {
    return targets.map((target) => {
      const correct = `A core principle or mechanism defined by ${target.conceptName}.`;
      return {
        conceptName: target.conceptName,
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
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.quizId
   * @param {string|mongoose.Types.ObjectId} params.attemptId
   * @param {string|mongoose.Types.ObjectId} params.questionId
   * @param {string} params.answer
   * @returns {Promise<{ isCorrect: boolean, score: number, explanation: string, conceptId: string, questionId: string }>}
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

    // Evaluate MCQ answer
    const cleanedUserAnswer = String(answer || "").trim();
    const cleanedCorrectAnswer = String(question.correctAnswer || "").trim();

    const isCorrect =
      cleanedUserAnswer.toLowerCase() === cleanedCorrectAnswer.toLowerCase();
    const score = isCorrect ? 1 : 0;
    const feedback = isCorrect
      ? `Correct! ${question.explanation || ""}`
      : `Incorrect. The correct answer was: "${question.correctAnswer}". ${question.explanation || ""}`;

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
      conceptId: question.conceptId.toString(),
      questionId: question._id.toString(),
    };
  }

  /**
   * Complete quiz attempt, compute final scores, generate rich feedback,
   * and trigger the Mastery hook.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.quizId
   * @param {string|mongoose.Types.ObjectId} params.attemptId
   * @returns {Promise<Object>} Final attempt with comprehensive feedback
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

    // 2. Fetch Quiz with questions populated
    const quiz = await Quiz.findOne({ _id: quizId, userId }).populate({
      path: "questions.conceptId",
      select: "name description importance",
    });

    if (!quiz) {
      const err = new Error("Quiz not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    const totalQuestions = quiz.questions.length || 1;
    const answeredCount = attempt.answers.length;
    const correctCount = attempt.answers.filter((a) => a.isCorrect).length;
    const totalScorePercentage = Math.round((correctCount / totalQuestions) * 100);

    const completedAt = new Date();
    const startedAt = attempt.startedAt ? new Date(attempt.startedAt) : completedAt;
    const durationSeconds = Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));

    // 3. Update attempt completion state
    attempt.completed = true;
    attempt.completedAt = completedAt;
    attempt.score = totalScorePercentage;
    await attempt.save();

    // 4. Build comprehensive, multi-dimensional feedback
    const conceptsTestedMap = new Map();
    const incorrectConceptsMap = new Map();
    const questionBreakdown = [];

    for (const q of quiz.questions) {
      const qid = q._id.toString();
      const userAns = attempt.answers.find((a) => a.questionId.toString() === qid);
      const isCorrect = userAns ? !!userAns.isCorrect : false;

      const conceptObj = q.conceptId || {};
      const conceptIdStr = conceptObj._id ? conceptObj._id.toString() : (q.conceptId ? q.conceptId.toString() : "unknown");
      const conceptName = conceptObj.name || "General Concept";

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
          reason: "Incorrect answer during quiz",
        });
      }

      questionBreakdown.push({
        questionId: qid,
        question: q.question,
        difficulty: q.difficulty,
        userAnswer: userAns ? userAns.answer : null,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        conceptId: conceptIdStr,
        conceptName,
      });

      // 5. Trigger MASTERY HOOK for each question answered
      if (userAns && conceptObj._id) {
        await masteryService.recordQuizEvidence({
          userId,
          projectId: quiz.projectId,
          conceptId: conceptObj._id,
          isCorrect,
          score: isCorrect ? 1 : 0,
          source: "quiz",
        });
      }
    }

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
