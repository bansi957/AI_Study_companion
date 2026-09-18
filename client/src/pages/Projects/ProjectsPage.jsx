import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  ArrowRight,
  Trash2,
  BookOpen,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import {
  useGetProjectsQuery,
  useDeleteProjectMutation,
} from "../../features/projects/projectsApi";
import { useGetSpacesQuery } from "../../features/spaces/spacesApi";
import { PageHeader } from "../../components/common/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import toast from "react-hot-toast";

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const isAdmin = user?.role === "admin";

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
  } = useGetProjectsQuery();

  const { data: spaces = [], isLoading: spacesLoading } = useGetSpacesQuery();

  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation();

  const isLoading = projectsLoading || spacesLoading;
  const error = projectsError ? "Failed to load projects" : null;

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("all");

  // Delete Dialog State
  const [projectToDelete, setProjectToDelete] = useState(null);

  const spaceMap = useMemo(() => {
    return spaces.reduce((acc, sp) => {
      acc[sp._id] = sp;
      return acc;
    }, {});
  }, [spaces]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.learningGoal.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.description &&
          project.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSpace =
        selectedSpaceId === "all" || project.spaceId === selectedSpaceId;

      return matchesSearch && matchesSpace;
    });
  }, [projects, searchTerm, selectedSpaceId]);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete._id).unwrap();
      toast.success("Project deleted successfully");
      setProjectToDelete(null);
      // RTK Query auto-invalidates Projects LIST tag — no manual state update needed
    } catch (err) {
      toast.error(
        err?.customMessage || err?.data?.message || "Failed to delete project",
      );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="My Projects"
        description="Focused learning workspaces with customized goals and reference materials."
        action={
          !isAdmin ? (
            <Link to="/projects/new">
              <Button variant="primary" size="md" icon={Plus}>
                Create Project
              </Button>
            </Link>
          ) : null
        }
      />

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:flex-1">
          <Input
            placeholder="Search projects by title or learning goal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={Search}
          />
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-300 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="bg-transparent outline-none text-xs font-medium text-slate-200 cursor-pointer w-full"
            >
              <option value="all" className="bg-slate-900 text-slate-200">
                All Spaces ({spaces.length})
              </option>
              {spaces.map((sp) => (
                <option
                  key={sp._id}
                  value={sp._id}
                  className="bg-slate-900 text-slate-200"
                >
                  {sp.icon || "📁"} {sp.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetchProjects} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects created yet"
          description={
            isAdmin
              ? "No projects have been created on the platform yet."
              : "A Project is a dedicated learning track inside a Space. Create one to define goals and study materials."
          }
          actionLabel={!isAdmin ? "Create Your First Project" : undefined}
          onAction={!isAdmin ? () => navigate("/projects/new") : undefined}
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No projects match your filter"
          description="Try modifying your search keywords or choosing a different Space filter."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearchTerm("");
            setSelectedSpaceId("all");
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
            const space = spaceMap[project.spaceId];
            return (
              <Card
                key={project._id}
                hover
                className="flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 truncate max-w-[200px]">
                      <span>{space?.icon || "📁"}</span>
                      <span className="truncate">{space?.name || "Space"}</span>
                    </span>
                    <Badge
                      variant={
                        project.status === "completed" ? "success" : "primary"
                      }
                      size="sm"
                    >
                      {project.status}
                    </Badge>
                  </div>

                  <div>
                    <CardTitle className="text-base font-semibold group-hover:text-indigo-300 transition-colors">
                      {project.name}
                    </CardTitle>
                    {project.description && (
                      <CardDescription className="line-clamp-2 mt-1 text-xs">
                        {project.description}
                      </CardDescription>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-semibold block mb-0.5">
                      Goal:
                    </span>
                    <p className="text-slate-300 line-clamp-2 leading-relaxed">
                      {project.learningGoal}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/70 flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {project.updatedAt
                      ? new Date(project.updatedAt).toLocaleDateString()
                      : "Recent"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      title="Delete Project"
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      to={`/projects/${project._id}`}
                      className="font-medium text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1"
                    >
                      Open
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Project Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"? Your parent Space will remain safe.`}
        confirmLabel="Delete Project"
        isLoading={isDeleting}
      />
    </div>
  );
};
