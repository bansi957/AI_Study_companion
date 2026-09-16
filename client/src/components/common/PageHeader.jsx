import React from "react";

export const PageHeader = ({
  title,
  description,
  action,
  breadcrumbs,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80 mb-6 ${className}`}
    >
      <div>
        {breadcrumbs && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5 font-medium">
            {breadcrumbs}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-3">{action}</div>}
    </div>
  );
};
