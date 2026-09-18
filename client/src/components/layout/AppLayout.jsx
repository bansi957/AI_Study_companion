import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, GraduationCap } from "lucide-react";
import { Sidebar } from "./Sidebar";

export const AppLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[#0b0f19] text-slate-100 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-2xl z-10 animate-fade-in">
            <Sidebar onClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Minimal Mobile-Only Bar (Hidden on desktop) */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/80 sticky top-0 z-20">
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-sm shadow-indigo-600/30">
              <GraduationCap className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">StudyMate AI</span>
          </div>

          <div className="w-8" />
        </div>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
