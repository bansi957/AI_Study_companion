import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Users,
  Activity,
  Cpu,
  HeartPulse,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  FileText,
  TrendingUp,
  Database,
  Server,
  Zap,
  BrainCircuit,
  BarChart3,
  BookOpen,
} from "lucide-react";
import {
  useGetAdminDashboardQuery,
  useGetAdminUsersQuery,
  useGetAdminActivitiesQuery,
  useGetAdminAIUsageQuery,
  useGetAdminHealthQuery,
} from "../../features/admin/adminApi";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";

/* ─────────────────────── Helpers ─────────────────────── */
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "just now";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatTodayDate = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* ─────────────────── SVG Donut Chart ─────────────────── */
const DonutChart = ({ segments, size = 150, thickness = 26, centerLabel, centerSub }) => {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  if (total === 0) return null;
  let offset = 0;
  const slices = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circ;
    const gap = circ - dash;
    const slice = { ...seg, dash, gap, offset: offset * circ, pct };
    offset += pct;
    return slice;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={thickness} />
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset + circ * 0.25}
          strokeLinecap="butt"
          style={{ transition: "all 0.6s ease", opacity: 0.92 }}>
          <title>{s.name}: {Math.round(s.pct * 100)}%</title>
        </circle>
      ))}
      {centerLabel && (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="16" fontWeight="700">{centerLabel}</text>
          {centerSub && <text x={cx} y={cy + 13} textAnchor="middle" fill="#94a3b8" fontSize="9">{centerSub}</text>}
        </>
      )}
    </svg>
  );
};

/* ─────────────────── SVG Line/Area Chart ─────────────── */
const LineAreaChart = ({ points, height = 140, color = "#6366f1" }) => {
  if (!points || points.length < 2) return null;
  const width = 600;
  const pad = { top: 16, right: 16, bottom: 30, left: 32 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const toX = (i) => pad.left + (i / Math.max(points.length - 1, 1)) * cW;
  const toY = (v) => pad.top + cH - (v / maxVal) * cH;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(" ");
  const areaD = `M ${toX(0).toFixed(1)} ${toY(points[0].value).toFixed(1)} ` +
    points.map((p, i) => `L ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(" ") +
    ` L ${toX(points.length - 1).toFixed(1)} ${(pad.top + cH).toFixed(1)} L ${toX(0).toFixed(1)} ${(pad.top + cH).toFixed(1)} Z`;
  const gradId = `ag${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.left} y1={pad.top + cH * (1 - t)} x2={pad.left + cW} y2={pad.top + cH * (1 - t)} stroke="#1e293b" strokeWidth="1" />
          <text x={pad.left - 4} y={pad.top + cH * (1 - t) + 4} textAnchor="end" fill="#475569" fontSize="8">{Math.round(maxVal * t)}</text>
        </g>
      ))}
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(p.value)} r="3.5" fill={color} stroke="#0f172a" strokeWidth="1.5" />
          <text x={toX(i)} y={pad.top + cH + 18} textAnchor="middle" fill="#64748b" fontSize="8">{p.label}</text>
        </g>
      ))}
    </svg>
  );
};

