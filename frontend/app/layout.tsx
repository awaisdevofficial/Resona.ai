import type { Metadata } from "next"
import { Toaster } from "react-hot-toast"
import { QueryProvider } from "@/components/QueryProvider"
import { AuthProvider } from "@/components/auth/AuthProvider"
import "../styles/globals.css"

export const metadata: Metadata = {
  title: "Resona.ai",
  description: "Voice AI platform dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans antialiased">
      <body className="min-h-screen bg-background text-text-primary">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-dropdown)",
              },
              success: { iconTheme: { primary: "#10B981", secondary: "#fff" } },
              error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  )
}

