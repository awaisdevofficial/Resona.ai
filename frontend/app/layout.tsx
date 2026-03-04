import type { Metadata } from "next"
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
      <body className="min-h-screen">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}

