import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export const ErrorState = ({
  title = "Something went wrong",
  message = "Failed to load data. Please try again.",
  onRetry,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 border border-rose-950/40 rounded-3xl bg-rose-950/10 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-900/40 border border-rose-700/40 flex items-center justify-center text-rose-400 mb-4">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-5 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="secondary"
          size="sm"
          icon={RefreshCw}
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
