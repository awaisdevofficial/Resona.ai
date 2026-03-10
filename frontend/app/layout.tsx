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
      <body className="min-h-screen bg-[#07080A] text-white">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="top-right"
            containerStyle={{ position: "fixed", zIndex: 99999 }}
            toastOptions={{
              duration: 4000,
              style: {
                background: "rgba(14,17,22,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                color: "#fff",
                boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
              },
              success: { iconTheme: { primary: "#4DFFCE", secondary: "#07080A" } },
              error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  )
}
