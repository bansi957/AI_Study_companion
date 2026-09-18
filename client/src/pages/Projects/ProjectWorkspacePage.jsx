import React, { useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  Compass,
  FileText,
  Bot,
  BrainCircuit,
  TrendingUp,
  BarChart3,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowLeft,
  Clock,
  Target,
  Upload,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import { useGetProjectByIdQuery } from "../../features/projects/projectsApi";
import { useGetSpaceByIdQuery } from "../../features/spaces/spacesApi";
import { useGetMaterialsByProjectIdQuery } from "../../features/materials/materialsApi";
import {
  useGetProjectAnalyticsQuery,
  useGetProjectGrowthQuery,
} from "../../features/analytics/analyticsApi";
import {
  joinProjectRoom,
  leaveProjectRoom,
  subscribeToMaterialStatus,
} from "../../services/socket";

import { OverviewTab } from "./Workspace/tabs/OverviewTab";
import { MaterialsTab } from "./Workspace/tabs/MaterialsTab";
import { TutorTab } from "./Workspace/tabs/TutorTab";
import { QuizTab } from "./Workspace/tabs/QuizTab";
import { GrowthTab } from "./Workspace/tabs/GrowthTab";
import { AnalyticsTab } from "./Workspace/tabs/AnalyticsTab";

import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/ErrorState";

const VALID_TABS = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "materials", label: "Materials", icon: FileText },
  { id: "tutor", label: "AI Tutor", icon: Bot },
  { id: "quiz", label: "Quiz", icon: BrainCircuit },
  { id: "growth", label: "Growth", icon: TrendingUp },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export const ProjectWorkspacePage = () => {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Active tab state from URL params
  const currentTab = searchParams.get("tab") || "overview";
  const activeTab = VALID_TABS.some((t) => t.id === currentTab) ? currentTab : "overview";

  // Assessment tab locking state to prevent progress loss
  const [isAssessmentActive, setIsAssessmentActive] = React.useState(false);

  const handleTabChange = (tabId) => {
    if (isAssessmentActive && tabId !== "quiz") {
      toast.error("Assessment in progress! Please complete or submit your quiz before switching tabs to avoid losing progress.", {
        id: "tab-locked-warning",
      });
      return;
    }
    setSearchParams({ tab: tabId });
    if (tabId === "growth") refetchGrowth?.();
    if (tabId === "analytics") refetchAnalytics?.();
    if (tabId === "overview") {
      refetchAnalytics?.();
      refetchGrowth?.();
    }
  };

  // Prevent accidental page reload or back navigation when assessment is running
  React.useEffect(() => {
    if (!isAssessmentActive) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "You have an active assessment in progress. Leaving will cause your quiz answers to be lost.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAssessmentActive]);

  // Queries
  const {
    data: project,
    isLoading: isProjectLoading,
    isError: isProjectError,
    refetch: refetchProject,
  } = useGetProjectByIdQuery(projectId, { skip: !projectId });

  const spaceId = project?.spaceId;
  const { data: space } = useGetSpaceByIdQuery(spaceId, { skip: !spaceId });

  const {
    data: materials = [],
    isLoading: isMaterialsLoading,
    refetch: refetchMaterials,
  } = useGetMaterialsByProjectIdQuery(projectId, { skip: !projectId });

  const {
    data: analytics,
    refetch: refetchAnalytics,
  } = useGetProjectAnalyticsQuery(projectId, {
    skip: !projectId,
    refetchOnMountOrArgChange: true,
  });

  const {
    data: growth,
    refetch: refetchGrowth,
  } = useGetProjectGrowthQuery(projectId, {
    skip: !projectId,
    refetchOnMountOrArgChange: true,
  });

  // Real-time synchronization across workspace tabs
  React.useEffect(() => {
    if (!projectId) return;

    joinProjectRoom(projectId);

    const unsubscribe = subscribeToMaterialStatus((data) => {
      if (data.projectId && String(data.projectId) !== String(projectId)) return;

      if (data.status === "READY") {
        refetchMaterials();
        refetchAnalytics();
        refetchGrowth();
      }
    });

    return () => {
      leaveProjectRoom(projectId);
      unsubscribe();
    };
  }, [projectId]);

  if (isProjectLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-800/80 rounded-md" />
        <div className="h-44 w-full bg-slate-900/60 rounded-3xl border border-slate-800" />
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-800/60 rounded-xl" />
          ))}
        </div>
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (isProjectError || !project) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <ErrorState
          title="Project Not Found"
          message="The project workspace you are trying to access does not exist or you do not have permission to view it."
          onRetry={refetchProject}
        />
        <div className="text-center mt-6">
          <Button variant="outline" onClick={() => navigate("/projects")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const readyMaterials = materials.filter((m) => m.status === "READY");
  const averageMastery = analytics?.summary?.averageMastery || growth?.summary?.averageMastery || 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. TOP HEADER & BREADCRUMBS */}
      <div className="space-y-4">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-xs text-slate-400">
          <Link
            to="/spaces"
            className="hover:text-slate-200 transition-colors"
          >
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          {space ? (
            <Link
              to={`/spaces/${space._id}`}
              className="hover:text-indigo-400 text-slate-300 font-medium transition-colors"
            >
              {space.name}
            </Link>
          ) : (
            <span className="text-slate-500">Space</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold truncate max-w-[140px] xs:max-w-xs sm:max-w-md">
            {project.name}
          </span>
        </nav>

        {/* Project Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-slate-800/90 p-5 sm:p-7 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge
                  variant="outline"
                  className="bg-indigo-950/50 text-indigo-300 border-indigo-700/50 text-xs px-2.5 py-0.5 font-medium"
                >
                  {project.status || "Active Workspace"}
                </Badge>

                {space && (
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-300 border-slate-700 text-xs px-2.5 py-0.5"
                  >
                    {space.name}
                  </Badge>
                )}

                {project.updatedAt && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {project.name}
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {project.learningGoal ||
                  "Master key knowledge concepts through grounded AI tutoring and adaptive assessments."}
              </p>
            </div>

            {/* Quick Primary Actions in Header */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTabChange("materials")}
                className="text-xs text-slate-200 border-slate-700 hover:bg-slate-800/80 shadow-sm"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                Upload PDF
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTabChange("tutor")}
                className="text-xs text-indigo-300 border-indigo-700/60 hover:bg-indigo-950/40 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                Ask AI Tutor
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleTabChange("quiz")}
                className="text-xs shadow-md shadow-indigo-600/25"
              >
                <BrainCircuit className="w-3.5 h-3.5 mr-1.5" />
                Take Quiz
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TABBED NAVIGATION STRIP */}
      <div className="border-b border-slate-800/80 sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md -mx-3 px-3 sm:mx-0 sm:px-0">
        {/* Active Assessment Warning Banner */}
        {isAssessmentActive && (
          <div className="bg-amber-950/60 border-b border-amber-800/50 px-4 py-2 flex items-center justify-between text-xs text-amber-200 animate-fade-in">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
              <span>
                <strong>Adaptive Assessment in progress:</strong> Other workspace tabs are locked so you don't lose your quiz progress.
              </span>
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium hidden sm:inline-block">Complete quiz to unlock tabs</span>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
          {VALID_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isTabDisabled = isAssessmentActive && tab.id !== "quiz";

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                disabled={isTabDisabled}
                title={
                  isTabDisabled
                    ? "Assessment in progress — complete your quiz before switching tabs"
                    : undefined
                }
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isTabDisabled
                    ? "opacity-35 cursor-not-allowed text-slate-500 bg-slate-900/40 select-none"
                    : isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : isTabDisabled ? "text-slate-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>

                {/* Lock indicator on quiz tab if active */}
                {tab.id === "quiz" && isAssessmentActive && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center gap-1 animate-pulse">
                    <Lock className="w-2.5 h-2.5" />
                    In Progress
                  </span>
                )}

                {/* Badges for tabs */}
                {tab.id === "materials" && readyMaterials.length > 0 && !isAssessmentActive && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    {readyMaterials.length}
                  </span>
                )}

                {tab.id === "growth" && averageMastery > 0 && !isAssessmentActive && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-indigo-950/80 text-indigo-300 border border-indigo-700/40"
                    }`}
                  >
                    {averageMastery}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. ACTIVE TAB CONTENT VIEW */}
      <div className="pt-2">
        {activeTab === "overview" && (
          <OverviewTab
            project={project}
            space={space}
            materials={materials}
            analytics={analytics}
            growth={growth}
            onSwitchTab={handleTabChange}
          />
        )}

        {activeTab === "materials" && (
          <MaterialsTab
            project={project}
            space={space}
            materials={materials}
            refetchMaterials={refetchMaterials}
            onRefreshMaterials={refetchMaterials}
            isMaterialsLoading={isMaterialsLoading}
            onSwitchTab={handleTabChange}
          />
        )}

        {activeTab === "tutor" && (
          <TutorTab
            project={project}
            space={space}
            materials={materials}
            growth={growth}
            onSwitchTab={handleTabChange}
            onTutorMessage={() => {
              refetchAnalytics?.();
            }}
          />
        )}

        {activeTab === "quiz" && (
          <QuizTab
            project={project}
            space={space}
            materials={materials}
            growth={growth}
            onSwitchTab={handleTabChange}
            onAssessmentStatusChange={setIsAssessmentActive}
            onQuizCompleted={() => {
              setIsAssessmentActive(false);
              refetchAnalytics?.();
              refetchGrowth?.();
            }}
          />
        )}

        {activeTab === "growth" && (
          <GrowthTab
            project={project}
            space={space}
            growth={growth}
            analytics={analytics}
            onSwitchTab={handleTabChange}
          />
        )}

        {activeTab === "analytics" && (
          <AnalyticsTab
            project={project}
            space={space}
            analytics={analytics}
            growth={growth}
            onSwitchTab={handleTabChange}
          />
        )}
      </div>
    </div>
  );
};
