import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  selectIsAuthenticated,
  selectIsInitializing,
  selectUser,
} from "../../features/auth/authSlice";
import { Loader2 } from "lucide-react";

export const LearnerOnlyRoute = ({ children, redirectTo = "/spaces" }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isInitializing = useSelector(selectIsInitializing);
  const user = useSelector(selectUser);
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="h-screen w-full bg-[#0b0f19] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role === "admin") {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};
