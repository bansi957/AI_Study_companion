import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  Award,
  CheckCircle2,
  Clock,
  Calendar,
  Flame,
  Check,
  X,
  Target,
  FileQuestion,
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SVG Donut / Pie Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DonutChart = ({ segments, size = 160, thickness = 30, centerLabel, centerSub }) => {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  if (total === 0) return null;

  let offset = 0;
  const slices = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const slice = { ...seg, dash, gap, offset: offset * circumference, pct };
    offset += pct;
    return slice;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={thickness} />
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={thickness}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset + circumference * 0.25}
          strokeLinecap="butt"
          style={{ transition: "all 0.6s ease", opacity: 0.92 }}
        >
          <title>{s.name}: {Math.round(s.pct * 100)}%</title>
        </circle>
      ))}
      {centerLabel && (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">
            {centerLabel}
          </text>
          {centerSub && (
            <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize="10">
              {centerSub}
            </text>
          )}
        </>
      )}
    </svg>
  );
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SVG Line / Area Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const LineAreaChart = ({ points, height = 180, color = "#10b981" }) => {
  if (!points || points.length === 0) return null;
  const width = 600;
  const padding = { top: 20, right: 16, bottom: 36, left: 38 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = 100;
  const minVal = 0;
  const toX = (i) => padding.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const toY = (v) => padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(" ");
  const areaD =
    `M ${toX(0).toFixed(2)} ${toY(points[0].value).toFixed(2)} ` +
    points.map((p, i) => `L ${toX(i).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(" ") +
    ` L ${toX(points.length - 1).toFixed(2)} ${(padding.top + chartH).toFixed(2)} L ${toX(0).toFixed(2)} ${(padding.top + chartH).toFixed(2)} Z`;

  const gradId = `areaGrad${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={padding.left} y1={toY(v)} x2={padding.left + chartW} y2={toY(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={padding.left - 6} y={toY(v) + 4} textAnchor="end" fill="#475569" fontSize="9">{v}%</text>
        </g>
      ))}
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(p.value)} r="4.5" fill={color} stroke="#0f172a" strokeWidth="2" />
          <text x={toX(i)} y={toY(p.value) - 10} textAnchor="middle" fill="white" fontSize="9" fontWeight="600">{p.value}%</text>
          <text x={toX(i)} y={padding.top + chartH + 20} textAnchor="middle" fill="#64748b" fontSize="9">{p.label}</text>
        </g>
      ))}
    </svg>
  );
};

