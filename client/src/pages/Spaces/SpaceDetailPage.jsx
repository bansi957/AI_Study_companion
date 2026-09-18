import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  FolderKanban,
  Calendar,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import {
  useGetSpaceByIdQuery,
  useUpdateSpaceMutation,
  useDeleteSpaceMutation,
} from "../../features/spaces/spacesApi";
import { useGetProjectsQuery } from "../../features/projects/projectsApi";
import { Button } from "../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import toast from "react-hot-toast";

const PRESET_ICONS = ["📚", "🤖", "⚡", "📐", "🔬", "💻", "🧠", "🎯", "🌐", "🚀", "📊", "🎨"];

export const SpaceDetailPage = () => {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const isAdmin = user?.role === "admin";

  // RTK Query — fetch space + projects in parallel
  const {
    data: space,
    isLoading: spaceLoading,
    isError: spaceError,
    refetch: refetchSpace,
  } = useGetSpaceByIdQuery(spaceId, { skip: !spaceId });

  const {
    data: projects = [],
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useGetProjectsQuery({ spaceId }, { skip: !spaceId });

  const [updateSpace, { isLoading: isUpdating }] = useUpdateSpaceMutation();
  const [deleteSpace, { isLoading: isDeleting }] = useDeleteSpaceMutation();

  const isLoading = spaceLoading || projectsLoading;

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: "", description: "", icon: "📚" });

  // Delete Dialog State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Sync edit form when space data loads
  useEffect(() => {
    if (space) {
      setEditData({
        name: space.name || "",
        description: space.description || "",
        icon: space.icon || "📚",
      });
    }
  }, [space]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editData.name.trim()) {
      toast.error("Space name is required");
      return;
    }

    try {
      await updateSpace({
        id: spaceId,
        name: editData.name.trim(),
        description: editData.description.trim() || undefined,
        icon: editData.icon,
      }).unwrap();
      setIsEditOpen(false);
      toast.success("Space updated successfully");
      // Cache tagged with { type: "Space", id: spaceId } is invalidated automatically
    } catch (err) {
      toast.error(err?.customMessage || err?.data?.message || "Failed to update space");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSpace(spaceId).unwrap();
      toast.success("Space deleted successfully");
      navigate("/spaces");
    } catch (err) {
      toast.error(err?.customMessage || err?.data?.message || "Failed to delete space");
    }
  };

  const handleRetry = () => {
    refetchSpace();
    refetchProjects();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-32 bg-slate-900/60 rounded-3xl animate-pulse border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (spaceError || !space) {
    return (
      <ErrorState
        title="Space Not Found"
        message={
          spaceError
            ? "Failed to load space details."
            : "This learning space does not exist or you do not have permission to view it."
        }
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          to="/spaces"
          className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Spaces
        </Link>
      </div>

      {/* Space Overview Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-3xl shadow-inner flex-shrink-0">
            {space.icon || "📚"}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {space.name}
              </h1>
              <Badge variant="primary" size="sm">
                {projects.length} {projects.length === 1 ? "Project" : "Projects"}
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed max-w-2xl">
              {space.description || "No description provided for this space."}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Created {new Date(space.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Space Actions */}
        <div className="flex items-center gap-2.5 flex-shrink-0 self-start md:self-center">
          <Button
            variant="secondary"
            size="sm"
            icon={Edit2}
            onClick={() => setIsEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
            onClick={() => setIsDeleteOpen(true)}
          >
            Delete
          </Button>
          <Link to={`/projects/new?spaceId=${space._id}`}>
            <Button variant="primary" size="sm" icon={Plus}>
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Projects in this Space */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Projects inside {space.name}
            </h2>
            <p className="text-xs text-slate-400">
              Targeted study paths and knowledge materials
            </p>
          </div>
          
        </div>

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description={
              isAdmin
                ? "No projects have been created in this space yet."
                : "Create a focused learning journey inside this space with specific learning goals."
            }
            actionLabel={!isAdmin ? "Create Project" : undefined}
            onAction={!isAdmin ? () => navigate(`/projects/new?spaceId=${space._id}`) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card
                key={project._id}
                hover
                className="flex flex-col justify-between"
                onClick={()=>navigate(`/projects/${project._id}`)}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        project.status === "completed"
                          ? "success"
                          : "primary"
                      }
                      size="sm"
                    >
                      {project.status}
                    </Badge>
                    {project.updatedAt && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div>
                    <CardTitle className="text-base font-semibold text-slate-100">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {project.description || "No project overview provided."}
                    </CardDescription>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300">
                    <span className="text-slate-400 font-semibold block mb-0.5">
                      Goal:
                    </span>
                    <p className="line-clamp-2">{project.learningGoal}</p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/70 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Learning Path</span>
                  <Link
                    to={`/projects/${project._id}`}
                    className="font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    Open Workspace
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Space Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Learning Space"
        description="Update your space information and icon."
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase">
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setEditData((prev) => ({ ...prev, icon }))}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                    editData.icon === icon
                      ? "bg-indigo-600/30 border-2 border-indigo-500 shadow"
                      : "bg-slate-900 border border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Space Name"
            value={editData.name}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Space Name"
            disabled={isUpdating}
          />

          <Textarea
            label="Description"
            value={editData.description}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Space Description"
            rows={3}
            disabled={isUpdating}
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isUpdating}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Space Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Learning Space"
        message={`Are you sure you want to delete "${space.name}"? This action is permanent.`}
        confirmLabel="Delete Space"
        isLoading={isDeleting}
      />
    </div>
  );
};
