import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import {
  selectIsAuthenticated,
  selectIsInitializing,
  selectToken,
  selectUser,
  setUser,
  clearCredentials,
  setInitializingDone,
} from "./features/auth/authSlice";
import { useLazyGetMeQuery, useGoogleLoginMutation } from "./features/auth/authApi";
import { checkRedirectResult } from "./services/firebase";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { AdminRoute } from "./components/common/AdminRoute";
import { LearnerOnlyRoute } from "./components/common/LearnerOnlyRoute";
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
import { ProjectWorkspacePage } from "./pages/Projects/ProjectWorkspacePage";
import { AdminDashboardPage } from "./pages/Admin/AdminDashboardPage";

/**
 * AppInitializer — fires once on startup when a token is already in the store.
 * Also checks if returning from a Google redirect auth flow.
 * Calls GET /api/auth/me to verify the token and get a fresh user object.
 * Sets isInitializing = false when done (success or failure).
 */
const AppInitializer = () => {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const [triggerGetMe] = useLazyGetMeQuery();
  const [triggerGoogleLogin] = useGoogleLoginMutation();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 1. Check if user just completed a Google redirect login
        const redirectResult = await checkRedirectResult();
        if (redirectResult && redirectResult.user) {
          const idToken = await redirectResult.user.getIdToken();
          const response = await triggerGoogleLogin({ idToken }).unwrap();
          const { user, token: freshToken } = response.data ?? response;
          dispatch(setCredentials({ user, token: freshToken }));
          return;
        }
      } catch (err) {
        console.warn("[Auth Initializer] Redirect result error:", err?.message);
      }

      // 2. If token exists in store/localStorage, verify with /api/auth/me
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
    };

    initializeAuth();
  }, []); // intentionally empty — run once on mount only

  return null;
};

const RootRoute = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isInitializing = useSelector(selectIsInitializing);
  const user = useSelector(selectUser);
  if (isInitializing) return null;
  if (!isAuthenticated) return <LandingPage />;
  return user?.role === "admin" ? <Navigate to="/admin" replace /> : <Navigate to="/home" replace />;
};

const AuthRedirectRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isInitializing = useSelector(selectIsInitializing);
  const user = useSelector(selectUser);
  if (isInitializing) return null;
  if (!isAuthenticated) return children;
  return user?.role === "admin" ? <Navigate to="/admin" replace /> : <Navigate to="/home" replace />;
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
          <Route
            path="/spaces/new"
            element={
              <LearnerOnlyRoute redirectTo="/spaces">
                <CreateSpacePage />
              </LearnerOnlyRoute>
            }
          />
          <Route path="/spaces/:spaceId" element={<SpaceDetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/projects/new"
            element={
              <LearnerOnlyRoute redirectTo="/projects">
                <CreateProjectPage />
              </LearnerOnlyRoute>
            }
          />
          <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            }
          />
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
