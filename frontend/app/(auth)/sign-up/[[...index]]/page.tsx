"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Depending on your Supabase email confirmation settings, the user may need
    // to confirm their email before they can sign in.
    setMessage("Check your email to confirm your account, then sign in.")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 font-sans">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-card p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-primary">Create account</h1>
          <p className="mt-1 text-sm text-muted">
            Sign up with your email and a password.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#4B5563]">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#4B5563]">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {message && (
            <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {loading ? "Signing up..." : "Sign up"}
          </button>
        </form>

        <p className="text-xs text-muted text-center">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

