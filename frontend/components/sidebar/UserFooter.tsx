"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

const planColors: Record<string, string> = {
  free: "text-gray-400 bg-white/5",
  starter: "text-blue-300 bg-blue-500/10",
  pro: "text-violet-300 bg-violet-500/10",
  enterprise: "text-amber-300 bg-amber-500/10",
}

export function UserFooter() {
  const router = useRouter()
  const { session } = useAuth()
  const user = session?.user
  if (!user) return null

  const displayName =
    (user.user_metadata as any)?.name || user.email || "User"

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const plan = "pro"

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace("/sign-in")
  }

  return (
    <div className="px-3 py-3 mt-1 space-y-2">
      <div className="flex items-center gap-3 rounded-lg hover:bg-white/5 transition-colors cursor-default">
        <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-brand">
            {initials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white truncate">
            {displayName}
          </p>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${planColors[plan]}`}
          >
            {plan}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-300 border border-white/10 hover:bg-white/5 hover:text-white transition-colors"
      >
        <LogOut size={12} />
        Log out
      </button>
    </div>
  )
}

