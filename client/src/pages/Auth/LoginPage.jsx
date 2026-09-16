import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, GraduationCap, ArrowRight, Sparkles } from "lucide-react";
import { useDispatch } from "react-redux";
import { useLoginMutation } from "../../features/auth/authApi";
import { setCredentials } from "../../features/auth/authSlice";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import toast from "react-hot-toast";

export const LoginPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginMutation, { isLoading }] = useLoginMutation();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

  const from = location.state?.from?.pathname || "/home";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (serverError) {
      setServerError("");
    }
  };

  const validate = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) return;

    try {
      const result = await loginMutation({
        email: formData.email.trim(),
        password: formData.password,
      }).unwrap();

      const { user, token } = result.data ?? result;
      dispatch(setCredentials({ user, token }));
      toast.success("Welcome back!");
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        err?.customMessage ||
        err?.data?.message ||
        err?.error ||
        "Invalid email or password";
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex">
      {/* Left visual panel (desktop only) */}
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
            <span>Persistent Context & Mastery</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight mb-4">
            Pick up right where your learning left off.
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your spaces, projects, quiz progress, and AI tutor interactions are
            persisted securely across all your devices.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} AI Study Companion. Secure Authentication.
        </div>
      </div>

      {/* Right form panel */}
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
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Sign in to your workspace
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Enter your credentials to access your spaces and projects.
            </p>
          </div>

          {serverError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              name="email"
              placeholder="yamini@example.com"
              icon={Mail}
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              autoComplete="email"
              disabled={isLoading}
            />

            <div>
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter your password"
                icon={Lock}
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                autoComplete="current-password"
                disabled={isLoading}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                }
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() =>
                    toast("Password reset is not yet configured on this system.", {
                      icon: "ℹ️",
                    })
                  }
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={ArrowRight}
            >
              Sign In
            </Button>
          </form>

          <div className="text-center pt-2">
            <p className="text-sm text-slate-400">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
