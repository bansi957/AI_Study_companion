import React from "react";
import { Link, Navigate } from "react-router-dom";
import {
  FolderPlus,
  FolderClosed,
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
  Flame,
  BarChart2,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import { useGetSpacesQuery } from "../../features/spaces/spacesApi";
import { useGetProjectsQuery } from "../../features/projects/projectsApi";
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

  const isLoading = spacesLoading || projectsLoading;
  const isError = spacesError || projectsError;

  const handleRetry = () => {
    refetchSpaces();
    refetchProjects();
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

  // Identify latest space & current active project
  const latestSpace = spaces[0] || null;
  const latestSpaceProjects = latestSpace
    ? projects.filter((p) => p.spaceId === latestSpace._id)
    : [];
  const currentProject = projects[0] || null;
  const recentProjects = projects.slice(0, 4);

  // Helper to determine progress percentage for a project
  const getProjectProgress = (project) => {
    if (!project) return 0;
    if (project.status === "completed") return 100;
    if (project.status === "in_progress") return 65;
    return 30; // default active starting progress
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
            Welcome to your AI-powered study companion. Track your mastery and continue learning.
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
          {/* 2. Learning Mastery Section (Directly under Greetings) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-500/25 p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      Learning Mastery Overview
                      <Badge variant="primary" size="sm">
                        {projects.length > 0 ? "Level 2: Active Learner" : "Level 1: Explorer"}
                      </Badge>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                  <span>Knowledge Retention: <strong className="text-emerald-400 font-semibold">{projects.length > 0 ? "88%" : "Ready"}</strong></span>
                  <span>•</span>
                  <span>Active Focus: <strong className="text-slate-200">{latestSpace ? latestSpace.name : "New Topics"}</strong></span>
                </div>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 flex-shrink-0">
                <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Mastery</p>
                  <p className="text-base sm:text-lg font-bold text-indigo-400 mt-0.5">
                    {projects.length > 0 ? "65%" : "0%"}
                  </p>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Tracks</p>
                  <p className="text-base sm:text-lg font-bold text-white mt-0.5">
                    {projects.length}
                  </p>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Streak</p>
                  <p className="text-base sm:text-lg font-bold text-amber-400 mt-0.5 flex items-center justify-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    1d
                  </p>
                </div>
              </div>
            </div>

            {/* Mastery Progress Bar */}
            <div className="space-y-1.5 pt-4 mt-4 border-t border-slate-800/70">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Core Concept Mastery Progress</span>
                <span className="font-semibold text-slate-300">
                  {projects.length > 0 ? "65% Completed" : "Start your first project"}
                </span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400 h-2 rounded-full transition-all duration-700"
                  style={{ width: projects.length > 0 ? "65%" : "8%" }}
                />
              </div>
            </div>
          </div>

          {/* 3. Latest Space Card (Featured Hero with Open Tutor & Take Quiz buttons) */}
          {latestSpace ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-slate-900 border border-indigo-500/25 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span>Latest Active Space</span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">
                      {latestSpace.icon || "📁"}
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {latestSpace.name}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {latestSpaceProjects.length} {latestSpaceProjects.length === 1 ? "project" : "projects"} organized in this space
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed pt-1">
                    {latestSpace.description || "Continue your personalized learning journey with grounding study materials and AI assessments."}
                  </p>
                </div>

                {/* 2 Action Buttons: Open Tutor & Take Quiz */}
                <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
                  <Link
                    to={
                      latestSpaceProjects.length > 0
                        ? `/projects/${latestSpaceProjects[0]._id}?tab=tutor`
                        : `/spaces/${latestSpace._id}`
                    }
                  >
                    <Button
                      variant="primary"
                      size="md"
                      icon={Sparkles}
                      className="w-full justify-center shadow-lg shadow-indigo-600/30"
                    >
                      Open Tutor
                    </Button>
                  </Link>

                  <Link
                    to={
                      latestSpaceProjects.length > 0
                        ? `/projects/${latestSpaceProjects[0]._id}?tab=quiz`
                        : `/spaces/${latestSpace._id}`
                    }
                  >
                    <Button
                      variant="secondary"
                      size="md"
                      icon={Award}
                      className="w-full justify-center border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200"
                    >
                      Take Quiz
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No learning spaces created yet"
              description="Create your first Space to organize study projects, upload materials, and start learning with the AI Tutor."
              actionLabel="Create Your First Space"
              onAction={() => (window.location.href = "/spaces/new")}
            />
          )}

          {/* 4. Main Grid: Left (Recent Projects with Current Project Progress) | Right (Need Attention) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column: Recent Projects Section with Project Progress */}
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      Recent Projects
                    </h3>
                    <p className="text-xs text-slate-400">
                      Active learning tracks and ongoing study progress
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
                            Current Project
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

                    {/* Progress of Current Project */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium flex items-center gap-1.5">
                          <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                          Current Project Progress
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

                {/* Additional Recent Projects Grid */}
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

                            {/* Project Progress Bar */}
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
                      to={latestSpace ? `/spaces/${latestSpace._id}` : "/spaces/new"}
                      className="inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      {latestSpace ? "Add Project to Space →" : "Create a Space First →"}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Need Attention Div */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    Need Attention
                  </h3>
                  <p className="text-xs text-slate-400">
                    Revision alerts & concepts needing reinforcement
                  </p>
                </div>
              </div>

              <Card className="p-5 space-y-4 border-amber-900/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-700/40">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-200">
                      Concept Retention Review
                    </p>
                    <p className="text-[11px] text-amber-300/80 leading-relaxed">
                      Periodic reviews keep newly learned concepts fresh before upcoming quizzes.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-slate-200">
                        {latestSpace ? `${latestSpace.name} Core Topics` : "Foundational Topics"}
                      </p>
                      <p className="text-[11px] text-slate-500">Scheduled for revision</p>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md">
                      Review
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-slate-200">Practice Assessments</p>
                      <p className="text-[11px] text-slate-500">Adaptive question bank</p>
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-md">
                      Ready
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <Link
                    to={latestSpace ? `/spaces/${latestSpace._id}?tab=quiz` : "/spaces"}
                    className="block"
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Award}
                      className="w-full justify-center text-xs border-amber-900/50 text-amber-200 hover:bg-amber-950/40"
                    >
                      Start Revision Quiz
                    </Button>
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          {/* 5. Footer: AI Recommendation Div */}
          <div className="pt-2">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950/50 via-slate-900 to-indigo-950/50 border border-violet-500/25 p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-violet-900/60 border border-violet-500/40 flex items-center justify-center text-violet-300 flex-shrink-0 shadow-lg shadow-violet-900/20">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        AI Recommendation
                      </h4>
                      <Badge variant="primary" size="sm">
                        Smart Next Step
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {latestSpace
                        ? `Based on your recent materials in "${latestSpace.name}", start a focused 5-minute AI tutoring session to lock in key terminology.`
                        : "Create your first learning space and upload documents to receive personalized AI recommendations and adaptive quizzes."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <Link
                    to={latestSpace ? `/spaces/${latestSpace._id}?tab=tutor` : "/spaces/new"}
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ArrowRight}
                      className="bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30 whitespace-nowrap"
                    >
                      {latestSpace ? "Launch AI Session" : "Get Started"}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
