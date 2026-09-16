import React from "react";
import { Link } from "react-router-dom";
import {
  Compass,
  FolderKanban,
  FolderPlus,
  Plus,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  Target,
  Clock,
  Sparkles,
  BookOpen,
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

  // Build a space lookup map for fast rendering
  const spaceMap = spaces.reduce((acc, space) => {
    acc[space._id] = space;
    return acc;
  }, {});

  const latestProject = projects[0] || null;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* 1. Greeting Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {getGreeting()}, {user?.name?.split(" ")[0] || "Learner"}
          </h1>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            Continue where you left off in your learning workspace.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/spaces/new">
            <Button variant="secondary" size="sm" icon={FolderPlus}>
              New Space
            </Button>
          </Link>
          <Link to="/projects/new">
            <Button variant="primary" size="sm" icon={Plus}>
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <ErrorState message="Failed to load dashboard data" onRetry={handleRetry} />
      ) : (
        <>
          {/* 2. Continue Learning (Large Featured Card) */}
          {latestProject ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-slate-900 border border-indigo-500/20 p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Continue Learning</span>
                </div>
                {latestProject.updatedAt && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Active {new Date(latestProject.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                    <span>
                      {spaceMap[latestProject.spaceId]?.icon || "📚"}{" "}
                      {spaceMap[latestProject.spaceId]?.name || "Space"}
                    </span>
                    <span>•</span>
                    <Badge
                      variant={
                        latestProject.status === "completed"
                          ? "success"
                          : "primary"
                      }
                      size="sm"
                    >
                      {latestProject.status}
                    </Badge>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    {latestProject.name}
                  </h2>
                  <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">
                    <strong className="text-slate-200">Goal:</strong>{" "}
                    {latestProject.learningGoal}
                  </p>
                </div>

                <div className="flex lg:justify-end">
                  <Link to={`/spaces/${latestProject.spaceId}`}>
                    <Button variant="primary" size="md" icon={ArrowRight}>
                      Resume Workspace
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No active learning journey yet"
              description="Create a Space and your first Project to start exploring materials with the AI Tutor."
              actionLabel="Create Your First Space"
              onAction={() => (window.location.href = "/spaces/new")}
            />
          )}

          {/* 3. Recent Projects */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Recent Projects
                </h3>
                <p className="text-xs text-slate-400">
                  Your active learning explorations
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

            {projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {projects.slice(0, 6).map((project) => {
                  const space = spaceMap[project.spaceId];
                  return (
                    <Card
                      key={project._id}
                      hover
                      className="flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                            <span>{space?.icon || "📁"}</span>
                            <span className="truncate max-w-[150px]">
                              {space?.name || "Space"}
                            </span>
                          </span>
                          <Badge variant="subtle" size="sm">
                            {project.status}
                          </Badge>
                        </div>

                        <div>
                          <CardTitle className="line-clamp-1">
                            {project.name}
                          </CardTitle>
                          <CardDescription className="line-clamp-2 mt-1">
                            {project.learningGoal}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {project.createdAt
                            ? new Date(project.createdAt).toLocaleDateString()
                            : "Recent"}
                        </span>
                        <Link
                          to={`/spaces/${project.spaceId}`}
                          className="font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          Open Project →
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* 4. Overall Progress, 5. Areas Requiring Attention, 6. Recommended Next Action */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
            {/* Overall Progress */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Overall Progress
                  </h4>
                  <p className="text-xs text-slate-400">Mastery overview</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center space-y-2">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Concept mastery metrics will calculate dynamically as you
                  interact with quizzes and assessments.
                </p>
                <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                  <div className="bg-indigo-500 h-2 rounded-full w-0 transition-all duration-500" />
                </div>
                <p className="text-[11px] text-slate-500 font-mono">0% Tracked</p>
              </div>
            </Card>

            {/* Areas Requiring Attention */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-950/80 border border-amber-700/50 flex items-center justify-center text-amber-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Areas for Revision
                  </h4>
                  <p className="text-xs text-slate-400">Weak concepts</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center space-y-1">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your learning patterns will appear here as you complete assessments.
                </p>
                <span className="inline-block text-[11px] text-slate-500 pt-1">
                  No mistakes recorded yet
                </span>
              </div>
            </Card>

            {/* Recommended Next Action */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-950/80 border border-violet-700/50 flex items-center justify-center text-violet-400">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Recommended Action
                  </h4>
                  <p className="text-xs text-slate-400">Next useful step</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center space-y-2">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {projects.length === 0
                    ? "Start by creating your first Space and Project."
                    : "Upload study materials to your project to start learning with the AI Tutor."}
                </p>
                <Link
                  to={projects.length === 0 ? "/spaces/new" : "/projects"}
                  className="inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  {projects.length === 0 ? "Get Started →" : "View Projects →"}
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
