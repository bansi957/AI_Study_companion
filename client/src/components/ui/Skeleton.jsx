import React from "react";

export const Skeleton = ({ className = "" }) => {
  return (
    <div
      className={`animate-pulse bg-slate-800/80 rounded-xl ${className}`}
    />
  );
};

export const CardSkeleton = () => {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-16 h-5 rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="w-3/4 h-5 rounded-md" />
        <Skeleton className="w-full h-4 rounded-md" />
        <Skeleton className="w-2/3 h-4 rounded-md" />
      </div>
      <div className="pt-3 flex items-center justify-between border-t border-slate-800/50">
        <Skeleton className="w-20 h-4 rounded-md" />
        <Skeleton className="w-16 h-8 rounded-lg" />
      </div>
    </div>
  );
};
