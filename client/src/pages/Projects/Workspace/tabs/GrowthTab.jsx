import React from "react";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BrainCircuit,
  Sparkles,
  ArrowRight,
  HelpCircle,
  BookOpen,
  Target,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";

export const GrowthTab = ({
  project,
  space,
  growth,
  analytics,
  onSwitchTab,
}) => {
  const summary = growth?.summary || {};
  const improving = growth?.improving || [];
  const stable = growth?.stable || [];
  const requiringAttention = growth?.requiringAttention || [];
  const unassessed = growth?.unassessed || [];
  const recentTrends = growth?.recentTrends || [];

  const totalConcepts = summary.totalConcepts || 0;
  const assessedConcepts = summary.assessedConcepts || 0;
  const averageMastery = summary.averageMastery || 0;

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "improving":
        return "bg-emerald-950/40 text-emerald-300 border-emerald-700/40";
      case "stable":
        return "bg-indigo-950/40 text-indigo-300 border-indigo-700/40";
      case "requiring_attention":
      case "requiring attention":
        return "bg-amber-950/40 text-amber-300 border-amber-700/40";
      case "unassessed":
        return "bg-slate-800/80 text-slate-400 border-slate-700";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Overall Growth & Mastery Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-slate-900 border border-indigo-500/25 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cognitive Growth Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Knowledge Mastery Analysis
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Track how your understanding of foundational concepts evolves over time through active quiz attempts and tutor interactions.
            </p>
          </div>

          <div className="flex items-center gap-6 sm:gap-8 bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-800/80">
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-indigo-400">
                {averageMastery}%
              </div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
                Average Mastery
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800" />

            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-white">
                {assessedConcepts}
                <span className="text-sm font-normal text-slate-500"> / {totalConcepts}</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
                Concepts Assessed
              </div>
            </div>
          </div>
        </div>

        {/* Mastery Progress Bar */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Overall Concept Coverage</span>
            <span className="font-semibold text-slate-200">
              {totalConcepts > 0 ? Math.round((assessedConcepts / totalConcepts) * 100) : 0}% Evaluated
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full transition-all duration-700"
              style={{
                width: `${totalConcepts > 0 ? Math.min(100, Math.round((assessedConcepts / totalConcepts) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Prominent Next Step Recommendation (Data-Driven from Learner Signals) */}
      {growth?.nextStep && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950/60 via-slate-900 to-indigo-950/60 border border-violet-500/30 p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-300 flex-shrink-0 shadow-lg shadow-violet-950/40">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    {growth.nextStep.title}
                  </h3>
                  <Badge variant="primary" size="sm" className="bg-violet-950/80 text-violet-300 border-violet-700/60">
                    {growth.nextStep.badge || "Recommended Action"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  {growth.nextStep.description}
                </p>
                {growth.nextStep.reason && (
                  <p className="text-[11px] text-slate-400 italic">
                    Why: {growth.nextStep.reason}
                  </p>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              <Button
                variant="primary"
                size="md"
                icon={ArrowRight}
                onClick={() => onSwitchTab?.(growth.nextStep.action || "tutor")}
                className="w-full sm:w-auto justify-center bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 whitespace-nowrap text-xs"
              >
                {growth.nextStep.action === "quiz"
                  ? "Take Focused Quiz"
                  : growth.nextStep.action === "materials"
                  ? "Upload Material"
                  : "Review with Tutor"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Three Classification Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Improving */}
        <div className="bg-slate-900/80 rounded-2xl border border-emerald-500/20 p-5 shadow-lg flex flex-col backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-white">Improving</h3>
            </div>
            <Badge variant="outline" className="text-xs bg-emerald-950/40 text-emerald-300 border-emerald-700/40">
              {improving.length}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Concepts showing positive score momentum across recent quizzes.
          </p>

          <div className="flex-1 space-y-2">
            {improving.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-500 italic">
                No concepts currently in upward progression.
              </div>
            ) : (
              improving.map((c) => (
                <div
                  key={c.conceptId}
                  className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between"
                >
                  <div className="text-xs font-semibold text-slate-200 truncate pr-2">
                    {c.conceptName}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-400">
                      {c.currentScore}%
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1 rounded">
                      +{c.scoreChange ?? c.delta ?? 0}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stable */}
        <div className="bg-slate-900/80 rounded-2xl border border-indigo-500/20 p-5 shadow-lg flex flex-col backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-indigo-400">
              <CheckCircle2 className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-white">Stable</h3>
            </div>
            <Badge variant="outline" className="text-xs bg-indigo-950/40 text-indigo-300 border-indigo-700/40">
              {stable.length}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Concepts reliably understood and maintaining high retention scores.
          </p>

          <div className="flex-1 space-y-2">
            {stable.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-500 italic">
                No concepts in stable tier yet.
              </div>
            ) : (
              stable.map((c) => (
                <div
                  key={c.conceptId}
                  className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between"
                >
                  <div className="text-xs font-semibold text-slate-200 truncate pr-2">
                    {c.conceptName}
                  </div>
                  <span className="text-xs font-bold text-indigo-300">
                    {c.currentScore}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Requiring Attention */}
        <div className="bg-slate-900/80 rounded-2xl border border-amber-500/25 p-5 shadow-lg flex flex-col backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-white">Requires Attention</h3>
            </div>
            <Badge variant="outline" className="text-xs bg-amber-950/40 text-amber-300 border-amber-700/40">
              {requiringAttention.length}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Concepts with low mastery or frequent quiz mistakes that need reinforcement.
          </p>

          <div className="flex-1 space-y-2">
            {requiringAttention.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-500 italic">
                None! All assessed concepts are on track.
              </div>
            ) : (
              requiringAttention.map((c) => (
                <div
                  key={c.conceptId}
                  className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-center justify-between"
                >
                  <div className="text-xs font-semibold text-slate-200 truncate pr-2">
                    {c.conceptName}
                  </div>
                  <span className="text-xs font-bold text-amber-400">
                    {c.currentScore}%
                  </span>
                </div>
              ))
            )}
          </div>

          {requiringAttention.length > 0 && (
            <div className="pt-4 mt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSwitchTab?.("tutor")}
                className="w-full text-xs text-amber-300 border-amber-700/50 hover:bg-amber-950/40"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Review Weak Areas with Tutor
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2b. Unassessed Concepts Banner */}
      {unassessed.length > 0 && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 flex-shrink-0">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                {unassessed.length} Concept{unassessed.length === 1 ? "" : "s"} Not Yet Evaluated
              </h4>
              <p className="text-[11px] text-slate-400">
                Take adaptive quizzes to test your understanding and unlock deeper growth insights.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onSwitchTab?.("quiz")}
            className="text-xs text-indigo-300 border-indigo-700/50 hover:bg-indigo-950/40 flex-shrink-0"
          >
            <BrainCircuit className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            Evaluate in Quiz
          </Button>
        </div>
      )}

      {/* 3. Detailed Concept Mastery Breakdown List */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white">
              All Target Concepts ({totalConcepts})
            </h3>
            <p className="text-xs text-slate-400">
              Individual score tracking and historical progress for each extracted concept.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSwitchTab?.("quiz")}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            <span>Reinforce in Quiz</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        {recentTrends.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No concepts found. Make sure study materials have been uploaded and processed.
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {recentTrends.map((trend) => {
              const score = trend.currentScore || 0;
              return (
                <div
                  key={trend.conceptId}
                  className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 sm:max-w-md">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">
                        {trend.conceptName}
                      </span>
                      <Badge variant="outline" className={`text-[10px] py-0 px-2 capitalize ${getStatusColor(trend.trend)}`}>
                        {trend.trend || "Unassessed"}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {trend.snapshots?.length || 0} evaluation snapshot{(trend.snapshots?.length || 0) === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-36 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Mastery</span>
                        <span className="font-semibold text-slate-200">{score}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            score >= 70
                              ? "bg-emerald-400"
                              : score >= 50
                              ? "bg-indigo-400"
                              : "bg-amber-400"
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSwitchTab?.("tutor")}
                      className="text-xs text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800 h-8 px-2.5"
                      title="Ask Tutor about this concept"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
