import React from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  Sparkles,
  Layers,
  BrainCircuit,
  Target,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "../../components/ui/Button";

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <header className="border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">
              AI Study Companion
            </span>
          </div>

         
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        {/* Glow ambient background effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[200px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-700/40 text-indigo-300 text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI-Powered Learning & Growth Workspace</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15]">
              Learn Smarter. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200">
                Understand Deeper.
              </span>{" "}
              <br />
              Grow Continuously.
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
              Organize your learning into dedicated Spaces, learn with an AI
              Tutor grounded in your materials, evaluate mastery with adaptive
              assessments, and always know exactly what to study next.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full sm:w-auto px-8" icon={ArrowRight}>
                  Start with Google
                </Button>
              </Link>
            </div>
          </div>

          {/* Sophisticated UI Mockup Preview */}
          <div className="mt-14 max-w-5xl mx-auto rounded-3xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md shadow-2xl p-4 sm:p-6 lg:p-8 animate-fade-in">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800/70">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs text-slate-400 font-mono ml-2">
                  app.aistudycompanion.io/spaces
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-md bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 font-medium">
                  Active Session
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {/* Card 1 */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">🤖</span>
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                    Active
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Machine Learning Space
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Foundations, Neural Nets, and Deep Architectures
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                  <span>3 Projects</span>
                  <span className="text-indigo-400 font-medium">Open Space →</span>
                </div>
              </div>

              {/* Card 2 */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">⚡</span>
                  <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                    In Progress
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Distributed Systems
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Raft consensus, sharding, and replication
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                  <span>2 Projects</span>
                  <span className="text-indigo-400 font-medium">Open Space →</span>
                </div>
              </div>

              {/* Card 3 */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">📐</span>
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/40">
                    Ready
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    System Design
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Scalable architectures, caches, and event buses
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                  <span>4 Projects</span>
                  <span className="text-indigo-400 font-medium">Open Space →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 border-t border-slate-800/60 bg-slate-950/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Core Architecture
            </h2>
            <p className="mt-2 text-3xl font-bold text-white tracking-tight">
              A Complete System for Serious Learning
            </p>
            <p className="mt-3 text-slate-400 text-sm">
              Engineered with persistent context, structured knowledge isolation,
              and adaptive learning feedback.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-700/40 flex items-center justify-center text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Organized Learning Spaces
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Partition broad skills into distinct Spaces and focused Projects.
                Each project maintains its own isolated context and evidence.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-700/40 flex items-center justify-center text-blue-400">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Grounded AI Tutor
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                An intelligent companion that answers directly from your study
                materials, providing verifiable citations instead of hallucinations.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-950/80 border border-violet-700/40 flex items-center justify-center text-violet-400">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Adaptive Assessments
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Targeted quizzes and open-ended evaluations that dynamically test
                your understanding based on your current concept strengths.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-700/40 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Concept Mastery Tracking
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Measure growth quantitatively. Observe which concepts are
                improving, stable, or requiring immediate revision attention.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-700/40 flex items-center justify-center text-amber-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Personalized Next Steps
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Clear recommendations on what to study next based on your
                weaknesses, assessment errors, and overarching goals.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-700/40 flex items-center justify-center text-teal-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Secure & Isolated Data
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Strict multi-tenant security guarantees that your Spaces,
                Projects, and learning history remain entirely private.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/60 py-8 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-400 font-medium">
              AI Study Companion
            </span>
            <span>— AI-Powered Learning & Growth Workspace</span>
          </div>
          <p>© {new Date().getFullYear()} AI Study Companion. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
