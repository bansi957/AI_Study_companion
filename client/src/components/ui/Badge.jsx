import React from "react";

export const Badge = ({
  children,
  variant = "default",
  size = "md",
  className = "",
}) => {
  const variants = {
    default: "bg-slate-800 text-slate-300 border-slate-700/60",
    primary: "bg-indigo-950/80 text-indigo-300 border-indigo-700/50",
    success: "bg-emerald-950/80 text-emerald-300 border-emerald-700/50",
    warning: "bg-amber-950/80 text-amber-300 border-amber-700/50",
    danger: "bg-rose-950/80 text-rose-300 border-rose-700/50",
    subtle: "bg-slate-800/40 text-slate-400 border-slate-700/30",
  };

  const sizes = {
    sm: "text-[11px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-lg border select-none ${variants[variant] || variants.default} ${sizes[size] || sizes.md} ${className}`}
    >
      {children}
    </span>
  );
};
