import React, { useMemo } from "react";
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ GitHub-style Streak Calendar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
          {streakDays > 0 ? "Keep it up! ðŸ”¥" : "Start studying to build your streak"}
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
            {totalQuestionsAnswered > 0 ? `${questionAccuracyPercent}%` : "â€”"}
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
            Take New Quiz â†’
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

      {/* â”€â”€ 4. Two-Column: Activity Pie + Mastery Donut â”€â”€ */}
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
            <div className="flex items-center gap-6">
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
            <div className="flex items-center gap-6">
              <div className="flex-shrink-0">
                <DonutChart segments={masterySegments} size={150} thickness={28} centerLabel={concepts.length} centerSub="concepts" />
              </div>
              <DonutLegend segments={masterySegments} total={concepts.length} />
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ 5. Question Accuracy Breakdown â”€â”€ */}
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
          <div className="flex items-center gap-6">
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

      {/* â”€â”€ 6. Recent Activity Feed â”€â”€ */}
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
