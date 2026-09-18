import React, { useState, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Eye,
  X,
  FileCheck,
} from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardTitle, CardDescription } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import {
  useUploadMaterialMutation,
  useDeleteMaterialMutation,
  useGetMaterialContentQuery,
} from "../../../../features/materials/materialsApi";
import {
  joinProjectRoom,
  leaveProjectRoom,
  subscribeToMaterialStatus,
} from "../../../../services/socket";
import toast from "react-hot-toast";

export const MaterialsTab = ({
  project,
  projectId: propProjectId,
  space,
  materials = [],
  refetchMaterials,
  onRefreshMaterials,
  isMaterialsLoading,
  onSwitchTab,
}) => {
  const projectId = propProjectId || project?._id;
  const handleRefresh = refetchMaterials || onRefreshMaterials;
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [liveUpdates, setLiveUpdates] = useState({});
  const fileInputRef = useRef(null);

  // Connect to Socket.io for real-time document processing updates
  React.useEffect(() => {
    if (!projectId) return;

    joinProjectRoom(projectId);

    const unsubscribe = subscribeToMaterialStatus((data) => {
      // Only process updates for this project
      if (data.projectId && String(data.projectId) !== String(projectId)) return;

      setLiveUpdates((prev) => ({
        ...prev,
        [data.materialId]: {
          status: data.status,
          stage: data.stage,
          pageCount: data.pageCount,
          error: data.error,
        },
      }));

      // If document completed or failed, refresh backend data
      if (data.status === "READY" || data.status === "FAILED") {
        handleRefresh?.();
        if (data.status === "READY") {
          toast.success(`"${data.originalName || "Document"}" is processed & ready for tutoring!`, {
            id: `mat-ready-${data.materialId}`,
          });
        }
      }
    });

    return () => {
      leaveProjectRoom(projectId);
      unsubscribe();
    };
  }, [projectId]);

  const [uploadMaterial, { isLoading: isUploading }] = useUploadMaterialMutation();
  const [deleteMaterial, { isLoading: isDeleting }] = useDeleteMaterialMutation();

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF document (.pdf)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File exceeds the 10 MB maximum limit");
      return;
    }

    setSelectedFile(file);

    try {
      toast.loading("Uploading...", { id: "upload-toast" });
      await uploadMaterial({ file, projectId }).unwrap();
      toast.success("PDF uploaded! Processing started.", { id: "upload-toast" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      handleRefresh?.();
    } catch (err) {
      toast.error(err?.data?.message || err?.customMessage || "Failed to upload PDF", {
        id: "upload-toast",
      });
      setSelectedFile(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      await deleteMaterial({ id }).unwrap();
      toast.success("Material deleted successfully");
      handleRefresh?.();
    } catch (err) {
      toast.error(err?.data?.message || err?.customMessage || "Failed to delete material");
    }
  };

  const getStatusBadge = (status, stage) => {
    switch (status) {
      case "READY":
        return (
          <Badge variant="success" size="sm" className="flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Ready
          </Badge>
        );
      case "PROCESSING":
        return (
          <Badge
            variant="primary"
            size="sm"
            className="flex items-center gap-1 bg-indigo-950/80 text-indigo-300 border-indigo-500/50 animate-pulse"
          >
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            Processing
          </Badge>
        );
      case "QUEUED":
        return (
          <Badge
            variant="subtle"
            size="sm"
            className="flex items-center gap-1 bg-slate-800 text-amber-300 border-slate-700"
          >
            <Clock className="w-2.5 h-2.5 animate-pulse text-amber-400" />
            Queued
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="danger" size="sm" className="flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="subtle" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* 1. Drag & Drop PDF Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? "border-indigo-400 bg-indigo-950/30 scale-[1.01]"
            : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400 mx-auto shadow-xl shadow-indigo-950/50">
            {isUploading ? (
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {isUploading ? "Uploading..." : "Upload Learning Material"}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {isUploading
                ? "Please wait while your document is being uploaded..."
                : "Drag & drop your PDF file here, or click to browse"}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500 pt-1 font-mono">
            <span>Max 10 MB</span>
            <span>•</span>
            <span>PDF format only</span>
            <span>•</span>
            <span>Auto-indexed</span>
          </div>
        </div>
      </div>

      {/* 2. Materials List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              Uploaded Materials ({materials.length})
            </h3>
            <p className="text-xs text-slate-400">
              Documents parsed and vectorized for AI tutoring
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={handleRefresh}
            disabled={isMaterialsLoading}
            className="text-xs text-slate-400 hover:text-white"
          >
            Refresh
          </Button>
        </div>

        {materials.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No documents in this project yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload textbook chapters, research papers, or study notes above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {materials.map((mat) => {
              const live = liveUpdates[mat._id || mat.id];
              const currentStatus = live?.status || mat.status;
              const currentStage = live?.stage;
              const currentPageCount = live?.pageCount || mat.pageCount || 0;
              const isQueued = currentStatus === "QUEUED";
              const isProcessing = currentStatus === "PROCESSING";

              return (
                <div
                  key={mat._id || mat.id}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition-all duration-150"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                          {mat.originalName || mat.filename}
                        </p>
                        {getStatusBadge(currentStatus, currentStage)}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>{formatFileSize(mat.fileSize)}</span>
                        <span>•</span>
                        <span>
                          {currentPageCount ? `${currentPageCount} pages` : "0 pages"}
                        </span>
                        <span>•</span>
                        <span>
                          {mat.createdAt ? new Date(mat.createdAt).toLocaleDateString() : "Recent"}
                        </span>
                        {currentStage && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-400 font-medium animate-pulse">{currentStage}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status Progress */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                    {isQueued && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-300 font-medium bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-800/50">
                        <Clock className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                        Queued in pipeline
                      </span>
                    )}

                    {isProcessing && (
                      <span className="flex items-center gap-1.5 text-xs text-indigo-300 font-medium bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-700/60">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        {currentStage || "Processing..."}
                      </span>
                    )}

                    {currentStatus === "READY" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => setPreviewMaterial(mat)}
                        className="text-slate-400 hover:text-white p-2 text-xs"
                        title="Inspect Extracted Content"
                      >
                        Inspect
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(mat._id || mat.id, mat.originalName || mat.filename)}
                      className="text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 p-2 text-xs"
                      title="Delete Material"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Extracted Content Inspection Modal */}
      {previewMaterial && (
        <ContentModal
          material={previewMaterial}
          onClose={() => setPreviewMaterial(null)}
        />
      )}
    </div>
  );
};

const ContentModal = ({ material, onClose }) => {
  const { data: contentData, isLoading } = useGetMaterialContentQuery(
    material._id || material.id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-white truncate">
              {material.originalName || material.filename}
            </h4>
            <p className="text-xs text-slate-400">Extracted Document Structure & Segments</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {isLoading ? (
            <p className="text-slate-400 animate-pulse text-center py-8">Loading extracted segments...</p>
          ) : !contentData?.segments || contentData.segments.length === 0 ? (
            <p className="text-slate-500 italic text-center py-8">No extracted segments found.</p>
          ) : (
            contentData.segments.map((seg, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                  <span className="uppercase text-indigo-400">{seg.segmentType || "paragraph"}</span>
                  <span>Page {seg.pageNumber || 1}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{seg.text}</p>
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
