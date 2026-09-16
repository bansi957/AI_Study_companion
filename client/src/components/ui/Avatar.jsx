import React from "react";

export const Avatar = ({ name = "", size = "md", className = "" }) => {
  const getInitials = (str) => {
    if (!str) return "U";
    const parts = str.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.substring(0, 2).toUpperCase();
  };

  const sizes = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-base font-semibold",
    xl: "w-14 h-14 text-lg font-semibold",
  };

  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-medium shadow-sm select-none ${
        sizes[size] || sizes.md
      } ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
