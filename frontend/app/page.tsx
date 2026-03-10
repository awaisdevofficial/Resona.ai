"use client";

import Link from "next/link";
import DashboardLayout from "./(dashboard)/layout";
import DashboardPage from "./(dashboard)/page";
import { useAuth } from "@/components/auth/AuthProvider";

export default function RootPage() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-container min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4DFFCE]/20 animate-pulse" />
          <p className="text-sm text-white/50">Loading...</p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <DashboardLayout>
        <DashboardPage />
      </DashboardLayout>
    );
  }

  return (
    <div className="page-container min-h-screen flex flex-col">
      <header className="w-full border-b border-white/[0.06] bg-[#07080A]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4DFFCE] to-[#2DD4A0] flex items-center justify-center">
              <span className="text-sm font-bold text-[#07080A]">R</span>
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">
              Resona<span className="text-[#4DFFCE]">.ai</span>
            </span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="btn-primary px-5 py-2.5 text-sm"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
              Turn every call into a{" "}
              <span className="text-[#4DFFCE]">supercharged AI conversation</span>
              .
            </h1>
            <p className="text-sm md:text-base text-white/60 leading-relaxed">
              Resona.ai lets you spin up production-ready voice agents in minutes.
              Connect your phone numbers, configure agent behaviour, and review
              every conversation from a single, beautiful dashboard.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn-primary">
                Start for free
              </Link>
              <Link href="/sign-in" className="btn-secondary">
                I already have an account
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-white/50 pt-2">
              <span>• No credit card required</span>
              <span>• Built for high-quality call analytics</span>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Live preview
            </p>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/60">
                  Example agent
                </span>
                <span className="inline-flex items-center rounded-full bg-[#4DFFCE]/15 text-[#4DFFCE] px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Ready
                </span>
              </div>
              <div className="text-sm text-white/60 leading-relaxed">
                &ldquo;Hi, this is your AI assistant. How can I help you today?&rdquo;
              </div>
            </div>
            <p className="text-[11px] text-white/50">
              Once you sign up, you&apos;ll be able to create custom agents, attach
              phone numbers, and run real test calls from your dashboard.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
