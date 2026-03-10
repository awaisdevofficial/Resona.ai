import { getSupabase } from "./supabaseClient"

const raw = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
/** Base URL of the backend API (no trailing slash). Set NEXT_PUBLIC_API_URL in .env. */
export const API_BASE_URL = raw ? String(raw).replace(/\/+$/, "") : "http://localhost:8000"

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  const supabase = await getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function request(method: string, path: string, body?: unknown) {
  const token = await getAuthToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).detail || `HTTP ${res.status}`)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body: unknown) => request("POST", path, body),
  patch: (path: string, body: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
}

