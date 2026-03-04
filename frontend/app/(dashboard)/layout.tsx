 "use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { useAuth } from "@/components/auth/AuthProvider"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { session, loading } = useAuth()

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/sign-in")
    }
  }, [loading, session, router])

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center h-screen bg-canvas">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-10 min-h-full">
          {children}
        </div>
      </main>
    </div>
  )
}

