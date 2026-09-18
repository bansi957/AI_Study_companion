import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { GraduationCap, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { useDispatch } from "react-redux";
import { useGoogleLoginMutation } from "../../features/auth/authApi";
import { setCredentials } from "../../features/auth/authSlice";
import {
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  checkRedirectResult,
  isFirebaseConfigured,
} from "../../services/firebase";
import toast from "react-hot-toast";

// Crisp SVG for Google 'G' icon
const GoogleIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.14 0 9.99 0 12s.45 3.86 1.24 5.42l4.04-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

export const LoginPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [googleLoginMutation, { isLoading: isBackendVerifying }] =
    useGoogleLoginMutation();

  const [isFirebaseLoading, setIsFirebaseLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const isLoading = isFirebaseLoading || isBackendVerifying;

  // Handle redirect authentication result (if user was redirected on mobile/popup-blocked)
  useEffect(() => {
    const handleRedirect = async () => {
      if (!isFirebaseConfigured) return;
      try {
        setIsFirebaseLoading(true);
        const result = await checkRedirectResult();
        if (result && result.user) {
          await handleFirebaseUser(result.user);
        }
      } catch (err) {
        console.error("Redirect auth error:", err);
        setAuthError(err.message || "Failed to complete Google Sign-In redirect");
      } finally {
        setIsFirebaseLoading(false);
      }
    };

    handleRedirect();
  }, []);

  // Common exchange handler: Firebase User -> ID Token -> Backend Verify -> Redux Store
  const handleFirebaseUser = async (firebaseUser) => {
    setAuthError("");
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await googleLoginMutation({ idToken }).unwrap();

      const { user, token } = response.data ?? response;
      dispatch(setCredentials({ user, token }));
      toast.success(`Welcome back, ${user.name || "Learner"}!`);

      const defaultRoute = user.role === "admin" ? "/admin" : "/home";
      const target = location.state?.from?.pathname || defaultRoute;
      navigate(target, { replace: true });
    } catch (err) {
      const msg =
        err?.customMessage ||
        err?.data?.message ||
        err?.error ||
        "Backend token verification failed. Please try again.";
      setAuthError(msg);
      toast.error(msg);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured) {
      setAuthError(
        "Firebase environment variables are not configured. Please add VITE_FIREBASE_* credentials to client/.env"
      );
      toast.error("Firebase is not configured in client/.env");
      return;
    }

    setAuthError("");
    setIsFirebaseLoading(true);

    try {
      // 1. Attempt Popup authentication
      const credential = await signInWithGooglePopup();
      if (credential && credential.user) {
        await handleFirebaseUser(credential.user);
      }
    } catch (err) {
      console.warn("Popup authentication error:", err);
      // If popup was blocked by browser or mobile environment, fallback to redirect
      if (
        err.code === "auth/popup-blocked" ||
        err.code === "auth/popup-closed-by-user" &&
          window.innerWidth < 768
      ) {
        try {
          toast("Opening Google authentication...", { icon: "🔄" });
          await signInWithGoogleRedirect();
          return; // Browser will redirect
        } catch (redirectErr) {
          setAuthError(redirectErr.message);
          toast.error(redirectErr.message);
        }
      } else if (err.code === "auth/cancelled-popup-request") {
        // User closed or superseded popup, silent ignore
      } else if (err.code === "auth/popup-closed-by-user") {
        setAuthError("Google Sign-In was closed before completing. Please try again.");
      } else {
        const message = err.message || "Failed to sign in with Google.";
        setAuthError(message);
        toast.error(message);
      }
    } finally {
      setIsFirebaseLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex">
      {/* Left visual branding panel (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950/60 border-r border-slate-800/80 p-12 flex-col justify-between relative overflow-hidden">
        {/* Glow ambient background effects */}
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="text-base font-bold text-white block">
                AI Study Companion
              </span>
              <span className="text-xs text-slate-400 font-medium block">
                Learning Workspace
              </span>
            </div>
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/40 text-indigo-300 text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Unified Google Authentication</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight mb-4">
            One click to resume your personalized study journey.
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your spaces, concept roadmaps, quiz history, and AI tutor context are
            safely linked to your Google identity across all devices.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} AI Study Companion. Firebase Verified Security.
        </div>
      </div>

      {/* Right authentication panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-6">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="text-base font-bold text-white">
                AI Study Companion
              </span>
            </Link>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Sign In to Your Workspace
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Continue securely with your Google account to access your spaces and projects.
            </p>
          </div>

          {/* Missing Env Configuration Warning */}
          {!isFirebaseConfigured && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-600/40 text-xs text-amber-300 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span>Firebase Configuration Needed</span>
              </div>
              <p className="leading-relaxed text-slate-300">
                Please configure your Firebase credentials in <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">client/.env</code> to enable live Google Sign-In.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">{authError}</div>
            </div>
          )}

          {/* Single "Continue with Google" Button */}
          <div className="pt-2">
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full group relative flex items-center justify-center gap-3.5 py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-200 active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-slate-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>
                    {isFirebaseLoading ? "Connecting with Google..." : "Verifying account..."}
                  </span>
                </>
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5 flex-shrink-0" />
                  <span>Continue with Google</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              By continuing, you agree to our Terms of Service and Privacy Policy.
              Existing accounts with a matching Google email are automatically linked.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
