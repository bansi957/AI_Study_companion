import React from "react";
import {
  BarChart3,
  TrendingUp,
  Award,
  FileText,
  Activity as ActivityIcon,
  CheckCircle2,
  Clock,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { Card, CardTitle, CardDescription } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";

export const AnalyticsTab = ({
  project,
  space,
  analytics,
  growth,
  onSwitchTab,
}) => {
  const summary = analytics?.summary || {};
  const masteryTrend = analytics?.masteryTrend || [];
  const activityTimeline = analytics?.recentActivityTimeline || [];
  const concepts = analytics?.concepts || [];

  const averageMastery = summary.averageMastery || growth?.summary?.averageMastery || 0;
  const averageQuizScore = summary.averageQuizScore || 0;
  const totalMaterials = summary.totalMaterials || 0;
  const totalQuizzes = summary.totalQuizzes || summary.quizAttempts || 0;

  const getActivityBadge = (type) => {
    switch (type) {
      case "MATERIAL_UPLOADED":
      case "DOCUMENT_PROCESSED":
        return { label: "Material", color: "bg-indigo-950/40 text-indigo-300 border-indigo-700/40" };
      case "QUIZ_STARTED":
      case "QUIZ_COMPLETED":
        return { label: "Quiz", color: "bg-emerald-950/40 text-emerald-300 border-emerald-700/40" };
      case "QUESTION_ANSWERED":
        return { label: "Answered", color: "bg-blue-950/40 text-blue-300 border-blue-700/40" };
      case "TUTOR_QUERY":
        return { label: "Tutor", color: "bg-purple-950/40 text-purple-300 border-purple-700/40" };
      default:
        return { label: "Activity", color: "bg-slate-800 text-slate-400 border-slate-700" };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Analytics KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Average Mastery */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Concept Mastery</span>
            <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{averageMastery}%</div>
          <div className="text-xs text-slate-400 mt-1">
            Across {summary.totalConcepts || 0} extracted concepts
          </div>
        </div>

        {/* Quiz Performance */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Quiz Accuracy</span>
            <div className="p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">{averageQuizScore}%</div>
          <div className="text-xs text-slate-400 mt-1">
            {summary.quizAttempts || 0} total attempt{(summary.quizAttempts || 0) === 1 ? "" : "s"} logged
          </div>
        </div>

        {/* Indexed Materials */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Materials</span>
            <div className="p-2 rounded-xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{totalMaterials}</div>
          <div className="text-xs text-slate-400 mt-1">
            {summary.processedMaterials || totalMaterials} processed & vectorized
          </div>
        </div>

        {/* Total Interactions */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Learning Actions</span>
            <div className="p-2 rounded-xl bg-amber-600/10 text-amber-400 border border-amber-500/20">
              <ActivityIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {summary.recentActivityCount || activityTimeline.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Total recorded study events</div>
        </div>
      </div>

      {/* 2. Mastery Progression Graph (Visual Bar / Trend Presentation) */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-white">Mastery Progression Trend</h3>
            <p className="text-xs text-slate-400">
              Chronological score trajectory calculated from quiz performance snapshots.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-400">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Average Score %</span>
          </div>
        </div>

        {masteryTrend.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
            No historical mastery trend data yet. Complete quizzes to begin recording progression curves.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Responsive Chart Container */}
            <div className="h-52 flex items-end gap-3 pt-6 pb-2 px-4 bg-slate-950/40 rounded-xl border border-slate-800/80 overflow-x-auto">
              {masteryTrend.map((point, idx) => {
                const heightPercent = Math.max(8, Math.min(100, point.score));
                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-[36px] flex flex-col items-center gap-2 group h-full justify-end"
                  >
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-indigo-300 font-semibold bg-slate-800 px-1.5 py-0.5 rounded shadow">
                      {point.score}%
                    </div>
                    <div className="w-full max-w-[28px] bg-slate-800 rounded-t-lg overflow-hidden flex items-end h-full">
                      <div
                        className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-lg transition-all duration-500 group-hover:from-indigo-500 group-hover:to-indigo-300"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[48px]">
                      {point.date ? point.date.slice(5) : `D${idx + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-500 text-right">
              Showing {masteryTrend.length} chronological data point{masteryTrend.length === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>

      {/* 3. Concept Performance Table & Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Concept Performance Table */}
        <div className="lg:col-span-7 bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Concept Performance Breakdown
            </h3>
            <span className="text-xs text-slate-500">{concepts.length} concepts</span>
          </div>

          {concepts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic">
              No concepts recorded. Upload study materials to initialize concept tracking.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto pr-1">
              {concepts.map((c) => (
                <div key={c.conceptId} className="py-3 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 max-w-xs">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {c.name}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Importance: {c.importance || 3}/5
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          (c.score || 0) >= 70
                            ? "bg-emerald-400"
                            : (c.score || 0) >= 50
                            ? "bg-indigo-400"
                            : "bg-amber-400"
                        }`}
                        style={{ width: `${c.score || 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-300 w-10 text-right">
                      {c.score || 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Timeline */}
        <div className="lg:col-span-5 bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Activity Timeline
            </h3>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>

          {activityTimeline.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic">
              No recent activity recorded for this project yet.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {activityTimeline.slice(0, 10).map((act, idx) => {
                const badge = getActivityBadge(act.type);
                const timeStr = act.createdAt
                  ? new Date(act.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recent";

                return (
                  <div
                    key={act.id || idx}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${badge.color}`}>
                          {badge.label}
                        </Badge>
                        <span className="text-slate-300 font-medium truncate">
                          {act.type.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {timeStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
