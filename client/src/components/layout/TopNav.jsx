import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Plus, FolderPlus, FolderKanban } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import { Button } from "../ui/Button";

export const TopNav = ({ onMenuClick }) => {
  const location = useLocation();
  const user = useSelector(selectUser);
  const isAdmin = user?.role === "admin";

  const getPageTitle = () => {
    if (location.pathname === "/admin") return "Admin Dashboard";
    if (location.pathname === "/home") return "Dashboard";
    if (location.pathname === "/spaces") return "Learning Spaces";
    if (location.pathname.startsWith("/spaces/new")) return "New Space";
    if (location.pathname.startsWith("/spaces/")) return "Space Details";
    if (location.pathname === "/projects") return "Projects";
    if (location.pathname === "/projects/new") return "New Project";
    return "Workspace";
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h2 className="text-sm sm:text-base font-semibold text-slate-200">
          {getPageTitle()}
        </h2>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/spaces/new">
            <Button variant="secondary" size="sm" icon={FolderPlus}>
              <span className="hidden sm:inline">New Space</span>
            </Button>
          </Link>
          <Link to="/projects/new">
            <Button variant="primary" size="sm" icon={Plus}>
              <span className="hidden sm:inline">New Project</span>
              <span className="sm:hidden">Project</span>
            </Button>
          </Link>
        </div>
      )}
    </header>
  );
};
