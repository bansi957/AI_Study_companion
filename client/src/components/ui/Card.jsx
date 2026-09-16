import React from "react";

export const Card = ({
  children,
  className = "",
  hover = false,
  onClick,
  ...props
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900/70 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5 text-slate-100 transition-all duration-200 shadow-sm
        ${
          hover
            ? "hover:border-slate-700 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 cursor-pointer"
            : ""
        }
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = "" }) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

export const CardTitle = ({ children, className = "" }) => (
  <h3 className={`text-base font-semibold text-slate-100 ${className}`}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = "" }) => (
  <p className={`text-sm text-slate-400 mt-1 leading-relaxed ${className}`}>
    {children}
  </p>
);

export const CardContent = ({ children, className = "" }) => (
  <div className={className}>{children}</div>
);

export const CardFooter = ({ children, className = "" }) => (
  <div className={`mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between ${className}`}>
    {children}
  </div>
);
