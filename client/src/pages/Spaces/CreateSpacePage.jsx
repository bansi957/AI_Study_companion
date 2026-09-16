import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FolderPlus, ArrowLeft, Sparkles } from "lucide-react";
import { useCreateSpaceMutation } from "../../features/spaces/spacesApi";
import { PageHeader } from "../../components/common/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Card } from "../../components/ui/Card";
import toast from "react-hot-toast";

const PRESET_ICONS = ["📚", "🤖", "⚡", "📐", "🔬", "💻", "🧠", "🎯", "🌐", "🚀", "📊", "🎨"];

export const CreateSpacePage = () => {
  const navigate = useNavigate();
  const [createSpace, { isLoading }] = useCreateSpaceMutation();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "📚",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleIconSelect = (icon) => {
    setFormData((prev) => ({ ...prev, icon }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Space name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Space name must be at least 2 characters";
    } else if (formData.name.trim().length > 100) {
      newErrors.name = "Space name cannot exceed 100 characters";
    }

    if (formData.description && formData.description.trim().length > 500) {
      newErrors.description = "Description cannot exceed 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) return;

    try {
      const newSpace = await createSpace({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        icon: formData.icon,
      }).unwrap();

      toast.success("Space created successfully!");
      // newSpace is the transformed space object from spacesApi.createSpace
      if (newSpace?._id) {
        navigate(`/spaces/${newSpace._id}`);
      } else {
        navigate("/spaces");
      }
    } catch (err) {
      const msg =
        err?.customMessage ||
        err?.data?.message ||
        "Failed to create space. Please check your connection.";
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-12">
      <div className="flex items-center gap-2 mb-2">
        <Link
          to="/spaces"
          className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Spaces
        </Link>
      </div>

      <PageHeader
        title="Create Learning Space"
        description="A Space groups projects, study materials, and assessments under one overarching discipline."
      />

      <Card className="p-6 sm:p-8 border-slate-800">
        {serverError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Icon Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 tracking-wide uppercase">
              Space Icon
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => handleIconSelect(icon)}
                  className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    formData.icon === icon
                      ? "bg-indigo-600/30 border-2 border-indigo-500 scale-105 shadow-md shadow-indigo-600/20"
                      : "bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Space Name"
            name="name"
            placeholder="e.g. Machine Learning, Cloud Architecture"
            value={formData.name}
            onChange={handleChange}
            error={errors.name}
            disabled={isLoading}
            autoFocus
          />

          <Textarea
            label="Description (Optional)"
            name="description"
            placeholder="What area of knowledge does this space cover?"
            rows={4}
            value={formData.description}
            onChange={handleChange}
            error={errors.description}
            disabled={isLoading}
            helperText={`${formData.description.length}/500 characters`}
          />

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800/80">
            <Button
              variant="ghost"
              size="md"
              onClick={() => navigate("/spaces")}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              icon={FolderPlus}
            >
              Create Space
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
