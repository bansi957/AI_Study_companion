import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { FolderPlus, FolderClosed, Calendar, Layers, ArrowRight } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import { useGetSpacesQuery } from "../../features/spaces/spacesApi";
import { useGetProjectsQuery } from "../../features/projects/projectsApi";
import { PageHeader } from "../../components/common/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";

export const SpacesPage = () => {
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const isAdmin = user?.role === "admin";

  const {
    data: spaces = [],
    isLoading: spacesLoading,
    isError: spacesError,
    refetch: refetchSpaces,
  } = useGetSpacesQuery();

  const {
    data: projects = [],
    isLoading: projectsLoading,
  } = useGetProjectsQuery();

  const isLoading = spacesLoading || projectsLoading;
  const error = spacesError ? "Failed to load spaces" : null;

  // Count projects per space
  const projectCountMap = projects.reduce((acc, project) => {
    acc[project.spaceId] = (acc[project.spaceId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="Learning Spaces"
        description="Organize your learning by broad areas such as skills, certifications, or professional goals."
        action={
          !isAdmin ? (
            <Link to="/spaces/new">
              <Button variant="primary" size="md" icon={FolderPlus}>
                Create Space
              </Button>
            </Link>
          ) : null
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetchSpaces} />
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={FolderClosed}
          title="No Learning Spaces yet"
          description={
            isAdmin
              ? "No spaces have been created on the platform yet."
              : "A Space represents a broad learning area (e.g. Machine Learning, Cloud Architecture). Create one to begin organizing your projects."
          }
          actionLabel={!isAdmin ? "Create Your First Space" : undefined}
          onAction={!isAdmin ? () => navigate("/spaces/new") : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {spaces.map((space) => {
            const projectCount = projectCountMap[space._id] || 0;
            return (
              <Card
                key={space._id}
                hover
                onClick={() => navigate(`/spaces/${space._id}`)}
                className="flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform duration-200">
                      {space.icon || "📚"}
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-indigo-400" />
                      {projectCount} {projectCount === 1 ? "Project" : "Projects"}
                    </span>
                  </div>

                  <div>
                    <CardTitle className="text-base group-hover:text-indigo-300 transition-colors">
                      {space.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-3 mt-1 text-xs">
                      {space.description || "No description provided."}
                    </CardDescription>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/70 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {space.createdAt
                        ? new Date(space.createdAt).toLocaleDateString()
                        : "Recent"}
                    </span>
                  </div>
                  <span className="font-medium text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Open Space
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
