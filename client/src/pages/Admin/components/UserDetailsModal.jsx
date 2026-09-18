import React, { useState } from "react";
import {
  X,
  Compass,
  FolderGit2,
  HelpCircle,
  Award,
  CheckCircle2,
  Clock,
  Calendar,
  BookOpen,
  BrainCircuit,
  Layers,
  Sparkles,
  AlertCircle,
  FileText,
  Activity,
  Check,
} from "lucide-react";
import { useGetAdminUserDetailsQuery } from "../../../features/admin/adminApi";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";

export const UserDetailsModal = ({ userId, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: userDetails,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetAdminUserDetailsQuery(userId, { skip: !isOpen || !userId });

  if (!isOpen) return null;

  const user = userDetails?.user;
  const stats = userDetails?.stats || {};
  const spaces = userDetails?.spaces || [];
  const projects = userDetails?.projects || [];
  const quizAttempts = userDetails?.quizAttempts || [];
  const recentActivity = userDetails?.recentActivity || [];

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "spaces", label: "Spaces", icon: Compass, count: stats.spacesCount ?? spaces.length },
    { id: "projects", label: "Projects", icon: FolderGit2, count: stats.projectsCount ?? projects.length },
    { id: "quizzes", label: "Quizzes Attempted", icon: Award, count: stats.quizAttemptsCount ?? quizAttempts.length },
    { id: "activity", label: "Activity Log", icon: Activity, count: recentActivity.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-fade-in text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar name={user?.name || "User"} size="lg" className="border border-indigo-500/30" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                  {user?.name || "User Details"}
                </h2>
                <Badge variant={user?.role === "admin" ? "primary" : "subtle"}>
                  {user?.role || "user"}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 truncate mt-0.5">
                {user?.email || "No email available"}
                {user?.createdAt && (
                  <span className="text-slate-500 ml-2">
                    · Joined {formatDate(user.createdAt)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/40 hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Subtabs Navigation */}
        <div className="flex items-center gap-2 px-5 sm:px-6 pt-3 pb-2 border-b border-slate-800/60 bg-slate-900/90 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                      isActive
                        ? "bg-indigo-500/30 text-indigo-200"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 mx-auto border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Loading user profile &amp; activity history...</p>
            </div>
          ) : isError ? (
            <div className="p-6 rounded-xl bg-rose-950/20 border border-rose-800/40 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-rose-300">Failed to load user details</p>
              <p className="text-xs text-slate-400">{error?.data?.message || error?.message || "Unknown error occurred"}</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border border-rose-500/40 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* ═══════════ TAB: OVERVIEW ═══════════ */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Key Stats Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                    {/* Spaces Created */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">Spaces</span>
                        <Compass className="w-4 h-4 text-cyan-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.spacesCount ?? 0}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Spaces created</p>
                    </div>

                    {/* Projects Working On */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">Projects</span>
                        <FolderGit2 className="w-4 h-4 text-indigo-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.projectsCount ?? 0}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Active workspaces</p>
                    </div>

                    {/* Quizzes Attempted */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">Quizzes</span>
                        <Award className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.quizAttemptsCount ?? 0}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {stats.quizzesCompletedCount ?? 0} completed
                      </p>
                    </div>

                    {/* Average Score */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">Avg Accuracy</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.averageQuizScore ?? 0}%
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Across quiz attempts</p>
                    </div>

                    {/* Materials Uploaded */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">Materials</span>
                        <BookOpen className="w-4 h-4 text-purple-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.materialsCount ?? 0}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Study documents</p>
                    </div>

                    {/* AI Invocations */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider">AI Usage</span>
                        <BrainCircuit className="w-4 h-4 text-pink-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white font-mono">
                        {stats.aiUsage?.totalRequests ?? 0}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {(stats.aiUsage?.totalTokens ?? 0).toLocaleString()} tokens
                      </p>
                    </div>
                  </div>

                  {/* Summary Lists: Spaces & Projects Snapshot */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Spaces Snapshot */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-cyan-400" />
                          Created Spaces ({spaces.length})
                        </h4>
                        <button
                          onClick={() => setActiveTab("spaces")}
                          className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                        >
                          View all
                        </button>
                      </div>
                      {spaces.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-3">No spaces created yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {spaces.slice(0, 3).map((s) => (
                            <div
                              key={s._id}
                              className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/50 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                                  style={{
                                    backgroundColor: `${s.color || "#6366f1"}20`,
                                    color: s.color || "#6366f1",
                                    border: `1px solid ${s.color || "#6366f1"}40`,
                                  }}
                                >
                                  {s.name ? s.name[0].toUpperCase() : "S"}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-200 truncate">{s.name}</p>
                                  <p className="text-[10px] text-slate-500">{s.projectsCount || 0} projects</p>
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-500 whitespace-nowrap font-mono">
                                {formatDate(s.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Projects Snapshot */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />
                          Active Projects ({projects.length})
                        </h4>
                        <button
                          onClick={() => setActiveTab("projects")}
                          className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                        >
                          View all
                        </button>
                      </div>
                      {projects.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-3">No projects working on yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {projects.slice(0, 3).map((p) => (
                            <div
                              key={p._id}
                              className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/50 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {p.spaceId?.name && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                      {p.spaceId.name}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500">
                                    {p.materialsCount || 0} materials
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-500 whitespace-nowrap font-mono">
                                {formatDate(p.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Latest Activity Snippet */}
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        Recent Activities
                      </h4>
                      <button
                        onClick={() => setActiveTab("activity")}
                        className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      >
                        View all ({recentActivity.length})
                      </button>
                    </div>
                    {recentActivity.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">No activity recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-800/60">
                        {recentActivity.slice(0, 4).map((a) => (
                          <div key={a._id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <p className="text-slate-300 truncate">
                                <span className="font-semibold text-white">
                                  {a.type.replace(/_/g, " ")}
                                </span>{" "}
                                {a.projectId?.name && (
                                  <span className="text-slate-400">in {a.projectId.name}</span>
                                )}
                              </p>
                              {a.metadata?.question && (
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  "{a.metadata.question}"
                                </p>
                              )}
                              {a.metadata?.score !== undefined && (
                                <p className="text-[11px] text-emerald-400 font-mono mt-0.5">
                                  Score: {a.metadata.score}%
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                              {formatDateTime(a.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══════════ TAB: SPACES ═══════════ */}
              {activeTab === "spaces" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Compass className="w-4 h-4 text-cyan-400" />
                        Created Study Spaces
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        High-level organizational workspaces created by this user
                      </p>
                    </div>
                    <Badge variant="subtle">{spaces.length} spaces</Badge>
                  </div>

                  {spaces.length === 0 ? (
                    <div className="py-12 text-center rounded-xl bg-slate-950/30 border border-slate-800/60 space-y-2">
                      <Compass className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">This user hasn't created any spaces yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {spaces.map((space) => (
                        <div
                          key={space._id}
                          className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                                style={{
                                  backgroundColor: `${space.color || "#6366f1"}25`,
                                  color: space.color || "#6366f1",
                                  border: `1px solid ${space.color || "#6366f1"}50`,
                                }}
                              >
                                {space.name ? space.name[0].toUpperCase() : "S"}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-white truncate">{space.name}</h4>
                                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                  {space.description || "No description provided"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium text-slate-400">
                              <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />
                              {space.projectsCount || 0} projects
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              Created {formatDate(space.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ TAB: PROJECTS ═══════════ */}
              {activeTab === "projects" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-indigo-400" />
                        Projects &amp; Workspaces
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Subject and topic projects this user is studying
                      </p>
                    </div>
                    <Badge variant="subtle">{projects.length} projects</Badge>
                  </div>

                  {projects.length === 0 ? (
                    <div className="py-12 text-center rounded-xl bg-slate-950/30 border border-slate-800/60 space-y-2">
                      <FolderGit2 className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">This user has not created or joined any projects yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 rounded-xl bg-slate-950/40 border border-slate-800 overflow-hidden">
                      {projects.map((proj) => (
                        <div
                          key={proj._id}
                          className="p-4 hover:bg-slate-800/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white truncate">{proj.name}</h4>
                              {proj.spaceId?.name && (
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                  style={{
                                    backgroundColor: `${proj.spaceId.color || "#6366f1"}20`,
                                    color: proj.spaceId.color || "#818cf8",
                                    border: `1px solid ${proj.spaceId.color || "#6366f1"}40`,
                                  }}
                                >
                                  Space: {proj.spaceId.name}
                                </span>
                              )}
                              <Badge variant={proj.status === "active" ? "primary" : "subtle"} size="sm">
                                {proj.status || "active"}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1">
                              {proj.description || "No project description provided."}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 self-start sm:self-auto">
                            <span className="flex items-center gap-1 font-medium text-slate-300">
                              <FileText className="w-3.5 h-3.5 text-purple-400" />
                              {proj.materialsCount || 0} materials
                            </span>
                            <span className="font-mono text-slate-500 text-[11px]">
                              {formatDate(proj.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ TAB: QUIZZES ATTEMPTED ═══════════ */}
              {activeTab === "quizzes" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-400" />
                        Quizzes &amp; Assessment History
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        All quizzes generated, attempted, and completed by this learner
                      </p>
                    </div>
                    <Badge variant="subtle">{quizAttempts.length} attempts</Badge>
                  </div>

                  {quizAttempts.length === 0 ? (
                    <div className="py-12 text-center rounded-xl bg-slate-950/30 border border-slate-800/60 space-y-2">
                      <Award className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">This user hasn't attempted any quizzes yet.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-950/40 border border-slate-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Project</th>
                              <th className="py-3 px-4">Format / Difficulty</th>
                              <th className="py-3 px-4">Score</th>
                              <th className="py-3 px-4">Questions</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Attempted At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {quizAttempts.map((q) => {
                              const scorePct = q.score !== undefined ? q.score : null;
                              const scoreColor =
                                scorePct >= 75
                                  ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/50"
                                  : scorePct >= 50
                                  ? "text-amber-400 bg-amber-950/40 border-amber-800/50"
                                  : "text-rose-400 bg-rose-950/40 border-rose-800/50";

                              return (
                                <tr key={q._id} className="hover:bg-slate-800/20 transition-colors">
                                  <td className="py-3 px-4 font-semibold text-slate-200">
                                    {q.projectId?.name || "Workspace"}
                                  </td>
                                  <td className="py-3 px-4 text-slate-400 capitalize">
                                    <span className="text-slate-300 font-medium">
                                      {q.quizId?.questionFormat || "Mixed"}
                                    </span>{" "}
                                    <span className="text-slate-600">·</span>{" "}
                                    <span className="text-indigo-400">
                                      {q.quizId?.difficulty || "Adaptive"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold">
                                    {scorePct !== null ? (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs ${scoreColor}`}
                                      >
                                        {scorePct}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-slate-300 font-mono">
                                    {q.answers?.length || 0} / {q.quizId?.totalQuestions || q.answers?.length || 5}
                                  </td>
                                  <td className="py-3 px-4">
                                    {q.completed ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                                        <Check className="w-3 h-3" />
                                        Completed
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                                        <Clock className="w-3 h-3" />
                                        In Progress
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                                    {formatDateTime(q.createdAt || q.startedAt)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ TAB: ACTIVITY LOG ═══════════ */}
              {activeTab === "activity" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Comprehensive Activity Log
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Chronological trail of milestones, tutor sessions, and quiz submissions
                      </p>
                    </div>
                    <Badge variant="subtle">{recentActivity.length} events</Badge>
                  </div>

                  {recentActivity.length === 0 ? (
                    <div className="py-12 text-center rounded-xl bg-slate-950/30 border border-slate-800/60 space-y-2">
                      <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">No activity logged for this user yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 rounded-xl bg-slate-950/40 border border-slate-800 overflow-hidden">
                      {recentActivity.map((act) => (
                        <div
                          key={act._id}
                          className="p-3.5 hover:bg-slate-800/20 transition-colors flex items-start justify-between gap-4 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="text-slate-200">
                              <span className="font-semibold text-indigo-300">
                                {act.type.replace(/_/g, " ")}
                              </span>{" "}
                              {act.projectId?.name && (
                                <span className="text-slate-400">
                                  in <span className="text-slate-300 font-medium">{act.projectId.name}</span>
                                </span>
                              )}
                            </p>
                            {act.metadata?.question && (
                              <p className="text-[11px] text-slate-400 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-md mt-1 italic">
                                "{act.metadata.question}"
                              </p>
                            )}
                            {act.metadata?.filename && (
                              <p className="text-[11px] text-purple-300 mt-0.5 flex items-center gap-1 font-mono">
                                <FileText className="w-3 h-3" />
                                {act.metadata.filename}
                              </p>
                            )}
                            {act.metadata?.conceptName && (
                              <p className="text-[11px] text-amber-300 mt-0.5">
                                Concept: {act.metadata.conceptName} (Level {act.metadata.level || 1})
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap shrink-0">
                            {formatDateTime(act.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>User ID: <code className="font-mono text-slate-300">{userId}</code></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
