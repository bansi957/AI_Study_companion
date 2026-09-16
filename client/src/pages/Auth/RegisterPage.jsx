import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  ArrowRight,
  Sparkles,
  Check,
} from "lucide-react";
import { useDispatch } from "react-redux";
import { useRegisterMutation } from "../../features/auth/authApi";
import { setCredentials } from "../../features/auth/authSlice";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import toast from "react-hot-toast";

export const RegisterPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [registerMutation, { isLoading }] = useRegisterMutation();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

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

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) return;

    try {
      const result = await registerMutation({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
      }).unwrap();

      const { user, token } = result.data ?? result;
      dispatch(setCredentials({ user, token }));
      toast.success("Account created successfully!");
      navigate("/home", { replace: true });
    } catch (err) {
      const msg =
        err?.customMessage ||
        err?.data?.message ||
        err?.error ||
        "Registration failed. Please try again.";
      setServerError(msg);
      toast.error(msg);
    }
  };

  const passwordLengthMet = formData.password.length >= 6;

  return (
    <div className="min-h-screen bg-[#0b0f19] flex">
      {/* Left visual panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950/60 border-r border-slate-800/80 p-12 flex-col justify-between relative overflow-hidden">
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
            <span>Structured Growth</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight mb-4">
            Start your personalized AI learning journey today.
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Create learning spaces for each discipline, upload materials, practice
            with adaptive questions, and track concept-by-concept mastery.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} AI Study Companion. All rights reserved.
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-md space-y-7 animate-fade-in my-auto">
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
              Create your account
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Begin mastering your chosen skills with intelligent assistance.
            </p>
          </div>

          {serverError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              name="name"
              placeholder="Yamini Patel"
              icon={User}
              value={formData.name}
              onChange={handleChange}
              error={errors.name}
              autoComplete="name"
              disabled={isLoading}
            />

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

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="At least 6 characters"
              icon={Lock}
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              autoComplete="new-password"
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

            {formData.password && (
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 ${
                    passwordLengthMet ? "text-emerald-400" : "text-slate-400"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Minimum 6 characters
                </span>
              </div>
            )}

            <Input
              label="Confirm Password"
              type={showPassword ? "text" : "password"}
              name="confirmPassword"
              placeholder="Re-enter your password"
              icon={Lock}
              value={formData.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              autoComplete="new-password"
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={ArrowRight}
            >
              Create Account
            </Button>
          </form>

          <div className="text-center pt-2">
            <p className="text-sm text-slate-400">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
