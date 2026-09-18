import React, { useState, useMemo, useEffect } from "react";
import {
  BrainCircuit,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  BookOpen,
  HelpCircle,
  BarChart3,
  Check,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  PenTool,
  TrendingUp,
  CheckSquare,
  Square,
  Info,
  Layers,
  MessageSquare,
  Clock,
  Target,
  Search,
  X as XIcon,
} from "lucide-react";
import {
  useGenerateQuizMutation,
  useStartAttemptMutation,
  useSubmitAnswerMutation,
  useCompleteQuizMutation,
} from "../../../../features/quiz/quizApi";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import toast from "react-hot-toast";

export const QuizTab = ({
  project,
  space,
  materials = [],
  growth,
  onSwitchTab,
  onQuizCompleted,
  onAssessmentStatusChange,
}) => {
  const readyMaterials = materials.filter((m) => m.status === "READY");

  // RTK Query Mutations
  const [generateQuiz, { isLoading: isGenerating }] = useGenerateQuizMutation();
  const [startAttempt, { isLoading: isStarting }] = useStartAttemptMutation();
  const [submitAnswer, { isLoading: isSubmitting }] = useSubmitAnswerMutation();
  const [completeQuiz, { isLoading: isCompleting }] = useCompleteQuizMutation();

  // State Machine: "SETUP" | "ACTIVE" | "RESULTS"
  const [phase, setPhase] = useState("SETUP");

  // Setup Options
  const [selectedDifficulty, setSelectedDifficulty] = useState("adaptive");
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [questionFormat, setQuestionFormat] = useState("mixed"); // "mixed" | "mcq" | "open-ended"
  const [conceptSelectionMode, setConceptSelectionMode] = useState("all"); // "all" | "selected"
  const [selectedConceptIds, setSelectedConceptIds] = useState(new Set());
  const [conceptSearch, setConceptSearch] = useState("");

  // Active Quiz State
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [openEndedAnswer, setOpenEndedAnswer] = useState("");
  const [questionFeedback, setQuestionFeedback] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});

  // Final Results & Mastery State
  const [quizResults, setQuizResults] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Sync assessment active status to parent to lock workspace tabs and prevent data loss
  useEffect(() => {
    const isBusy = phase === "ACTIVE" || isGenerating || isStarting;
    onAssessmentStatusChange?.(isBusy);
    return () => {
      onAssessmentStatusChange?.(false);
    };
  }, [phase, isGenerating, isStarting, onAssessmentStatusChange]);

  const handleAbandonQuiz = () => {
    setPhase("SETUP");
    setActiveQuiz(null);
    setActiveAttempt(null);
    setSelectedOption(null);
    setOpenEndedAnswer("");
    setQuestionFeedback(null);
    setUserAnswers({});
    setShowExitConfirm(false);
    onAssessmentStatusChange?.(false);
    toast("Assessment exited. Tabs unlocked.", { icon: "ℹ️" });
  };

  // Extract all available concepts from growth data
  const allConcepts = useMemo(() => {
    if (!growth) return [];
    const map = new Map();

    const addList = (list, tag) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (!item || !item.conceptId) return;
        const cid = item.conceptId.toString();
        if (!map.has(cid)) {
          map.set(cid, {
            ...item,
            category: tag,
          });
        }
      });
    };

    addList(growth.requiringAttention, "requiringAttention");
    addList(growth.unassessed, "unassessed");
    addList(growth.improving, "improving");
    addList(growth.stable, "stable");

    return Array.from(map.values());
  }, [growth]);

  const conceptsNeedingAttention = useMemo(() => {
    return allConcepts.filter(
      (c) => c.category === "requiringAttention" || (c.currentScore !== undefined && c.currentScore < 50)
    );
  }, [allConcepts]);

  const filteredConcepts = useMemo(() => {
    const q = conceptSearch.trim().toLowerCase();
    if (!q) return allConcepts;
    return allConcepts.filter((c) =>
      (c.conceptName || "").toLowerCase().includes(q)
    );
  }, [allConcepts, conceptSearch]);

  // Concept selection handlers
  const handleToggleConcept = (conceptId) => {
    setSelectedConceptIds((prev) => {
      const next = new Set(prev);
      if (next.has(conceptId)) {
        next.delete(conceptId);
      } else {
        next.add(conceptId);
      }
      return next;
    });
  };

  const handleSelectAllConcepts = () => {
    setSelectedConceptIds(new Set(allConcepts.map((c) => c.conceptId.toString())));
  };

  const handleDeselectAllConcepts = () => {
    setSelectedConceptIds(new Set());
  };

  // Phase 1: Generate & Start
  const handleStartQuiz = async () => {
    if (readyMaterials.length === 0) {
      toast.error("Please upload and index study materials before generating a quiz.");
      return;
    }

    if (conceptSelectionMode === "selected" && selectedConceptIds.size === 0) {
      toast.error("Please select at least one concept or switch to 'All Concepts'.");
      return;
    }

    try {
      toast.loading("Generating adaptive assessment...", { id: "quiz-gen" });
      const targetConceptIds =
        conceptSelectionMode === "selected" ? Array.from(selectedConceptIds) : [];

      const quizRes = await generateQuiz({
        projectId: project?._id,
        totalQuestions,
        difficulty: selectedDifficulty,
        conceptIds: targetConceptIds,
        questionFormat,
      }).unwrap();

      const quizData = quizRes?.data || quizRes;
      setActiveQuiz(quizData);

      // Start attempt
      const attemptRes = await startAttempt({
        quizId: quizData._id,
      }).unwrap();

      const attemptData = attemptRes?.data || attemptRes;
      setActiveAttempt(attemptData);

      // Reset test state
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setOpenEndedAnswer("");
      setQuestionFeedback(null);
      setUserAnswers({});
      setPhase("ACTIVE");
      toast.success("Adaptive assessment ready! Good luck!", { id: "quiz-gen" });
    } catch (err) {
      toast.error(err?.data?.message || err?.error || "Failed to generate quiz. Please retry.", {
        id: "quiz-gen",
      });
    }
  };

  // Phase 2: Submit single answer
  const handleSubmitAnswer = async () => {
    if (!activeQuiz || !activeAttempt) return;

    const currentQuestion = activeQuiz.questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const isOE = currentQuestion.type === "open-ended" || currentQuestion.type === "open_ended";
    const answerToSubmit = isOE ? openEndedAnswer.trim() : selectedOption;

    if (!answerToSubmit) {
      toast.error(isOE ? "Please type an answer before submitting." : "Please select an option.");
      return;
    }

    try {
      const evaluationRes = await submitAnswer({
        quizId: activeQuiz._id,
        attemptId: activeAttempt._id,
        questionId: currentQuestion._id,
        answer: answerToSubmit,
      }).unwrap();

      const evalData = evaluationRes?.data || evaluationRes;
      setQuestionFeedback(evalData);
      setUserAnswers((prev) => ({
        ...prev,
        [currentQuestion._id]: {
          answer: answerToSubmit,
          isCorrect: evalData.isCorrect,
          score: evalData.score,
          explanation: evalData.explanation,
          feedback: evalData.feedback,
          evaluation: evalData.evaluation,
        },
      }));
    } catch (err) {
      toast.error(err?.data?.message || err?.error || "Failed to evaluate answer.");
    }
  };

  // Phase 2: Next question or Complete
  const handleNextQuestion = async () => {
    const isLastQuestion = currentQuestionIndex === activeQuiz.questions.length - 1;

    if (isLastQuestion) {
      // Complete quiz
      try {
        toast.loading("Calculating concept mastery shifts & insights...", { id: "quiz-comp" });
        const compRes = await completeQuiz({
          quizId: activeQuiz._id,
          attemptId: activeAttempt._id,
        }).unwrap();

        const compData = compRes?.data || compRes;
        setQuizResults(compData);
        setPhase("RESULTS");
        toast.success("Assessment completed! Mastery updated.", { id: "quiz-comp" });
        onQuizCompleted?.();
      } catch (err) {
        toast.error(err?.data?.message || err?.error || "Failed to finalize assessment.", {
          id: "quiz-comp",
        });
      }
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
      setOpenEndedAnswer("");
      setQuestionFeedback(null);
    }
  };

  // Reset to setup
  const handleRetakeOrNew = () => {
    setPhase("SETUP");
    setActiveQuiz(null);
    setActiveAttempt(null);
    setQuizResults(null);
    setSelectedOption(null);
    setOpenEndedAnswer("");
    setQuestionFeedback(null);
  };

  // Setup specific weak concepts retry
  const handleRetryWeakConcepts = (weakConceptIds) => {
    if (weakConceptIds && weakConceptIds.length > 0) {
      setSelectedConceptIds(new Set(weakConceptIds.map(String)));
      setConceptSelectionMode("selected");
    }
    setPhase("SETUP");
    setActiveQuiz(null);
    setActiveAttempt(null);
    setQuizResults(null);
    setSelectedOption(null);
    setOpenEndedAnswer("");
    setQuestionFeedback(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ========================================================================= */}
      {/* PHASE 1: SETUP SCREEN */}
      {/* ========================================================================= */}
      {phase === "SETUP" && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Hero Card */}
          <div className="rounded-3xl bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-slate-900 border border-indigo-500/25 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  PRD Adaptive Assessment Engine
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dynamically balances questions across concept mastery, prior mistakes, and learning history.
                </p>
              </div>
            </div>

            {readyMaterials.length === 0 ? (
              <div className="pt-4">
                <EmptyState
                  icon={BookOpen}
                  title="Study Materials Required"
                  description="Upload and index at least one PDF in the Materials tab before generating a quiz."
                  actionLabel="Go to Materials"
                  onAction={() => onSwitchTab?.("materials")}
                />
              </div>
            ) : (
              <div className="space-y-6 pt-2 border-t border-slate-800/80">
                {/* 1. Difficulty Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Difficulty Mode</span>
                    {selectedDifficulty === "adaptive" && (
                      <span className="text-[11px] text-indigo-400 font-normal flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Auto-balances based on mastery
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {[
                      { id: "adaptive", label: "Adaptive", desc: "Dynamically targets weak spots" },
                      { id: "easy", label: "Easy", desc: "Foundational recall & definitions" },
                      { id: "medium", label: "Medium", desc: "Application & practical nuances" },
                      { id: "hard", label: "Hard", desc: "Deep synthesis & multi-concept trade-offs" },
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDifficulty(d.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          selectedDifficulty === d.id
                            ? "bg-indigo-600/20 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500"
                            : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <div className="font-semibold text-xs text-slate-100 flex items-center justify-between">
                          <span>{d.label}</span>
                          {selectedDifficulty === d.id && (
                            <Check className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Question Format Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Question Format
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: "mixed",
                        label: "Mixed (MCQ + Open-Ended)",
                        desc: "Full PRD assessment with both format styles",
                      },
                      {
                        id: "mcq",
                        label: "Multiple Choice Only",
                        desc: "Fast conceptual checking with 4 distinct options",
                      },
                      {
                        id: "open-ended",
                        label: "Open-Ended Only",
                        desc: "AI evaluates depth, reasoning & missing concepts",
                      },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setQuestionFormat(fmt.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          questionFormat === fmt.id
                            ? "bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500"
                            : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <div className="font-semibold text-xs text-slate-100 flex items-center justify-between">
                          <span>{fmt.label}</span>
                          {questionFormat === fmt.id && (
                            <Check className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">{fmt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Question Count Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Question Count
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[5, 10, 15].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setTotalQuestions(count)}
                        className={`p-3 rounded-xl border text-center font-semibold text-xs transition-all ${
                          totalQuestions === count
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md"
                            : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        {count} Questions
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Concept Selection Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Target Concepts</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConceptSelectionMode("all")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          conceptSelectionMode === "all"
                            ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        All Concepts
                      </button>
                      <button
                        type="button"
                        onClick={() => setConceptSelectionMode("selected")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          conceptSelectionMode === "selected"
                            ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Select Concepts ({selectedConceptIds.size})
                      </button>
                    </div>
                  </div>

                  {/* Adaptive Reason Info Banner */}
                  <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-indigo-300 font-medium">
                      <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      <span>How Adaptive Selection Works</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {conceptsNeedingAttention.length > 0
                        ? `Adaptive mode prioritizes your ${conceptsNeedingAttention.length} concept(s) requiring attention (under 50% mastery or recent mistakes) to accelerate growth.`
                        : "Adaptive mode targets all core concepts evenly, balancing fundamental recall with analytical questions."}
                    </p>
                  </div>

                  {/* Concept Checkboxes when mode === 'selected' */}
                  {conceptSelectionMode === "selected" && (
                    <div className="space-y-2 pt-1 animate-fade-in">
                      {/* Header row: label + select/clear actions */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>Choose specific concepts to target:</span>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={handleSelectAllConcepts}
                            className="text-indigo-400 hover:underline"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllConcepts}
                            className="text-slate-400 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Search Input */}
                      {allConcepts.length > 0 && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                          <input
                            type="text"
                            value={conceptSearch}
                            onChange={(e) => setConceptSearch(e.target.value)}
                            placeholder={`Search ${allConcepts.length} concept${allConcepts.length === 1 ? "" : "s"}...`}
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-800/60 border border-slate-700/70 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          />
                          {conceptSearch && (
                            <button
                              type="button"
                              onClick={() => setConceptSearch("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {allConcepts.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-400">
                          No concepts extracted yet. The quiz will generate questions directly from your study materials.
                        </div>
                      ) : filteredConcepts.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-400">
                          No concepts match <span className="text-slate-200 font-medium">&quot;{conceptSearch}&quot;</span>. Try a different keyword.
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {filteredConcepts.map((concept) => {
                            const cidStr = concept.conceptId.toString();
                            const isSelected = selectedConceptIds.has(cidStr);
                            const score = concept.currentScore ?? 0;
                            const isLowMastery = score < 50;

                            return (
                              <button
                                key={cidStr}
                                type="button"
                                onClick={() => handleToggleConcept(cidStr)}
                                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                                  isSelected
                                    ? "bg-indigo-600/15 border-indigo-500/70 text-slate-100"
                                    : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 truncate">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                  )}
                                  <span className="text-xs font-semibold truncate">
                                    {concept.conceptName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {concept.category === "requiringAttention" || isLowMastery ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-amber-950/50 text-amber-300 border-amber-700/50 flex items-center gap-1"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                      {score}% Needs Attention
                                    </Badge>
                                  ) : concept.category === "unassessed" ? (
                                    <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-400 border-slate-700">
                                      Unassessed
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-emerald-950/40 text-emerald-300 border-emerald-700/40"
                                    >
                                      {score}% Mastery
                                    </Badge>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Ready Info & Start Button */}
                <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>
                      Synthesizing from <strong className="text-slate-200">{readyMaterials.length}</strong> indexed document{readyMaterials.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleStartQuiz}
                    disabled={isGenerating || isStarting}
                    className="w-full sm:w-auto shadow-lg shadow-indigo-600/25 px-8"
                  >
                    {isGenerating || isStarting ? (
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 animate-spin" />
                        Generating Assessment...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>Start Adaptive Assessment</span>
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Mastery Coverage Summary Card */}
          {growth?.summary && growth.summary.totalConcepts > 0 && (
            <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Project Knowledge Health</span>
                <span className="text-slate-400">
                  {growth.summary.requiringAttentionCount > 0 ? (
                    <span className="text-amber-400 font-medium">
                      {growth.summary.requiringAttentionCount} concept(s) need attention
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium">All concepts on track</span>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
                  <div className="text-lg font-bold text-white">
                    {growth.summary.averageMastery || 0}%
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                    Average Mastery
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
                  <div className="text-lg font-bold text-emerald-400">
                    {growth.summary.improvingCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                    Improving
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
                  <div className="text-lg font-bold text-amber-400">
                    {growth.summary.requiringAttentionCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                    Attention Needed
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PHASE 2: ACTIVE QUESTION FLOW */}
      {/* ========================================================================= */}
      {phase === "ACTIVE" && activeQuiz && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Progress Header */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-indigo-950/40 text-indigo-300 border-indigo-700/40 text-xs">
                  Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize text-slate-400 border-slate-700">
                  {activeQuiz.questions[currentQuestionIndex]?.difficulty || activeQuiz.difficulty}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    activeQuiz.questions[currentQuestionIndex]?.type === "open-ended"
                      ? "text-xs bg-purple-950/40 text-purple-300 border-purple-700/40"
                      : "text-xs bg-slate-800 text-slate-300 border-slate-700"
                  }
                >
                  {activeQuiz.questions[currentQuestionIndex]?.type === "open-ended" ? "Open-Ended" : "Multiple Choice"}
                </Badge>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  {Math.round(((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100)}% Complete
                </span>
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(true)}
                  className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg border border-rose-800/40 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                  title="Abandon assessment and unlock navigation"
                >
                  <XIcon className="w-3.5 h-3.5" />
                  <span>Exit Quiz</span>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{
                  width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Question Card */}
          {(() => {
            const currentQ = activeQuiz.questions[currentQuestionIndex];
            const isAnswered = !!questionFeedback;
            const isOE = currentQ?.type === "open-ended" || currentQ?.type === "open_ended";

            return (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-8 shadow-xl space-y-6">
                {/* Concept & Topic Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Concept: <strong className="text-slate-200">{currentQ?.topic || "Core Concept"}</strong></span>
                  </div>
                  {currentQ?.rubric && isOE && (
                    <span className="text-[11px] text-slate-400 italic">
                      Rubric: {currentQ.rubric.slice(0, 45)}...
                    </span>
                  )}
                </div>

                {/* Question Stem */}
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white leading-relaxed">
                    {currentQ?.question}
                  </h3>
                </div>

                {/* Question Options or Open-Ended Answer Field */}
                {!isOE ? (
                  // MULTIPLE-CHOICE OPTIONS
                  <div className="space-y-3">
                    {currentQ?.options?.map((option, idx) => {
                      const isSelected = selectedOption === option;
                      let optionStyle =
                        "bg-slate-800/50 border-slate-700/70 text-slate-200 hover:bg-slate-800 hover:border-slate-600";

                      if (isAnswered) {
                        const isCorrectAnswer =
                          option.trim().toLowerCase() === currentQ.correctAnswer?.trim().toLowerCase();
                        if (isCorrectAnswer) {
                          optionStyle =
                            "bg-emerald-950/50 border-emerald-500/80 text-emerald-200 ring-1 ring-emerald-500";
                        } else if (isSelected && !questionFeedback.isCorrect) {
                          optionStyle =
                            "bg-rose-950/50 border-rose-500/80 text-rose-200 ring-1 ring-rose-500";
                        } else {
                          optionStyle = "bg-slate-800/30 border-slate-800 text-slate-500 opacity-60";
                        }
                      } else if (isSelected) {
                        optionStyle =
                          "bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500";
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAnswered}
                          onClick={() => setSelectedOption(option)}
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${optionStyle}`}
                        >
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5 ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className="text-sm font-medium leading-relaxed flex-1">
                            {option}
                          </span>

                          {isAnswered &&
                            option.trim().toLowerCase() === currentQ.correctAnswer?.trim().toLowerCase() && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            )}

                          {isAnswered && isSelected && !questionFeedback.isCorrect && (
                            <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // OPEN-ENDED TEXTAREA
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <PenTool className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Your Formulated Answer</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        {openEndedAnswer.trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                    </label>

                    <textarea
                      rows={5}
                      disabled={isAnswered || isSubmitting}
                      value={openEndedAnswer}
                      onChange={(e) => setOpenEndedAnswer(e.target.value)}
                      placeholder="Formulate your detailed answer explaining concepts, operational mechanisms, and architectural trade-offs..."
                      className="w-full p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed transition-all disabled:opacity-75"
                    />

                    {currentQ.expectedKeyPoints && currentQ.expectedKeyPoints.length > 0 && !isAnswered && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                        <span className="font-medium text-slate-300">Suggested Focus:</span>
                        {currentQ.expectedKeyPoints.map((kp, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                            {kp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Instant Feedback Banner */}
                {isAnswered && (
                  <div className="space-y-4 animate-fade-in">
                    {!isOE ? (
                      // MCQ Feedback
                      <div
                        className={`p-4 rounded-xl border ${
                          questionFeedback.isCorrect
                            ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-200"
                            : "bg-rose-950/30 border-rose-800/50 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                          {questionFeedback.isCorrect ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Correct Answer!</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-400" />
                              <span>Incorrect Answer</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {questionFeedback.explanation ||
                            (questionFeedback.isCorrect
                              ? "Well done! You demonstrated solid understanding."
                              : `The correct answer was "${currentQ.correctAnswer}".`)}
                        </p>
                      </div>
                    ) : (
                      // Open-Ended Deep AI Feedback
                      <div className="p-5 rounded-2xl bg-slate-850/90 border border-indigo-500/30 space-y-4 shadow-lg">
                        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              AI Conceptual Evaluation
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              (questionFeedback.score ?? 0) >= 60
                                ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/50"
                                : "bg-amber-950/40 text-amber-300 border-amber-700/50"
                            }
                          >
                            Score: {questionFeedback.score ?? 0}/100
                          </Badge>
                        </div>

                        {/* Understanding & Feedback */}
                        {questionFeedback.evaluation?.understanding && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                              Understanding
                            </div>
                            <p className="text-xs text-slate-200 leading-relaxed">
                              {questionFeedback.evaluation.understanding}
                            </p>
                          </div>
                        )}

                        {questionFeedback.feedback && (
                          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs text-indigo-200 leading-relaxed">
                            <strong>Constructive Feedback: </strong>
                            {questionFeedback.feedback}
                          </div>
                        )}

                        {/* Key Concepts Covered vs Missing Concepts */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {questionFeedback.evaluation?.keyConceptsCovered?.length > 0 && (
                            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/30 space-y-1.5">
                              <div className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Key Concepts Covered</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {questionFeedback.evaluation.keyConceptsCovered.map((kc, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-900/40 text-emerald-200 text-[10px]">
                                    {kc}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {questionFeedback.evaluation?.missingConcepts?.length > 0 && (
                            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/30 space-y-1.5">
                              <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Concepts To Review</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {questionFeedback.evaluation.missingConcepts.map((mc, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-md bg-amber-900/40 text-amber-200 text-[10px]">
                                    {mc}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Model Answer Guidance */}
                        {currentQ.explanation && (
                          <div className="pt-2 border-t border-slate-700/40 text-xs text-slate-400">
                            <strong className="text-slate-300">Model Answer: </strong>
                            {currentQ.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom CTA Bar */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="text-xs text-slate-500">
                    {isAnswered
                      ? "Review feedback above before advancing"
                      : isOE
                      ? "Write your explanation and submit for AI analysis"
                      : "Select an option to enable submission"}
                  </div>

                  {!isAnswered ? (
                    <Button
                      variant="primary"
                      onClick={handleSubmitAnswer}
                      disabled={isOE ? !openEndedAnswer.trim() || isSubmitting : !selectedOption || isSubmitting}
                      className="px-6"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 animate-spin" />
                          <span>Evaluating Answer...</span>
                        </span>
                      ) : (
                        "Submit Answer"
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={handleNextQuestion}
                      disabled={isCompleting}
                      className="px-6 shadow-md shadow-indigo-600/25"
                    >
                      {isCompleting ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 animate-spin" />
                          <span>Finalizing Results...</span>
                        </span>
                      ) : currentQuestionIndex === activeQuiz.questions.length - 1 ? (
                        "Finish Assessment & View Mastery"
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span>Next Question</span>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Exit Quiz Confirmation Modal */}
          {showExitConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3 text-rose-400">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h4 className="text-base font-bold text-white">Exit Active Assessment?</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you sure you want to exit? Your answers and progress in this assessment will be discarded. Navigation tabs will be unlocked once you exit.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowExitConfirm(false)}>
                    Resume Quiz
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleAbandonQuiz}>
                    Exit & Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PHASE 3: RESULTS & SCORECARD */}
      {/* ========================================================================= */}
      {phase === "RESULTS" && quizResults && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Score Summary Card */}
          <div className="rounded-3xl bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-500/30 p-6 sm:p-8 shadow-xl text-center space-y-4">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Award className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Assessment Complete!
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Your performance has been recorded and factored into your concept mastery.
              </p>
            </div>

            <div className="flex items-center justify-center gap-8 py-4">
              <div>
                <div className="text-4xl font-extrabold text-white">
                  {quizResults.score ?? Math.round(((quizResults.correctCount || 0) / (quizResults.totalQuestions || 1)) * 100)}%
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
                  Overall Score
                </div>
              </div>

              <div className="h-10 w-px bg-slate-800" />

              <div>
                <div className="text-4xl font-extrabold text-emerald-400">
                  {quizResults.correctCount || 0} / {quizResults.totalQuestions || 0}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
                  Questions Correct
                </div>
              </div>

              {quizResults.durationSeconds !== undefined && (
                <>
                  <div className="h-10 w-px bg-slate-800" />
                  <div>
                    <div className="text-4xl font-extrabold text-indigo-300">
                      {Math.floor(quizResults.durationSeconds / 60)}m {quizResults.durationSeconds % 60}s
                    </div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
                      Time Taken
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button variant="primary" onClick={handleRetakeOrNew}>
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Take Another Quiz
              </Button>

              <Button
                variant="outline"
                onClick={() => onSwitchTab?.("tutor")}
                className="text-indigo-300 border-indigo-700/50 hover:bg-indigo-950/40"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-indigo-400" />
                Ask Tutor About Weak Areas
              </Button>

              <Button
                variant="ghost"
                onClick={() => onSwitchTab?.("growth")}
                className="text-slate-400 hover:text-white"
              >
                <BarChart3 className="w-4 h-4 mr-1.5" />
                View Growth
              </Button>
            </div>
          </div>

          {/* 1. Concept Mastery Shifts (Before -> After) */}
          {quizResults.masteryChanges && quizResults.masteryChanges.length > 0 && (
            <div className="bg-slate-900/80 rounded-2xl border border-indigo-500/20 p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400">
                  <TrendingUp className="w-4 h-4" />
                  <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                    Concept Mastery Shifts
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Updated from this assessment
                </span>
              </div>

              <div className="space-y-3">
                {quizResults.masteryChanges.map((change, idx) => {
                  const isPositive = change.delta > 0;
                  const isNegative = change.delta < 0;

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          {change.conceptName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {change.isNewBaseline ? (
                            <span>Initial baseline established</span>
                          ) : (
                            <span>
                              Previous Mastery: <strong className="text-slate-300">{change.previousScore}%</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-white">
                            {change.newScore}% Mastery
                          </div>
                        </div>

                        {change.isNewBaseline ? (
                          <Badge variant="outline" className="bg-indigo-950/50 text-indigo-300 border-indigo-700/50 text-xs">
                            New Baseline
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={`text-xs font-bold ${
                              isPositive
                                ? "bg-emerald-950/50 text-emerald-300 border-emerald-700/50"
                                : isNegative
                                ? "bg-rose-950/50 text-rose-300 border-rose-700/50"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            {isPositive ? `+${change.delta}%` : `${change.delta}%`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Recommended Next Steps */}
          {quizResults.nextActions && quizResults.nextActions.length > 0 && (
            <div className="bg-slate-900/80 rounded-2xl border border-indigo-500/25 p-6 space-y-4 shadow-lg">
              <div className="flex items-center gap-2 text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider">
                  Recommended Next Actions
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quizResults.nextActions.map((action, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-white mb-1">
                        {action.title}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {action.description}
                      </p>
                    </div>

                    <div>
                      {action.type === "ask_tutor" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onSwitchTab?.("tutor")}
                          className="w-full text-xs text-indigo-300 border-indigo-700/50 hover:bg-indigo-950/40"
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          {action.actionLabel}
                        </Button>
                      ) : action.type === "retry_weak" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryWeakConcepts(action.conceptIds)}
                          className="w-full text-xs text-amber-300 border-amber-700/50 hover:bg-amber-950/40"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                          {action.actionLabel}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (action.targetTab) onSwitchTab?.(action.targetTab);
                            else handleRetakeOrNew();
                          }}
                          className="w-full text-xs text-slate-300 hover:text-white"
                        >
                          <span>{action.actionLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Detailed Question Breakdown */}
          {quizResults.questionBreakdown && quizResults.questionBreakdown.length > 0 && (
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-lg">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Question Review ({quizResults.questionBreakdown.length})
              </h3>

              <div className="space-y-4">
                {quizResults.questionBreakdown.map((q, idx) => {
                  const isOE = q.type === "open-ended" || q.type === "open_ended";

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border space-y-3 text-xs ${
                        q.isCorrect
                          ? "bg-emerald-950/10 border-emerald-900/40"
                          : "bg-rose-950/15 border-rose-900/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-slate-200 text-sm flex-1 leading-snug">
                          <span className="text-slate-500 mr-1.5">Q{idx + 1}.</span>
                          {q.question}
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            q.isCorrect
                              ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/40 text-[10px]"
                              : "bg-rose-950/40 text-rose-300 border-rose-700/40 text-[10px]"
                          }
                        >
                          {q.isCorrect ? "Correct" : "Incorrect"}
                        </Badge>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        Concept: <strong className="text-slate-300">{q.conceptName || "General"}</strong> • Difficulty: <strong className="text-slate-300 capitalize">{q.difficulty}</strong>
                      </div>

                      {/* Multiple Choice Answers */}
                      {!isOE ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                          <div className={q.isCorrect ? "text-emerald-300" : "text-rose-300"}>
                            <strong>Your Answer: </strong> {q.userAnswer || "None"}
                          </div>
                          <div className="text-emerald-300">
                            <strong>Correct Answer: </strong> {q.correctAnswer}
                          </div>
                        </div>
                      ) : (
                        // Open-Ended Review
                        <div className="space-y-2 pt-1">
                          <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs">
                            <strong className="text-slate-200 block mb-1">Your Submission:</strong>
                            <p className="leading-relaxed">{q.userAnswer || "No answer provided"}</p>
                          </div>

                          {q.evaluation && (
                            <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-800/30 space-y-1.5 text-xs text-indigo-200">
                              <div className="font-bold flex items-center justify-between">
                                <span>AI Feedback:</span>
                                <span>Score: {q.evaluation.score}/100</span>
                              </div>
                              {q.feedback && <p>{q.feedback}</p>}
                              {q.evaluation.missingConcepts?.length > 0 && (
                                <div className="text-[11px] text-amber-300">
                                  <strong>Missing points: </strong>
                                  {q.evaluation.missingConcepts.join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {q.explanation && (
                        <div className="text-slate-300 text-xs pt-2 border-t border-slate-700/40">
                          <strong className="text-slate-200">Explanation: </strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
