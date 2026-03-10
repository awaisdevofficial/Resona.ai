import { createClient, SupabaseClient } from "@supabase/supabase-js"

const API_BASE = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
  ? String(process.env.NEXT_PUBLIC_API_URL).replace(/\/+$/, "")
  : "http://localhost:8000"

let cached: SupabaseClient | null = null

/** Fetch Supabase config from backend and return client. Uses real credentials at runtime so sign-in works without rebuild. */
export async function getSupabase(): Promise<SupabaseClient> {
  if (cached) return cached
  const res = await fetch(`${API_BASE}/config/public`, { cache: "no-store" })
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