/* ─────────────────── GitHub-style Streak Calendar ─────────────────── */
const StreakCalendar = ({ days, streakDays }) => {
  const cellSize = 26;
  const gap = 5;
  const clone = [...days];
  const firstDate = clone[0] ? new Date(clone[0].displayDate) : new Date();
  const firstDow = (firstDate.getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) clone.unshift(null);

  const weeks = [];
  for (let i = 0; i < clone.length; i += 7) weeks.push(clone.slice(i, i + 7));

  const levelColor = (l) => ["#0f172a", "#312e81", "#4f46e5", "#6366f1"][l] || "#0f172a";
  const levelBorder = (l) => ["#1e293b", "#3730a3", "#4338ca", "#818cf8"][l] || "#1e293b";
  const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
          <Flame className="w-5 h-5 text-amber-400" />
          <span className="text-xl font-extrabold text-amber-400">{streakDays}</span>
          <span className="text-sm text-amber-300/70 font-medium">day streak</span>
        </div>
        <span className="text-xs text-slate-500">
          {streakDays > 0 ? "Keep it up! 🔥" : "Start studying to build your streak"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ display: "flex", gap, width: "max-content" }}>
          <div style={{ display: "flex", flexDirection: "column", gap, marginTop: cellSize + gap }}>
            {weekDayLabels.map((d, i) => (
              <div key={i} style={{ height: cellSize, lineHeight: `${cellSize}px` }} className="text-[9px] text-slate-600 pr-1 text-right w-7">
                {i % 2 === 0 ? d : ""}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => {
            const firstValid = week.find(Boolean);
            const monthLabel = firstValid && wi % 4 === 0
              ? new Date(firstValid.displayDate).toLocaleDateString(undefined, { month: "short" })
              : "";
            return (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
                <div className="text-[9px] text-slate-600 text-center" style={{ height: cellSize, lineHeight: `${cellSize}px` }}>{monthLabel}</div>
                {week.map((day, di) => (
                  <div
                    key={di}
                    title={day ? `${day.displayDate}: ${day.count} interaction${day.count === 1 ? "" : "s"}` : ""}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 5,
                      backgroundColor: day ? levelColor(day.level) : "transparent",
                      border: `1.5px solid ${day ? levelBorder(day.level) : "transparent"}`,
                      transition: "all 0.2s",
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">Less</span>
        {[0, 1, 2, 3].map((l) => (
          <div key={l} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: levelColor(l), border: `1px solid ${levelBorder(l)}` }} />
        ))}
        <span className="text-[10px] text-slate-500">More</span>
      </div>
    </div>
  );
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Donut Legend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DonutLegend = ({ segments, total }) => (
  <div className="space-y-2.5 flex-1 min-w-0">
    {segments.map((s, i) => {
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      return (
        <div key={i} className="flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-slate-300 font-medium truncate">{s.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-slate-500">{s.value}</span>
            <span className="font-bold text-white w-8 text-right">{pct}%</span>
          </div>
        </div>
      );
    })}
  </div>
);

export const AnalyticsTab = ({
  project,
  space,
  analytics,
  growth,
  onSwitchTab,
}) => {
  const summary = analytics?.summary || {};
  const activityTimeline = analytics?.recentActivityTimeline || [];
  const concepts = analytics?.concepts || [];
  const quizScoreTrend = analytics?.quizScoreTrend || [];
  const activityByDay = analytics?.activityByDay || [];
  const activityDistribution = analytics?.activityDistribution || [];
  const masteryDistribution = analytics?.masteryDistribution || [];

  const averageMastery = summary.averageMastery || growth?.summary?.averageMastery || 0;
  const averageQuizScore = summary.averageQuizScore || 0;
  const quizAttemptsCount = summary.quizAttempts || 0;
  const streakDays = summary.streakDays || 0;

  const totalQuestionsAnswered = summary.totalQuestionsAnswered || 0;
  const correctQuestionsCount = summary.correctQuestionsCount || 0;
  const incorrectQuestionsCount = summary.incorrectQuestionsCount || 0;
  const questionAccuracyPercent =
    totalQuestionsAnswered > 0
      ? Math.round((correctQuestionsCount / totalQuestionsAnswered) * 100)
      : averageQuizScore;

  const totalActivitiesCount = activityDistribution.reduce((acc, a) => acc + (a.count || 0), 0);

  // Quiz questions and answers history
  const recentQuizzes = analytics?.recentQuizzes || [];
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [questionFilter, setQuestionFilter] = useState("all");
  const [expandedQuestions, setExpandedQuestions] = useState({});

  const activeQuiz = useMemo(() => {
    if (selectedQuizId) {
      const found = recentQuizzes.find((q) => q.id === selectedQuizId);
      if (found) return found;
    }
    return recentQuizzes[0] || null;
  }, [selectedQuizId, recentQuizzes]);

  const activeQuizId = activeQuiz?.id;
  const activeQuizQuestions = activeQuiz?.questions || [];

  const incorrectQuestionsInActiveQuiz = useMemo(
    () => activeQuizQuestions.filter((q) => !q.isCorrect),
    [activeQuizQuestions]
  );
  const correctQuestionsInActiveQuiz = useMemo(
    () => activeQuizQuestions.filter((q) => q.isCorrect),
    [activeQuizQuestions]
  );

  const filteredQuestions = useMemo(() => {
    if (questionFilter === "incorrect") return incorrectQuestionsInActiveQuiz;
    if (questionFilter === "correct") return correctQuestionsInActiveQuiz;
    return activeQuizQuestions;
  }, [questionFilter, incorrectQuestionsInActiveQuiz, correctQuestionsInActiveQuiz, activeQuizQuestions]);

  // Activity Pie segments
  const activityColors = ["#a855f7", "#10b981", "#6366f1", "#f59e0b", "#3b82f6"];
  const activitySegments = useMemo(
    () =>
      activityDistribution.map((item, i) => ({
        name: item.name,
        value: item.count,
        color: activityColors[i % activityColors.length],
      })),
    [activityDistribution]
  );

  // Mastery Donut segments
  const masterySegments = useMemo(
    () =>
      masteryDistribution
        .filter((t) => t.count > 0)
        .map((t) => ({ name: t.name, value: t.count, color: t.color })),
    [masteryDistribution]
  );

  // Quiz line chart points
  const quizLinePoints = useMemo(
    () =>
      quizScoreTrend.map((pt) => ({ value: pt.score, label: pt.date })),
    [quizScoreTrend]
  );

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
      case "TUTOR_MESSAGE":
      case "TUTOR_QUERY":
        return { label: "Tutor", color: "bg-purple-950/40 text-purple-300 border-purple-700/40" };
      default:
        return { label: "Activity", color: "bg-slate-800 text-slate-400 border-slate-700" };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* â”€â”€ 1. KPI Stat Cards â”€â”€ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Concept Mastery */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Concept Mastery</span>
            <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{averageMastery}%</div>
          <div className="text-xs text-slate-400 mt-1">Across {summary.totalConcepts || 0} concepts</div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-700" style={{ width: `${averageMastery}%` }} />
          </div>
        </div>

        {/* Avg Quiz Score */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Quiz Score</span>
            <div className="p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">{averageQuizScore}%</div>
          <div className="text-xs text-slate-400 mt-1">{quizAttemptsCount} attempt{quizAttemptsCount === 1 ? "" : "s"}</div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${averageQuizScore}%` }} />
          </div>
        </div>

        {/* Question Accuracy */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Question Accuracy</span>
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-blue-400">
            {totalQuestionsAnswered > 0 ? `${questionAccuracyPercent}%` : "0%"}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {totalQuestionsAnswered > 0
              ? `${correctQuestionsCount} / ${totalQuestionsAnswered} correct`
              : "No questions answered yet"}
          </div>
          {totalQuestionsAnswered > 0 && (
            <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${questionAccuracyPercent}%` }} />
              <div className="h-full bg-rose-500 transition-all duration-700" style={{ width: `${100 - questionAccuracyPercent}%` }} />
            </div>
          )}
        </div>

        {/* Day Streak */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Day Streak</span>
            <div className="p-2 rounded-xl bg-amber-600/10 text-amber-400 border border-amber-500/20">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-400 flex items-baseline gap-1.5">
            {streakDays}
            <span className="text-lg font-normal text-slate-400">{streakDays === 1 ? "day" : "days"}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {streakDays > 0 ? "Active daily study streak ðŸ”¥" : "Complete an activity to begin"}
          </div>
        </div>
      </div>

      {/* â”€â”€ 2. Streak Heatmap Calendar â”€â”€ */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm">
        <div className="mb-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Study Activity Calendar
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Daily learning interactions over the past two weeks</p>
        </div>
        {activityByDay.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
            No activity data yet. Start studying to populate your calendar.
          </div>
        ) : (
          <StreakCalendar days={activityByDay} streakDays={streakDays} />
        )}
      </div>

      {/* â”€â”€ 3. Quiz Score Line Chart â”€â”€ */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              Quiz Score Trajectory
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Chronological score trend across completed quiz attempts</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onSwitchTab?.("quiz")} className="text-xs text-indigo-400 hover:text-indigo-300">
            Take New Quiz →
          </Button>
        </div>
        {quizLinePoints.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
            No quiz attempts recorded. Complete quizzes to track your score trajectory.
          </div>
        ) : (
          <div className="bg-slate-950/40 rounded-xl border border-slate-800/80 p-4 pt-6">
            <LineAreaChart points={quizLinePoints} height={180} color="#10b981" />
          </div>
        )}
      </div>

      {/* ── 4. Two-Column: Activity Pie + Mastery Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Activity Distribution Donut */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-400 inline-block" />
              Study Activity Distribution
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Proportion of interactions across learning modalities</p>
          </div>
          {totalActivitiesCount === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
              No study activity logged yet.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <DonutChart segments={activitySegments} size={150} thickness={28} centerLabel={totalActivitiesCount} centerSub="events" />
              </div>
              <DonutLegend segments={activitySegments} total={totalActivitiesCount} />
            </div>
          )}
        </div>

        {/* Concept Mastery Tier Donut */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              Concept Mastery Tiers
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribution of concepts by mastery level</p>
          </div>
          {masterySegments.length === 0 || concepts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
              No concepts recorded. Upload study materials to begin tracking.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <DonutChart segments={masterySegments} size={150} thickness={28} centerLabel={concepts.length} centerSub="concepts" />
              </div>
              <DonutLegend segments={masterySegments} total={concepts.length} />
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Question Accuracy Breakdown ── */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Question Accuracy Breakdown
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Correct vs. incorrect across all answered questions</p>
          </div>
          <Badge variant="primary" size="sm">{totalQuestionsAnswered} Total</Badge>
        </div>

        {totalQuestionsAnswered === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
            No questions answered yet. Take a quiz to evaluate accuracy.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <DonutChart
                segments={[
                  { name: "Correct", value: correctQuestionsCount, color: "#10b981" },
                  { name: "Needs Review", value: incorrectQuestionsCount, color: "#f43f5e" },
                ]}
                size={140}
                thickness={28}
                centerLabel={`${questionAccuracyPercent}%`}
                centerSub="correct"
              />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-200">Correct</span>
                </div>
                <p className="text-2xl font-bold text-emerald-400">{correctQuestionsCount}</p>
                <p className="text-[10px] text-slate-400">{questionAccuracyPercent}% of total</p>
              </div>
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-xs font-semibold text-rose-200">Needs Review</span>
                </div>
                <p className="text-2xl font-bold text-rose-400">{incorrectQuestionsCount}</p>
                <p className="text-[10px] text-slate-400">{100 - questionAccuracyPercent}% of total</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Quiz Questions & Answers History ── */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-indigo-400" />
              Quiz Questions &amp; Answers History
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review completed quiz questions, your answers, correct solutions, and AI explanations
            </p>
          </div>

          {/* Question Filter Pills */}
          {activeQuizQuestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                onClick={() => setQuestionFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  questionFilter === "all"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All ({activeQuizQuestions.length})
              </button>
              <button
                onClick={() => setQuestionFilter("incorrect")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  questionFilter === "incorrect"
                    ? "bg-rose-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Needs Review ({incorrectQuestionsInActiveQuiz.length})
              </button>
              <button
                onClick={() => setQuestionFilter("correct")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  questionFilter === "correct"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Correct ({correctQuestionsInActiveQuiz.length})
              </button>
            </div>
          )}
        </div>

        {recentQuizzes.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-400 font-medium">No quiz attempts recorded for this workspace yet.</p>
            <p className="text-slate-500 max-w-sm mx-auto">
              Take an adaptive quiz to practice concept retention, evaluate questions, and inspect detailed answers here.
            </p>
            {onSwitchTab && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSwitchTab("quiz")}
                className="mt-2 text-xs text-indigo-300 border-indigo-700/50 hover:bg-indigo-950/40"
              >
                Start Practice Quiz →
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quiz Attempt Switcher */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
              <span className="text-xs text-slate-500 font-medium shrink-0">Attempts:</span>
              {recentQuizzes.map((quiz, idx) => {
                const isSelected = activeQuizId === quiz.id;
                const score = quiz.score ?? 0;
                return (
                  <button
                    key={quiz.id}
                    onClick={() => {
                      setSelectedQuizId(quiz.id);
                      setQuestionFilter("all");
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? "bg-slate-800 text-white border border-indigo-500/80 shadow-md shadow-indigo-950/40"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                    }`}
                  >
                    <span>{quiz.quizName || `Attempt #${recentQuizzes.length - idx}`}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        score >= 75
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                          : score >= 50
                          ? "bg-amber-950/80 text-amber-300 border border-amber-700/60"
                          : "bg-rose-950/80 text-rose-300 border border-rose-700/60"
                      }`}
                    >
                      {score}%
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Quiz Meta Banner */}
            {activeQuiz && (
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span>{activeQuiz.quizName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-700/60">
                      {activeQuiz.indicatorLabel}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Completed {activeQuiz.date ? new Date(activeQuiz.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently"}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-slate-300">
                  <div className="text-center sm:text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Score</span>
                    <span className={`font-bold font-mono text-sm ${activeQuiz.score >= 75 ? "text-emerald-400" : activeQuiz.score >= 50 ? "text-amber-400" : "text-rose-400"}`}>
                      {activeQuiz.score}%
                    </span>
                  </div>
                  <div className="text-center sm:text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Questions</span>
                    <span className="font-bold font-mono text-sm text-slate-200">
                      {activeQuizQuestions.length}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Questions List */}
            {filteredQuestions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
                No questions match the "{questionFilter}" filter for this attempt.
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredQuestions.map((q) => {
                  const isExpanded = expandedQuestions[q.questionId] !== false; // default expanded
                  return (
                    <div
                      key={q.questionId || q.questionNumber}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        q.isCorrect
                          ? "bg-slate-950/40 border-emerald-900/30 hover:border-emerald-700/50"
                          : "bg-slate-950/40 border-rose-900/40 hover:border-rose-700/60"
                      }`}
                    >
                      {/* Question Header */}
                      <div
                        onClick={() =>
                          setExpandedQuestions((prev) => ({
                            ...prev,
                            [q.questionId]: !isExpanded,
                          }))
                        }
                        className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                              q.isCorrect
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {q.isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                              <span className="font-bold text-slate-300">Question {q.questionNumber}</span>
                              {q.topic && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                                  {q.topic}
                                </span>
                              )}
                              {q.difficulty && (
                                <span className="capitalize text-slate-500 text-[10px]">• {q.difficulty}</span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-100 leading-relaxed">
                              {q.questionText}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={q.isCorrect ? "success" : "danger"}
                            size="sm"
                          >
                            {q.isCorrect ? "Correct" : "Needs Review"}
                          </Badge>
                          <div className="text-slate-500 hover:text-slate-300 p-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Collapsible Question Detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-900 space-y-3 text-xs">
                          {/* Options Breakdown for Multiple Choice */}
                          {q.options && q.options.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Answer Options
                              </span>
                              <div className="grid grid-cols-1 gap-1.5">
                                {q.options.map((opt, optIdx) => {
                                  const isSelectedByUser =
                                    typeof q.userAnswer === "string" &&
                                    q.userAnswer.trim().toLowerCase() === opt.trim().toLowerCase();
                                  const isTheCorrectAnswer =
                                    typeof q.correctAnswer === "string" &&
                                    q.correctAnswer.trim().toLowerCase() === opt.trim().toLowerCase();

                                  let optClasses = "bg-slate-900/60 border-slate-800 text-slate-300";
                                  let label = null;

                                  if (isSelectedByUser && q.isCorrect) {
                                    optClasses = "bg-emerald-950/40 border-emerald-600/50 text-emerald-200 font-medium";
                                    label = (
                                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Your Answer (Correct)
                                      </span>
                                    );
                                  } else if (isSelectedByUser && !q.isCorrect) {
                                    optClasses = "bg-rose-950/40 border-rose-600/50 text-rose-200 font-medium";
                                    label = (
                                      <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                                        <X className="w-3 h-3" /> Your Answer (Incorrect)
                                      </span>
                                    );
                                  } else if (isTheCorrectAnswer) {
                                    optClasses = "bg-emerald-950/30 border-emerald-600/40 text-emerald-300 font-medium";
                                    label = (
                                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Correct Solution
                                      </span>
                                    );
                                  }

                                  return (
                                    <div
                                      key={optIdx}
                                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${optClasses}`}
                                    >
                                      <span>{opt}</span>
                                      {label}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Open-Ended or non-option format answers */}
                          {(!q.options || q.options.length === 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                  Your Answer
                                </span>
                                <p className="text-slate-200">{q.userAnswer}</p>
                              </div>
                              {q.correctAnswer && (
                                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1">
                                  <span className="text-[10px] text-emerald-400 uppercase font-semibold block">
                                    Target Solution
                                  </span>
                                  <p className="text-emerald-200">{q.correctAnswer}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* AI Explanation & Feedback */}
                          {(q.explanation || q.feedback) && (
                            <div className="p-3 rounded-xl bg-indigo-950/25 border border-indigo-800/40 space-y-1">
                              <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-[11px]">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Explanation &amp; Concept Insight</span>
                              </div>
                              <p className="text-slate-300 leading-relaxed text-xs">
                                {q.explanation || q.feedback}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 7. Recent Learning Activity ── */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Recent Learning Activity
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Chronological log of recent actions in this project</p>
          </div>
          <span className="text-xs text-slate-500">{activityTimeline.length} events</span>
        </div>

        {activityTimeline.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
            No recent activity recorded for this project yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                  className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/70 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${badge.color}`}>
                      {badge.label}
                    </Badge>
                    <span className="text-slate-300 font-medium truncate">
                      {act.type.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{timeStr}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
