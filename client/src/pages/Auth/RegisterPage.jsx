import React from "react";
import { Navigate } from "react-router-dom";

/**
 * With Google Authentication via Firebase, Sign In and Sign Up are unified.
 * Any navigation to /register smoothly redirects to /login.
 */
export const RegisterPage = () => {
  return <Navigate to="/login" replace />;
};
