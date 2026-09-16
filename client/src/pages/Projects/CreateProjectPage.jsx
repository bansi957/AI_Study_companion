import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  FolderKanban,
  ArrowLeft,
  Sparkles,
  Layers,
  Target,
  CheckCircle2,
  FolderPlus,
} from "lucide-react";
import { useGetSpacesQuery } from "../../features/spaces/spacesApi";
import { useCreateProjectMutation } from "../../features/projects/projectsApi";
import { PageHeader } from "../../components/common/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Select } from "../../components/ui/Select";
import { Card, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import toast from "react-hot-toast";

export const CreateProjectPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSpaceId = searchParams.get("spaceId") || "";

  const { data: spaces = [], isLoading: isSpacesLoading } = useGetSpacesQuery();
  const [createProject, { isLoading }] = useCreateProjectMutation();

  const [formData, setFormData] = useState({
    spaceId: preselectedSpaceId,
    name: "",
    description: "",
    learningGoal: "",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  // When spaces load, auto-select the first if no preselection
  useEffect(() => {
    if (!isSpacesLoading && spaces.length > 0 && !formData.spaceId) {
      setFormData((prev) => ({ ...prev, spaceId: spaces[0]._id }));
    }
  }, [isSpacesLoading, spaces]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.spaceId) {
      newErrors.spaceId = "Please select a parent Space";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Project name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Project name must be at least 2 characters";
    } else if (formData.name.trim().length > 150) {
      newErrors.name = "Project name cannot exceed 150 characters";
    }

    if (!formData.learningGoal.trim()) {
      newErrors.learningGoal = "Learning goal is required";
    } else if (formData.learningGoal.trim().length < 2) {
      newErrors.learningGoal = "Learning goal must be at least 2 characters";
    } else if (formData.learningGoal.trim().length > 1000) {
      newErrors.learningGoal = "Learning goal cannot exceed 1000 characters";
    }

    if (formData.description && formData.description.trim().length > 1000) {
      newErrors.description = "Description cannot exceed 1000 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) return;

    try {
      await createProject({
        spaceId: formData.spaceId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        learningGoal: formData.learningGoal.trim(),
      }).unwrap();

      toast.success("Project created successfully!");
      // RTK Query auto-invalidates Projects LIST — SpaceDetailPage refetches automatically
      navigate(`/spaces/${formData.spaceId}`);
    } catch (err) {
      const msg =
        err?.customMessage ||
        err?.data?.message ||
        "Failed to create project. Please verify the space selection.";
      setServerError(msg);
      toast.error(msg);
    }
  };

  const selectedSpace = spaces.find((s) => s._id === formData.spaceId);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center gap-2 mb-2">
        <Link
          to={formData.spaceId ? `/spaces/${formData.spaceId}` : "/projects"}
          className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to {selectedSpace?.name || "Projects"}
        </Link>
      </div>

      <PageHeader
        title="Create Learning Project"
        description="Define a focused topic, set an explicit learning goal, and establish an active learning journey."
      />

      {/* No Spaces Alert */}
      {!isSpacesLoading && spaces.length === 0 && (
        <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-amber-300">
              No Learning Spaces Found
            </h4>
            <p className="text-xs text-amber-200/80 mt-1">
              Every project belongs to an overarching Space. You must create a
              Space first before adding a project.
            </p>
          </div>
          <Link to="/spaces/new">
            <Button variant="primary" size="sm" icon={FolderPlus}>
              Create a Space First
            </Button>
          </Link>
        </div>
      )}

      {/* Two-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <div className="lg:col-span-7">
          <Card className="p-6 sm:p-8 border-slate-800">
            {serverError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <Select
                label="Parent Space"
                name="spaceId"
                value={formData.spaceId}
                onChange={handleChange}
                error={errors.spaceId}
                disabled={isSpacesLoading || isLoading || spaces.length === 0}
                options={spaces.map((s) => ({
                  value: s._id,
                  label: `${s.icon || "📁"} ${s.name}`,
                }))}
                placeholder={
                  isSpacesLoading ? "Loading spaces..." : "Choose a space..."
                }
              />

              <Input
                label="Project Name"
                name="name"
                placeholder="e.g. Neural Network Fundamentals"
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
                disabled={isLoading}
                autoFocus
              />

              <Textarea
                label="Learning Goal"
                name="learningGoal"
                placeholder="e.g. Understand forward propagation, backpropagation, and loss calculation"
                rows={3}
                value={formData.learningGoal}
                onChange={handleChange}
                error={errors.learningGoal}
                disabled={isLoading}
                helperText="Be specific. The AI Tutor uses this goal to frame its explanations and quiz difficulty."
              />

              <Textarea
                label="Description (Optional)"
                name="description"
                placeholder="Additional notes, scope, or references"
                rows={3}
                value={formData.description}
                onChange={handleChange}
                error={errors.description}
                disabled={isLoading}
              />

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800/80">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() =>
                    navigate(
                      formData.spaceId
                        ? `/spaces/${formData.spaceId}`
                        : "/projects"
                    )
                  }
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                  disabled={spaces.length === 0}
                  icon={FolderKanban}
                >
                  Create Project
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Live Preview Column (Desktop) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Live Project Preview</span>
          </div>

          <Card className="p-6 border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/20 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedSpace?.icon || "📁"}</span>
                <span className="text-xs font-semibold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-700/40">
                  {selectedSpace?.name || "Unassigned Space"}
                </span>
              </div>
              <Badge variant="subtle" size="sm">
                active
              </Badge>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">
                {formData.name.trim() || "Project Title"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {formData.description.trim() ||
                  "Project overview description will appear here."}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
              <span className="text-indigo-400 font-semibold flex items-center gap-1.5 mb-1">
                <Target className="w-3.5 h-3.5" />
                Target Goal
              </span>
              <p className="text-slate-300 leading-relaxed italic">
                {formData.learningGoal.trim() ||
                  "Describe what you aim to master in this project..."}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
              <span>Ready for materials upload</span>
              <span className="text-indigo-400 font-medium">Step 1 of 5</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
