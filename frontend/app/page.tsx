"use client"

import Link from "next/link"
import DashboardLayout from "./(dashboard)/layout"
import DashboardPage from "./(dashboard)/page"
import { useAuth } from "@/components/auth/AuthProvider"

export default function RootPage() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    )
  }

  if (session) {
    return (
      <DashboardLayout>
        <DashboardPage />
      </DashboardLayout>
    )
  }

  // Public landing page for visitors who are not signed in
  return (
    <div className="min-h-screen bg-canvas text-primary flex flex-col">
      <header className="w-full border-b border-border/60 bg-surface/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">
              Resona<span className="text-brand">.ai</span>
            </span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-lg text-muted hover:text-primary hover:bg-gray-100 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-3 py-1.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark transition-colors"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary">
              Turn every call into a{" "}
              <span className="text-brand">supercharged AI conversation</span>.
            </h1>
            <p className="text-sm md:text-base text-muted leading-relaxed">
              Resona.ai lets you spin up production-ready voice agents in minutes.
              Connect your Twilio numbers, configure agent behaviour, and review
              every conversation from a single, beautiful dashboard.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark shadow-card transition-colors"
              >
                Start for free
              </Link>
              <Link
                href="/sign-in"
                className="px-5 py-2.5 rounded-lg border border-border text-sm font-semibold text-primary hover:bg-gray-50 transition-colors"
              >
                I already have an account
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted pt-2">
              <span>• No credit card required</span>
              <span>• Built for high-quality call analytics</span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Live preview
            </p>
            <div className="rounded-xl bg-canvas/70 border border-dashed border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">
                  Example agent
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Ready
                </span>
              </div>
              <div className="text-xs text-muted leading-relaxed">
                “Hi, this is your AI assistant. How can I help you today?”
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Once you sign up, you&apos;ll be able to create custom agents, attach
              phone numbers, and run real test calls from your dashboard.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