/* ─────────────────── SVG Vertical Bar Chart ─────────────────── */
const BarChart = ({ bars, height = 140, color = "#6366f1" }) => {
  if (!bars || bars.length === 0) return null;
  const width = 600;
  const pad = { top: 16, right: 12, bottom: 30, left: 32 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const barW = Math.max(8, (cW / bars.length) * 0.55);
  const gap = cW / bars.length;
  const colors = ["#6366f1", "#10b981", "#f59e0b", "#a855f7", "#3b82f6", "#f43f5e"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ overflow: "visible", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.left} y1={pad.top + cH * (1 - t)} x2={pad.left + cW} y2={pad.top + cH * (1 - t)} stroke="#1e293b" strokeWidth="1" />
          <text x={pad.left - 4} y={pad.top + cH * (1 - t) + 4} textAnchor="end" fill="#475569" fontSize="8">{Math.round(maxVal * t)}</text>
        </g>
      ))}
      {bars.map((b, i) => {
        const bH = (b.value / maxVal) * cH;
        const x = pad.left + i * gap + gap / 2 - barW / 2;
        const y = pad.top + cH - bH;
        const c = Array.isArray(color) ? colors[i % colors.length] : color;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} rx="4" fill={c} opacity="0.85" style={{ transition: "all 0.5s" }}>
              <title>{b.label}: {b.value}</title>
            </rect>
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fill="white" fontSize="8" fontWeight="600">{b.value}</text>
            <text x={x + barW / 2} y={pad.top + cH + 16} textAnchor="middle" fill="#64748b" fontSize="8">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

/* ─────────────────── Donut Legend ─────────────────────── */
const DonutLegend = ({ segments, total }) => (
  <div className="space-y-2 flex-1 min-w-0">
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

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
export const AdminDashboardPage = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");

  const { data: dashboardData, isLoading: isDashboardLoading, refetch: refetchDashboard } = useGetAdminDashboardQuery();
  const { data: usersData, isLoading: isUsersLoading, refetch: refetchUsers } = useGetAdminUsersQuery(
    { search: userSearch || undefined, role: roleFilter !== "all" ? roleFilter : undefined, limit: 30 },
    { skip: activeTab !== "users" && activeTab !== "overview" }
  );
  const { data: activitiesData, isLoading: isActivitiesLoading, refetch: refetchActivities } = useGetAdminActivitiesQuery(
    { limit: 25, type: activityFilter !== "all" ? activityFilter : undefined },
    { skip: activeTab !== "activity" && activeTab !== "overview" }
  );
  const { data: aiUsageData, isLoading: isAiUsageLoading, refetch: refetchAiUsage } = useGetAdminAIUsageQuery(
    undefined, { skip: activeTab !== "ai_usage" && activeTab !== "overview" }
  );
  const { data: healthData, isLoading: isHealthLoading, refetch: refetchHealth } = useGetAdminHealthQuery(
    undefined, { skip: activeTab !== "health" }
  );

  const handleRefreshAll = () => {
    refetchDashboard();
    if (activeTab === "users") refetchUsers();
    if (activeTab === "activity") refetchActivities();
    if (activeTab === "ai_usage") refetchAiUsage();
    if (activeTab === "health") refetchHealth();
  };

  // Metrics from real data
  const totalUsers = dashboardData?.totalUsers ?? 0;
  const totalProjects = dashboardData?.totalProjects ?? 0;
  const aiCallsTotal = dashboardData?.aiRequests?.total ?? 0;
  const aiSuccessCount = dashboardData?.aiRequests?.successful ?? 0;
  const aiSuccessPercent = aiCallsTotal > 0 ? Math.round((aiSuccessCount / aiCallsTotal) * 100) : 0;
  const activeUsersThisWeek = dashboardData?.totalActiveUsers ?? 0;

  // Activities from API only
  const rawActivities = activitiesData?.activities || [];
  const displayActivities = rawActivities.map((a) => {
    const uName = a.userName || a.userId?.name || "Student";
    const initials = uName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "U";
    const pName = a.projectName || a.projectId?.name || "Workspace";
    let actionText = "performed activity";
    let details = a.metadata?.notes || a.description || "Activity logged";
    if (a.type === "QUIZ_COMPLETED") { actionText = "completed quiz"; details = a.metadata?.score !== undefined ? `Score: ${a.metadata.score}/${a.metadata.totalQuestions || 5}` : details; }
    else if (a.type === "MATERIAL_UPLOADED") { actionText = "uploaded material"; details = a.metadata?.filename || "Study Material.pdf"; }
    else if (a.type === "TUTOR_SESSION" || a.type === "TUTOR_MESSAGE") { actionText = "tutor session"; details = a.metadata?.messageCount ? `${a.metadata.messageCount} messages` : "AI Tutor interaction"; }
    else if (a.type === "MASTERY_UPDATED") { actionText = "mastery updated"; details = a.metadata?.conceptName ? `${a.metadata.conceptName}: Lv ${a.metadata.level || 3}` : "Mastery progress"; }
    return { id: a._id, userName: uName, initials, actionText, projectName: pName, details, timeAgo: formatTimeAgo(a.createdAt), type: a.type };
  });

  // Activity type distribution for pie chart
  const activityTypeCounts = useMemo(() => {
    const map = {};
    rawActivities.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1; });
    return map;
  }, [rawActivities]);

  const activityPieColors = { QUIZ_COMPLETED: "#10b981", MATERIAL_UPLOADED: "#6366f1", TUTOR_SESSION: "#a855f7", TUTOR_MESSAGE: "#a855f7", MASTERY_UPDATED: "#f59e0b" };
  const activityPieSegments = useMemo(() => {
    const colorFallback = ["#6366f1", "#10b981", "#f59e0b", "#a855f7", "#3b82f6"];
    return Object.entries(activityTypeCounts).map(([type, count], i) => ({
      name: type.replace(/_/g, " "),
      value: count,
      color: activityPieColors[type] || colorFallback[i % colorFallback.length],
    }));
  }, [activityTypeCounts]);

  const totalActivityEvents = activityPieSegments.reduce((s, seg) => s + seg.value, 0);

  // AI features — derived from real aiUsageData.breakdown grouped by feature
  const aiFeatures = useMemo(() => {
    const featureColors = {
      conceptGeneration: "#a855f7",
      concept_generation: "#a855f7",
      tutor: "#6366f1",
      quiz: "#10b981",
      quiz_generation: "#10b981",
      assessment: "#f59e0b",
      assessment_generation: "#f59e0b",
      embedding: "#3b82f6",
    };
    const featureLabels = {
      conceptGeneration: "Concept Map",
      concept_generation: "Concept Map",
      tutor: "AI Tutor",
      quiz: "Quiz Gen",
      quiz_generation: "Quiz Gen",
      assessment: "Assessment",
      assessment_generation: "Assessment",
      embedding: "Embeddings",
    };
    const fallbackColors = ["#a855f7", "#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#f43f5e"];

    if (aiUsageData?.breakdown?.length) {
      // Group by feature, summing across models
      const featureMap = {};
      aiUsageData.breakdown.forEach((item) => {
        const key = item.feature || "unknown";
        featureMap[key] = (featureMap[key] || 0) + item.requestCount;
      });
      return Object.entries(featureMap).map(([key, count], i) => ({
        name: featureLabels[key] || key.replace(/_/g, " "),
        count,
        color: featureColors[key] || fallbackColors[i % fallbackColors.length],
      }));
    }
    return [];
  }, [aiUsageData]);
  const aiTotal = useMemo(() => aiFeatures.reduce((s, f) => s + f.count, 0), [aiFeatures]);

  // Real AI summary from aiUsageData
  const aiSummary = aiUsageData?.summary || {};

  // Health data from API
  const health = healthData?.services || {};
  const mongoHealth = health.mongodb || {};
  const redisHealth = health.redis || {};
  const workerHealth = health.documentWorker || {};
  const systemInfo = healthData?.system || {};
  const overallHealth = healthData?.status || "unknown";
  const uptimeSeconds = systemInfo.uptimeSeconds || 0;
  const memoryMb = systemInfo.memoryUsageMb || 0;
  const formatUptime = (sec) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // User role distribution
  const usersRoleSegments = useMemo(() => {
    const users = usersData?.users || [];
    const admins = users.filter((u) => u.role === "admin").length;
    const regular = users.length - admins;
    return [
      { name: "Regular Users", value: regular, color: "#6366f1" },
      { name: "Admins", value: admins, color: "#f43f5e" },
    ].filter((s) => s.value > 0);
  }, [usersData]);

  const tabs = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "users", label: "Users", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "ai_usage", label: "AI Usage", icon: Cpu },
    { id: "health", label: "System Health", icon: HeartPulse },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shadow-sm shadow-indigo-600/10">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Platform-level visibility · {formatTodayDate()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-medium text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Live Platform</span>
          </div>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/80 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDashboardLoading ? "animate-spin text-indigo-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="border-b border-slate-800/80 flex items-center gap-6 sm:gap-8 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition-all relative whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isActive ? "text-indigo-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════
          TAB 1: OVERVIEW
      ══════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"><Users className="w-4 h-4" /></div>
              </div>
              <div className="text-3xl font-extrabold text-white">{isDashboardLoading ? "—" : totalUsers}</div>
              <div className="text-xs text-slate-400 mt-1">{activeUsersThisWeek} active this week</div>
              <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full" style={{ width: totalUsers > 0 ? `${Math.min(100, (activeUsersThisWeek / totalUsers) * 100)}%` : "0%" }} />
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
                <div className="p-2 rounded-xl bg-purple-600/10 text-purple-400 border border-purple-500/20"><BookOpen className="w-4 h-4" /></div>
              </div>
              <div className="text-3xl font-extrabold text-purple-400">{isDashboardLoading ? "—" : totalProjects}</div>
              <div className="text-xs text-slate-400 mt-1">across the platform</div>
              <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: totalProjects > 0 ? "75%" : "0%" }} />
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">AI Calls</span>
                <div className="p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20"><BrainCircuit className="w-4 h-4" /></div>
              </div>
              <div className="text-3xl font-extrabold text-emerald-400">{isDashboardLoading ? "—" : aiCallsTotal}</div>
              <div className="text-xs text-slate-400 mt-1">{aiSuccessPercent}% success rate</div>
              <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full" style={{ width: `${aiSuccessPercent}%` }} />
              </div>
            </div>

            <div className="bg-emerald-950/25 rounded-2xl border border-emerald-500/30 p-5 shadow-lg backdrop-blur-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-emerald-400/80 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">System Status</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              </div>
              <div className="text-2xl font-extrabold text-emerald-300">All Systems</div>
              <div className="text-xs text-emerald-400/70 mt-1">Operational · No incidents</div>
            </div>
          </div>

          {/* Two-column: AI Usage Donut + Activity Type Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Feature Breakdown */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  AI Usage by Feature
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Distribution of AI invocations by pipeline</p>
              </div>
              {aiTotal === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
                  No AI usage data available yet.
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <DonutChart
                      segments={aiFeatures.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count, color: f.color }))}
                      size={140} thickness={26}
                      centerLabel={aiTotal} centerSub="calls"
                    />
                  </div>
                  <DonutLegend
                    segments={aiFeatures.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count, color: f.color }))}
                    total={aiTotal}
                  />
                </div>
              )}
            </div>

            {/* Platform Activity Type Donut */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  Activity Type Distribution
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Breakdown of recent platform events</p>
              </div>
              {totalActivityEvents === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/30 rounded-xl border border-slate-800">
                  No activity data yet.
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <DonutChart segments={activityPieSegments} size={140} thickness={26} centerLabel={totalActivityEvents} centerSub="events" />
                  </div>
                  <DonutLegend segments={activityPieSegments} total={totalActivityEvents} />
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Recent Platform Activity
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Live event log from all users</p>
              </div>
              <Badge variant="subtle" size="sm">{displayActivities.length} events</Badge>
            </div>

            {isActivitiesLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading activity...</div>
            ) : displayActivities.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
                No platform activity recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto pr-1">
                {displayActivities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 hover:bg-slate-800/20 -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                        {activity.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 truncate">
                          <span className="font-semibold text-white">{activity.userName}</span>{" "}
                          <span className="text-slate-400">{activity.actionText}</span>{" "}
                          <span className="text-slate-600">·</span>{" "}
                          <span className="text-slate-300">{activity.projectName}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{activity.details}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap shrink-0 font-mono">{activity.timeAgo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB 2: USERS
      ══════════════════════════════════════════════ */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {["all", "admin", "user"].map((role) => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                    roleFilter === role
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {role === "all" ? "All Roles" : role}
                </button>
              ))}
            </div>
          </div>

          {/* User Role Donut + Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Role Donut */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Role Split
              </h3>
              {usersRoleSegments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No user data.</div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <DonutChart segments={usersRoleSegments} size={140} thickness={26}
                    centerLabel={usersData?.users?.length || 0} centerSub="users" />
                  <DonutLegend segments={usersRoleSegments} total={usersData?.users?.length || 1} />
                </div>
              )}
            </div>

            {/* Users Table */}
            <div className="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Projects</th>
                      <th className="py-3 px-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {isUsersLoading ? (
                      <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading users...</td></tr>
                    ) : (usersData?.users || []).length === 0 ? (
                      <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-xs italic">No users found.</td></tr>
                    ) : (
                      (usersData?.users || []).map((u) => (
                        <tr key={u._id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={u.name} size="sm" />
                              <div>
                                <p className="font-semibold text-slate-100 text-sm">{u.name}</p>
                                <p className="text-xs text-slate-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={u.role === "admin" ? "primary" : "subtle"}>{u.role || "user"}</Badge>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-medium">{u.projectsCount ?? 0}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs">
                            {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB 3: ACTIVITY
      ══════════════════════════════════════════════ */}
      {activeTab === "activity" && (
        <div className="space-y-6">
          {/* Filter chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {["all", "QUIZ_COMPLETED", "MATERIAL_UPLOADED", "TUTOR_SESSION", "MASTERY_UPDATED"].map((type) => (
              <button
                key={type}
                onClick={() => setActivityFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activityFilter === type
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {type === "all" ? "All Activity" : type.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Activity Pie + Feed side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Distribution donut */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Event Breakdown
              </h3>
              {activityPieSegments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No data.</div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <DonutChart segments={activityPieSegments} size={140} thickness={26}
                    centerLabel={totalActivityEvents} centerSub="events" />
                  <DonutLegend segments={activityPieSegments} total={totalActivityEvents} />
                </div>
              )}
            </div>

            {/* Activity Feed */}
            <div className="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                Event Feed
              </h3>
              {isActivitiesLoading ? (
                <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading...</div>
              ) : displayActivities.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">No activity recorded.</div>
              ) : (
                <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto pr-1">
                  {displayActivities.map((activity) => (
                    <div key={activity.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                          {activity.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 truncate">
                            <span className="font-semibold text-white">{activity.userName}</span>{" "}
                            <span className="text-slate-400">{activity.actionText}</span>{" "}
                            <span className="text-slate-600">·</span>{" "}
                            <span className="text-slate-300">{activity.projectName}</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{activity.details}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap font-mono">{activity.timeAgo}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB 4: AI USAGE
      ══════════════════════════════════════════════ */}
      {activeTab === "ai_usage" && (
        <div className="space-y-6">
          {/* KPI row — all real */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total AI Requests</div>
              <div className="text-3xl font-extrabold text-white mt-2">
                {isAiUsageLoading ? "—" : (aiSummary.totalRequests ?? 0)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {aiSummary.successfulRequests ?? 0} successful · {aiSummary.failedRequests ?? 0} failed
              </div>
            </div>
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Success Rate</div>
              <div className="text-3xl font-extrabold text-emerald-400 mt-2">
                {isAiUsageLoading ? "—" : (
                  aiSummary.totalRequests > 0
                    ? `${Math.round((aiSummary.successfulRequests / aiSummary.totalRequests) * 100)}%`
                    : "—"
                )}
              </div>
              <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                  style={{ width: aiSummary.totalRequests > 0 ? `${Math.round((aiSummary.successfulRequests / aiSummary.totalRequests) * 100)}%` : "0%" }} />
              </div>
            </div>
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tokens</div>
              <div className="text-3xl font-extrabold text-indigo-300 mt-2">
                {isAiUsageLoading ? "—" : (aiSummary.totalTokens?.toLocaleString() ?? 0)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Avg latency: {aiSummary.averageLatency ?? 0}ms
              </div>
            </div>
          </div>

          {/* Model breakdown table */}
          {(aiUsageData?.breakdown?.length ?? 0) > 0 && (
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                Breakdown by Model &amp; Feature
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Feature</th>
                      <th className="py-2.5 px-3">Requests</th>
                      <th className="py-2.5 px-3">Success</th>
                      <th className="py-2.5 px-3">Avg Latency</th>
                      <th className="py-2.5 px-3">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {aiUsageData.breakdown.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5 px-3 text-indigo-300 font-mono text-[10px] truncate max-w-[140px]">{item.model}</td>
                        <td className="py-2.5 px-3 text-slate-300">{item.feature}</td>
                        <td className="py-2.5 px-3 text-white font-semibold">{item.requestCount}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-emerald-400">{item.successCount}</span>
                          <span className="text-slate-600"> / </span>
                          <span className="text-rose-400">{item.failureCount}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{item.averageLatency}ms</td>
                        <td className="py-2.5 px-3 text-slate-300">{item.totalTokens?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bar Chart: AI invocations by feature */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                AI Invocations by Feature
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Number of AI pipeline calls per feature area</p>
            </div>
            {isAiUsageLoading ? (
              <div className="py-10 text-center text-xs text-slate-500 animate-pulse">Loading AI usage...</div>
            ) : aiTotal === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800">
                No AI usage data recorded yet.
              </div>
            ) : (
              <div className="bg-slate-950/40 rounded-xl border border-slate-800/80 p-4 pt-6">
                <BarChart bars={aiFeatures.map(f => ({ label: f.name, value: f.count }))} height={180} color={true} />
              </div>
            )}
          </div>

          {/* Donut: AI split */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Proportional Split
            </h3>
            {isAiUsageLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading...</div>
            ) : aiTotal === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No data yet.</div>
            ) : (
              <div className="flex items-center gap-8">
                <div className="flex-shrink-0">
                  <DonutChart
                    segments={aiFeatures.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count, color: f.color }))}
                    size={150} thickness={28} centerLabel={aiTotal} centerSub="total calls"
                  />
                </div>
                <DonutLegend
                  segments={aiFeatures.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count, color: f.color }))}
                  total={aiTotal}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB 5: SYSTEM HEALTH
      ══════════════════════════════════════════════ */}
      {activeTab === "health" && (
        <div className="space-y-6">
          {isHealthLoading ? (
            <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Running health checks...</div>
          ) : (
            <>
              {/* Overall Status Banner */}
              <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
                overallHealth === "healthy" ? "bg-emerald-950/20 border-emerald-500/25" :
                overallHealth === "degraded" ? "bg-amber-950/20 border-amber-500/25" :
                "bg-rose-950/20 border-rose-500/25"
              }`}>
                <span className="relative flex h-4 w-4 flex-shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    overallHealth === "healthy" ? "bg-emerald-400" :
                    overallHealth === "degraded" ? "bg-amber-400" : "bg-rose-400"
                  }`} />
                  <span className={`relative inline-flex rounded-full h-4 w-4 ${
                    overallHealth === "healthy" ? "bg-emerald-500" :
                    overallHealth === "degraded" ? "bg-amber-500" : "bg-rose-500"
                  }`} />
                </span>
                <div>
                  <p className={`text-lg font-extrabold capitalize ${
                    overallHealth === "healthy" ? "text-emerald-300" :
                    overallHealth === "degraded" ? "text-amber-300" : "text-rose-300"
                  }`}>{overallHealth}</p>
                  <p className="text-xs text-slate-400">Last checked: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : "just now"}</p>
                </div>
              </div>

              {/* Service Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    name: "MongoDB Atlas",
                    status: mongoHealth.status || "unknown",
                    detail: mongoHealth.latencyMs != null ? `Ping: ${mongoHealth.latencyMs}ms` : "Latency unavailable",
                    icon: Database,
                    ok: mongoHealth.status === "connected",
                  },
                  {
                    name: "Redis In-Memory",
                    status: redisHealth.status || "unknown",
                    detail: redisHealth.latencyMs != null ? `Ping: ${redisHealth.latencyMs}ms` : "Rate limiter",
                    icon: Server,
                    ok: redisHealth.status === "connected",
                  },
                  {
                    name: "Document Worker",
                    status: workerHealth.status || "unknown",
                    detail: "BullMQ queue worker",
                    icon: Zap,
                    ok: workerHealth.status === "running" || workerHealth.status === "idle",
                  },
                ].map((svc) => (
                  <div key={svc.name} className={`rounded-2xl border p-5 shadow-lg backdrop-blur-sm ${
                    svc.ok ? "bg-emerald-950/20 border-emerald-500/25" : "bg-rose-950/20 border-rose-500/25"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{svc.name}</span>
                      {svc.ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <AlertCircle className="w-4 h-4 text-rose-400" />}
                    </div>
                    <div className={`text-xl font-bold capitalize ${
                      svc.ok ? "text-emerald-300" : "text-rose-300"
                    }`}>{svc.status}</div>
                    <p className="text-xs text-slate-400 mt-1">{svc.detail}</p>
                  </div>
                ))}
              </div>

              {/* System Metrics */}
              <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  Runtime Metrics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Process Uptime", value: formatUptime(uptimeSeconds) },
                    { label: "Memory Usage", value: `${memoryMb} MB RSS` },
                    { label: "Node.js", value: "v22.16.0" },
                    { label: "Server Port", value: "3000 (Socket.io)" },
                  ].map((spec) => (
                    <div key={spec.label} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{spec.label}</p>
                      <p className="text-sm text-slate-200 font-semibold">{spec.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Memory gauge bar */}
              <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-sm space-y-4">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                  Memory Pressure
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>RSS Memory Used</span>
                    <span className="font-semibold text-white">{memoryMb} MB</span>
                  </div>
                  <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        memoryMb > 400 ? "bg-rose-500" : memoryMb > 200 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (memoryMb / 512) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {memoryMb < 200 ? "Normal — Low pressure" : memoryMb < 400 ? "Moderate — Monitor closely" : "High — Consider restart"}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
