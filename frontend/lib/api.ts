import { getSupabase } from "./supabaseClient"

function getApiBaseUrl(): string {
  const raw =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
  let base: string
  if (raw && String(raw).trim()) {
    base = String(raw).replace(/\/+$/, "")
  } else if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin
    if (origin !== "http://localhost:3000" && origin !== "http://127.0.0.1:3000") {
      base = `${origin}/api`
    } else {
      base = "http://localhost:8000"
    }
  } else {
    base = "http://localhost:8000"
  }
  // If env was set to origin without /api, nginx expects /api prefix for backend
  if (typeof window !== "undefined" && window.location?.origin && base === window.location.origin)
    return `${base}/api`
  return base
}
/** Base URL of the backend API (no trailing slash). Set NEXT_PUBLIC_API_URL in .env. */
export const API_BASE_URL = getApiBaseUrl()

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  const supabase = await getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function request(method: string, path: string, body?: unknown) {
  const base = getApiBaseUrl()
  const token = await getAuthToken()
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string | { msg?: string }[] }
    const detail = err?.detail
    let message: string
    if (typeof detail === "string") {
      message = detail
    } else if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0]
      message = typeof first === "object" && first && "msg" in first
        ? String((first as { msg?: string }).msg ?? res.status)
        : String(first ?? res.status)
    } else {
      message =
        res.status === 401
          ? "Please sign in again."
          : res.status === 403
            ? "You don't have access."
            : res.status === 404
              ? "Not found."
              : `Request failed (${res.status}).`
    }
    throw new Error(message)
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

