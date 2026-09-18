import React from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Sparkles,
  Award,
  Upload,
  ArrowRight,
  TrendingUp,
  Target,
  CheckCircle2,
  Clock,
  BookOpen,
  BrainCircuit,
  Activity as ActivityIcon,
} from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";

export const OverviewTab = ({
  project,
  space,
  materials = [],
  analytics,
  growth,
  onSwitchTab,
}) => {
  const readyMaterials = materials.filter((m) => m.status === "READY");
  const averageMastery = analytics?.summary?.averageMastery || growth?.summary?.averageMastery || 0;
  const recentActivities = analytics?.recentActivityTimeline || [];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Continue Learning Hero Card */}
      {/* <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-slate-900 border border-indigo-500/25 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Continue Learning</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {project?.name}
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-slate-200">Goal: </strong>
              {project?.learningGoal || "Master key knowledge concepts through grounded AI tutoring and adaptive assessments."}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                {readyMaterials.length} {readyMaterials.length === 1 ? "Material ready" : "Materials ready"}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-400" />
                {averageMastery}% Overall Mastery
              </span>
            </div>
          </d
          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 flex-shrink-0">
            <Button
              variant="primary"
              size="md"
              icon={Sparkles}
              onClick={() => onSwitchTab("tutor")}
              className="justify-center shadow-lg shadow-indigo-600/20"
            >
              Ask AI Tutor
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={Award}
              onClick={() => onSwitchTab("quiz")}
              className="justify-center border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Take Quiz
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Upload}
              onClick={() => onSwitchTab("materials")}
              className="justify-center text-slate-400 hover:text-white"
            >
              Upload Material
            </Button>
          </div>
        </div>
      </div> 

      {/* 2. Grid: Left (Materials & Mastery Snapshot) | Right (Next Action & Activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Materials */}
          <Card className="p-6 space-y-4 border-slate-800/80 bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Study Materials
                </h3>
                <p className="text-xs text-slate-400">PDF documents grounding your AI tutor</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchTab("materials")}
                className="text-indigo-400 hover:text-indigo-300 text-xs"
              >
                Manage All ({materials.length}) →
              </Button>
            </div>

            {materials.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No study materials uploaded</p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Upload a PDF document to extract concepts, generate embeddings, and unlock grounded AI tutoring.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Upload}
                  onClick={() => onSwitchTab("materials")}
                  className="mt-2 text-xs"
                >
                  Upload Your First PDF
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {materials.slice(0, 3).map((mat) => {
                  const isReady = mat.status === "READY";
                  const isFailed = mat.status === "FAILED";
                  return (
                    <div
                      key={mat._id || mat.id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {mat.originalName || mat.filename}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {mat.pageCount ? `${mat.pageCount} pages` : "Document"} •{" "}
                            {mat.createdAt ? new Date(mat.createdAt).toLocaleDateString() : "Recent"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={isReady ? "success" : isFailed ? "danger" : "primary"}
                          size="sm"
                        >
                          {mat.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Mastery Snapshot */}
          <Card className="p-6 space-y-4 border-slate-800/80 bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Mastery Snapshot
                </h3>
                <p className="text-xs text-slate-400">Evaluated concept retention and progress</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchTab("growth")}
                className="text-indigo-400 hover:text-indigo-300 text-xs"
              >
                Full Growth Analysis →
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                <p className="text-[11px] font-medium text-slate-400">Average Mastery</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{averageMastery}%</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                <p className="text-[11px] font-medium text-slate-400">Improving Concepts</p>
                <p className="text-xl font-bold text-indigo-400 mt-1">
                  {growth?.summary?.improvingCount ?? 0}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                <p className="text-[11px] font-medium text-slate-400">Attention Needed</p>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  {growth?.summary?.requiringAttentionCount ?? 0}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Knowledge Base Progress</span>
                <span className="font-semibold text-slate-300">{averageMastery}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${averageMastery}%` }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column (1 Col) */}
        <div className="space-y-6">
          {/* Next Step Recommendation (Data-driven from Growth) */}
          <Card className="p-5 space-y-3.5 border-violet-900/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-950 border border-violet-700/60 flex items-center justify-center text-violet-400">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Next Step Recommendation</h4>
                  <p className="text-[11px] text-slate-400">Personalized learning suggestion</p>
                </div>
              </div>
              {(growth?.nextStep?.badge || analytics?.nextStep?.badge) && (
                <Badge variant="primary" size="sm" className="bg-violet-950 text-violet-300 border-violet-700/60 text-[10px]">
                  {growth?.nextStep?.badge || analytics?.nextStep?.badge}
                </Badge>
              )}
            </div>

            {(() => {
              const rec = growth?.nextStep || analytics?.nextStep;
              if (rec) {
                return (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">{rec.title}</p>
                      <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                        {rec.description}
                      </p>
                      {rec.reason && (
                        <p className="text-[10px] text-slate-400 italic mt-1">
                          Why: {rec.reason}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onSwitchTab(rec.action || "tutor")}
                      className="w-full justify-center text-xs mt-1 bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30"
                    >
                      {rec.action === "quiz"
                        ? "Take Focused Quiz"
                        : rec.action === "materials"
                        ? "Upload Material"
                        : "Review with Tutor"}
                    </Button>
                  </div>
                );
              }

              return (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {readyMaterials.length === 0
                      ? "Upload your first study material to build knowledge embeddings for this project."
                      : "Start a focused session with the AI Tutor grounded in your project documents."}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onSwitchTab(readyMaterials.length === 0 ? "materials" : "tutor")}
                    className="w-full justify-center text-xs mt-1 bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30"
                  >
                    {readyMaterials.length === 0 ? "Upload Material" : "Ask AI Tutor"}
                  </Button>
                </div>
              );
            })()}
          </Card>

          {/* Recent Quizzes Section (Replaces Recent Activity) */}
          <Card className="p-5 space-y-3.5 border-slate-800/80 bg-slate-900/60 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Recent Quizzes</h4>
                  <p className="text-[11px] text-slate-400">Performance on latest attempts</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchTab("quiz")}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Take Quiz →
              </Button>
            </div>

            {(() => {
              const recentQuizzes = analytics?.recentQuizzes || [];
              if (recentQuizzes.length === 0) {
                return (
                  <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center space-y-2">
                    <Award className="w-6 h-6 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">No quiz attempts yet</p>
                    <p className="text-[11px] text-slate-400">
                      Take your first adaptive quiz to test concept mastery and track improvement over time.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSwitchTab("quiz")}
                      className="mt-1 text-xs border-indigo-700/50 text-indigo-300 hover:bg-indigo-950/40"
                    >
                      Start Quiz
                    </Button>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5">
                  {recentQuizzes.slice(0, 4).map((quiz) => {
                    const isHigh = quiz.score >= 75;
                    const isLow = quiz.score < 50;
                    const badgeVariant = isHigh ? "success" : isLow ? "danger" : "primary";
                    const formattedDate = quiz.date
                      ? new Date(quiz.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Recent";

                    return (
                      <div
                        key={quiz.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {quiz.quizName}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{quiz.totalQuestions} questions</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {formattedDate}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <span
                              className={`text-sm font-bold ${
                                isHigh
                                  ? "text-emerald-400"
                                  : isLow
                                  ? "text-amber-400"
                                  : "text-indigo-300"
                              }`}
                            >
                              {quiz.score}%
                            </span>
                          </div>
                          <Badge variant={badgeVariant} size="sm">
                            {quiz.indicatorLabel || (isHigh ? "Strong" : isLow ? "Review" : "Good")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>
        </div>
      </div>
    </div>
  );
};
