"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { getSupabase } from "@/lib/supabaseClient"

interface AuthContextValue {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let subscription: { unsubscribe: () => void } | null = null

    async function init() {
      const supabase = await getSupabase()
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(s)
      setLoading(false)
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, s2) => {
        setSession(s2)
        setLoading(false)
      })
      subscription = sub
    }

    init()
    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}

