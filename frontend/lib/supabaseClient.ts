import { createClient, SupabaseClient } from "@supabase/supabase-js"

/** Use same base URL as api.ts so /config/public hits the backend (e.g. origin/api when in prod). */
function getApiBase(): string {
  const raw = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
  let base: string
  if (raw && String(raw).trim()) {
    base = String(raw).replace(/\/+$/, "")
  } else if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin
    if (origin !== "http://localhost:3000" && origin !== "http://127.0.0.1:3000")
      base = `${origin}/api`
    else
      base = "http://localhost:8000"
  } else {
    base = "http://localhost:8000"
  }
  // If env was set to origin without /api (e.g. https://resonaai.duckdns.org), nginx expects /api prefix
  if (typeof window !== "undefined" && window.location?.origin && base === window.location.origin)
    return `${base}/api`
  return base
}

let cached: SupabaseClient | null = null

/** Fetch Supabase config from backend and return client. Uses real credentials at runtime so sign-in works without rebuild. */
export async function getSupabase(): Promise<SupabaseClient> {
  if (cached) return cached
  const res = await fetch(`${getApiBase()}/config/public`, { cache: "no-store" })
  const data = await res.json() as { supabase_url?: string; supabase_anon_key?: string }
  const url = (data?.supabase_url || "").trim()
  const key = (data?.supabase_anon_key || "").trim()
  if (url && key) {
    cached = createClient(url, key)
    return cached
  }
  const fallbackUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
  const fallbackKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
  cached = createClient(fallbackUrl, fallbackKey)
  return cached
}

/** Sync client for build-time / env only. Prefer getSupabase() so runtime config from backend is used. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
