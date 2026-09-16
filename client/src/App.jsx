import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import {
  selectIsAuthenticated,
  selectIsInitializing,
  selectToken,
  setUser,
  clearCredentials,
  setInitializingDone,
} from "./features/auth/authSlice";
import { useLazyGetMeQuery } from "./features/auth/authApi";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";

// Pages
import { LandingPage } from "./pages/Landing/LandingPage";
import { LoginPage } from "./pages/Auth/LoginPage";
import { RegisterPage } from "./pages/Auth/RegisterPage";
import { HomePage } from "./pages/Home/HomePage";
import { SpacesPage } from "./pages/Spaces/SpacesPage";
import { CreateSpacePage } from "./pages/Spaces/CreateSpacePage";
import { SpaceDetailPage } from "./pages/Spaces/SpaceDetailPage";
import { ProjectsPage } from "./pages/Projects/ProjectsPage";
import { CreateProjectPage } from "./pages/Projects/CreateProjectPage";

/**
 * AppInitializer — fires once on startup when a token is already in the store.
 * Calls GET /api/auth/me to verify the token and get a fresh user object.
 * Sets isInitializing = false when done (success or failure).
 */
const AppInitializer = () => {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const [triggerGetMe] = useLazyGetMeQuery();

  useEffect(() => {
    if (!token) {
      dispatch(setInitializingDone());
      return;
    }

    triggerGetMe()
      .unwrap()
      .then((data) => {
        const user = data?.data?.user ?? data?.user ?? null;
        if (user) {
          dispatch(setUser(user));
        } else {
          dispatch(clearCredentials());
        }
      })
      .catch(() => {
        dispatch(clearCredentials());
      });
  }, []); // intentionally empty — run once on mount only

  return null;
};

const RootRoute = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isInitializing = useSelector(selectIsInitializing);
  if (isInitializing) return null;
  return isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />;
};

const AuthRedirectRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isInitializing = useSelector(selectIsInitializing);
  if (isInitializing) return null;
  return isAuthenticated ? <Navigate to="/home" replace /> : children;
};

function App() {
  return (
    <BrowserRouter>
      <AppInitializer />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/login"
          element={
            <AuthRedirectRoute>
              <LoginPage />
            </AuthRedirectRoute>
          }
        />
        <Route
          path="/register"
          element={
            <AuthRedirectRoute>
              <RegisterPage />
            </AuthRedirectRoute>
          }
        />

        {/* Protected Application Routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/spaces" element={<SpacesPage />} />
          <Route path="/spaces/new" element={<CreateSpacePage />} />
          <Route path="/spaces/:spaceId" element={<SpaceDetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<CreateProjectPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid #334155",
            borderRadius: "0.75rem",
            fontSize: "0.875rem",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
          },
        }}
      />
    </BrowserRouter>
  );
}

export default App;
