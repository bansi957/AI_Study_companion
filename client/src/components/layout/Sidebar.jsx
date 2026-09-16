import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Compass,
  FolderKanban,
  FolderClosed,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Lightbulb,
  BarChart3,
  LogOut,
  X,
} from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { selectUser, clearCredentials } from "../../features/auth/authSlice";
import { Avatar } from "../ui/Avatar";
import toast from "react-hot-toast";

export const Sidebar = ({ onClose }) => {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(clearCredentials());
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const navItems = [
    { label: "Home", path: "/home", icon: Compass },
    { label: "Spaces", path: "/spaces", icon: FolderClosed },
    { label: "Projects", path: "/projects", icon: FolderKanban },
  ];

  const upcomingItems = [
    { label: "AI Tutor", icon: Sparkles },
    { label: "Growth", icon: TrendingUp },
    { label: "Recommendations", icon: Lightbulb },
    { label: "Analytics", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 h-full bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between select-none">
      {/* Top Header & Navigation */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Brand Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-800/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-white block leading-tight">
                AI Companion
              </span>
              <span className="text-[11px] text-slate-400 font-medium block">
                Learning Workspace
              </span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <div className="p-4 space-y-6">
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Workspace
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 font-semibold"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent"
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          {/* Upcoming capabilities */}
          <div className="space-y-1 pt-2">
            <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Coming Soon
            </p>
            {upcomingItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-slate-400 cursor-not-allowed opacity-75"
                  title="Will be enabled in subsequent milestones"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-400" />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[10px] font-semibold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
                    Soon
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Section / Logout */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/80">
        <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={user?.name || "User"} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {user?.name || "Learner"}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
