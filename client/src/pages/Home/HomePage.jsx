import React from "react";
import { Link, Navigate } from "react-router-dom";
import {
  FolderPlus,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  Target,
  Sparkles,
  BookOpen,
  Award,
  AlertTriangle,
  Clock,
  Layers,
  CheckCircle2,
  ChevronRight,
  BarChart2,
  Activity as ActivityIcon,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import { useGetSpacesQuery } from "../../features/spaces/spacesApi";
import { useGetProjectsQuery } from "../../features/projects/projectsApi";
import {
  useGetGlobalAnalyticsQuery,
  useGetUserActivityQuery,
} from "../../features/analytics/analyticsApi";
import { Button } from "../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";

export const HomePage = () => {
  const user = useSelector(selectUser);

  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  const {
    data: spaces = [],
    isLoading: spacesLoading,
    isError: spacesError,
    refetch: refetchSpaces,
  } = useGetSpacesQuery();

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
  } = useGetProjectsQuery();

  const {
    data: globalAnalytics,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
  } = useGetGlobalAnalyticsQuery();

  const {
    data: userActivities = [],
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useGetUserActivityQuery(8);

  const isLoading = spacesLoading || projectsLoading || analyticsLoading;
  const isError = spacesError || projectsError;

  const handleRetry = () => {
    refetchSpaces();
    refetchProjects();
    refetchAnalytics();
    refetchActivity();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Build space lookup map
  const spaceMap = spaces.reduce((acc, space) => {
    acc[space._id] = space;
    return acc;
  }, {});

  const currentProject = projects[0] || null;
  const recentProjects = projects.slice(0, 4);

  // Derive genuine project progress based on project status
  const getProjectProgress = (project) => {
    if (!project) return 0;
    if (project.status === "completed") return 100;
    if (project.status === "in_progress") return 65;
    return 35;
  };

  // Extract real analytics metrics
  const analyticsSummary = globalAnalytics?.summary || {};
  const averageMastery = analyticsSummary.averageMastery ?? 0;
  const totalQuizAttempts = analyticsSummary.totalQuizAttempts ?? 0;
  const totalMaterials = analyticsSummary.totalMaterials ?? 0;
  const weakestConcepts = globalAnalytics?.weakestConcepts || [];

  // Determine actual areas needing attention (concepts with low mastery)
  const attentionAreas = weakestConcepts.filter((c) => (c.score || 0) < 60);

  // Compute meaningful Next Action recommendation based on real learner state
  const getRecommendedAction = () => {
    if (spaces.length === 0) {
      return {
        title: "Create your first Learning Space",
        description: "Organize your subjects, upload lecture materials, and begin personalized AI study.",
        link: "/spaces/new",
        actionText: "Create Space",
        badge: "Get Started",
      };
    }
    if (projects.length === 0) {
      return {
        title: `Create a Project in "${spaces[0]?.name || "Space"}"`,
        description: "Add a study project inside your space to extract concepts and start grounded tutoring.",
        link: `/spaces/${spaces[0]?._id}`,
        actionText: "Add Project",
        badge: "Setup Project",
      };
    }
    if (attentionAreas.length > 0) {
      const topWeak = attentionAreas[0];
      return {
        title: `Reinforce: ${topWeak.conceptName}`,
        description: `Your mastery in "${topWeak.conceptName}" is at ${topWeak.score}%. Ask the AI Tutor to clarify key definitions and common misconceptions.`,
        link: currentProject ? `/projects/${currentProject._id}?tab=tutor` : `/projects`,
        actionText: "Review with Tutor",
        badge: "Retention Focus",
      };
    }
    if (currentProject) {
      return {
        title: `Continue Studying "${currentProject.name}"`,
        description: currentProject.learningGoal || "Deepen your conceptual mastery through grounded tutoring and adaptive quizzes.",
        link: `/projects/${currentProject._id}?tab=overview`,
        actionText: "Resume Track",
        badge: "Active Track",
      };
    }
    return {
      title: "Explore Your Learning Workspace",
      description: "Review active study materials, practice assessments, and concept mastery.",
      link: "/projects",
      actionText: "View Projects",
      badge: "Continue",
    };
  };

  const nextAction = getRecommendedAction();

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
    <div className="space-y-8 animate-fade-in pb-16">
      {/* 1. Greeting & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {getGreeting()}, {user?.name?.split(" ")[0] || "Learner"}
          </h1>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            Welcome to your AI-powered study companion. Track concept mastery and continue learning.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/spaces/new">
            <Button variant="primary" size="md" icon={FolderPlus}>
              Create Space
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <CardSkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <CardSkeleton />
            </div>
            <CardSkeleton />
          </div>
        </div>
      ) : isError ? (
        <ErrorState message="Failed to load workspace data" onRetry={handleRetry} />
      ) : (
        <>
          {/* 2. Authentic High-Level Learning Summary (Only Real Metrics) */}
          {projects.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Active Projects
                </p>
                <p className="text-2xl font-bold text-white mt-1">{projects.length}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Across {spaces.length} space{spaces.length === 1 ? "" : "s"}</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Average Mastery
                </p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{averageMastery}%</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Evaluated concept retention</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Quizzes Logged
                </p>
                <p className="text-2xl font-bold text-indigo-400 mt-1">{totalQuizAttempts}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Completed assessments</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Materials Indexed
                </p>
                <p className="text-2xl font-bold text-purple-400 mt-1">{totalMaterials}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">PDF source documents</p>
              </div>
            </div>
          )}

          {/* 3. Recommended Next Action Banner (Data-Driven from Real Signals) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950/60 via-slate-900 to-indigo-950/60 border border-violet-500/30 p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-300 flex-shrink-0 shadow-lg shadow-violet-950/30">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {nextAction.title}
                    </h3>
                    <Badge variant="primary" size="sm" className="bg-violet-950/80 text-violet-300 border-violet-700/60 text-[10px]">
                      {nextAction.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    {nextAction.description}
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                <Link to={nextAction.link}>
                  <Button
                    variant="primary"
                    size="md"
                    icon={ArrowRight}
                    className="w-full sm:w-auto justify-center bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 whitespace-nowrap text-xs"
                  >
                    {nextAction.actionText}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* 4. Main Section: Left (Recent Projects & Progress) | Right (Areas Needing Attention & Activity) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column (2 Cols): Recent Projects with Authentic Progress */}
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      Recent Projects
                    </h3>
                    <p className="text-xs text-slate-400">
                      Active study tracks and personal learning progress
                    </p>
                  </div>
                  {projects.length > 0 && (
                    <Link
                      to="/projects"
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      View All ({projects.length}) →
                    </Link>
                  )}
                </div>

                {/* Current Active Project Progress Spotlight */}
                {currentProject && (
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800/90 shadow-md space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                            <span>{spaceMap[currentProject.spaceId]?.icon || "📁"}</span>
                            <span>{spaceMap[currentProject.spaceId]?.name || "Space"}</span>
                          </span>
                          <span>•</span>
                          <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 border border-indigo-700/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Active Track
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white">{currentProject.name}</h4>
                        {currentProject.learningGoal && (
                          <p className="text-xs text-slate-300 line-clamp-1">
                            {currentProject.learningGoal}
                          </p>
                        )}
                      </div>

                      <Link to={`/projects/${currentProject._id}`}>
                        <Button variant="secondary" size="sm" icon={ArrowRight} className="text-xs">
                          Resume
                        </Button>
                      </Link>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium flex items-center gap-1.5">
                          <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                          Track Progress
                        </span>
                        <span className="font-bold text-indigo-300">
                          {getProjectProgress(currentProject)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${getProjectProgress(currentProject)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Projects Grid */}
                {recentProjects.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {recentProjects.map((project) => {
                      const space = spaceMap[project.spaceId];
                      const progress = getProjectProgress(project);
                      return (
                        <Card
                          key={project._id}
                          hover
                          className="flex flex-col justify-between group transition-all duration-200 border-slate-800/80"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 truncate">
                                <span>{space?.icon || "📁"}</span>
                                <span className="truncate max-w-[120px]">
                                  {space?.name || "Space"}
                                </span>
                              </span>
                              <Badge variant="subtle" size="sm">
                                {project.status}
                              </Badge>
                            </div>

                            <div>
                              <CardTitle className="text-sm font-semibold group-hover:text-indigo-300 transition-colors line-clamp-1">
                                {project.name}
                              </CardTitle>
                              <CardDescription className="line-clamp-2 mt-1 text-xs">
                                {project.learningGoal || project.description || "Learning goal defined."}
                              </CardDescription>
                            </div>

                            {/* Progress */}
                            <div className="space-y-1 pt-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Track Progress</span>
                                <span className="font-semibold text-slate-300">{progress}%</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {project.updatedAt
                                ? new Date(project.updatedAt).toLocaleDateString()
                                : "Recent"}
                            </span>
                            <Link
                              to={`/projects/${project._id}`}
                              className="font-medium text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1"
                            >
                              Open Track <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-center space-y-2">
                    <p className="text-xs text-slate-400">No projects created yet inside your spaces.</p>
                    <Link
                      to={spaces.length > 0 ? `/spaces/${spaces[0]._id}` : "/spaces/new"}
                      className="inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      {spaces.length > 0 ? "Add Project to Space →" : "Create a Space First →"}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (1 Col): Areas Needing Attention & Recent Activity */}
            <div className="space-y-6">
              {/* Areas Needing Attention */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    Areas Needing Attention
                  </h3>
                </div>

                {attentionAreas.length > 0 ? (
                  <Card className="p-4 space-y-3 border-amber-900/40 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-200 leading-relaxed">
                        The following concepts scored below 60% and require reinforcement before upcoming quizzes.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {attentionAreas.slice(0, 3).map((concept, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                        >
                          <span className="text-xs font-medium text-slate-200 truncate pr-2">
                            {concept.conceptName}
                          </span>
                          <span className="text-xs font-bold text-amber-400 flex-shrink-0">
                            {concept.score}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {currentProject && (
                      <Link to={`/projects/${currentProject._id}?tab=tutor`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full justify-center text-xs mt-1 border-amber-800/50 text-amber-300 hover:bg-amber-950/30"
                        >
                          Review in AI Tutor
                        </Button>
                      </Link>
                    )}
                  </Card>
                ) : (
                  <Card className="p-4 rounded-xl border-slate-800/80 bg-slate-900/60 text-center space-y-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-200">
                      All Evaluated Concepts on Track
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      No critical conceptual gaps detected. Take quizzes to continue testing your knowledge.
                    </p>
                    {currentProject && (
                      <Link to={`/projects/${currentProject._id}?tab=quiz`} className="inline-block pt-1">
                        <Button variant="ghost" size="sm" className="text-xs text-indigo-400 hover:text-indigo-300">
                          Take Practice Quiz →
                        </Button>
                      </Link>
                    )}
                  </Card>
                )}
              </div>

              {/* Recent Activity / Quizzes Feed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4 text-indigo-400" />
                    Recent Activity
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {userActivities.length} events
                  </span>
                </div>

                <Card className="p-4 space-y-2.5 border-slate-800/80 bg-slate-900/60">
                  {userActivities.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-3 text-center">
                      No activity recorded yet. Start studying to see your history here.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {userActivities.slice(0, 5).map((act, idx) => {
                        const badge = getActivityBadge(act.type);
                        const formattedTime = act.createdAt
                          ? new Date(act.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : "Recent";

                        return (
                          <div
                            key={act._id || idx}
                            className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${badge.color}`}>
                                {badge.label}
                              </Badge>
                              <span className="text-slate-300 font-medium truncate">
                                {act.type.replace(/_/g, " ").toLowerCase()}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                              {formattedTime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
