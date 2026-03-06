"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/components/lib-utils";

const SIDEBAR_BREAKPOINT = 1024;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/sign-in");
    }
  }, [loading, session, router]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SIDEBAR_BREAKPOINT - 1}px)`);
    const handleChange = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setMobileOpen(false);
    };
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);
  const sidebarCollapsed = isMobile ? false : desktopCollapsed;

  if (loading || !session) {
    return (
      <div className="page-container flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4DFFCE]/20 animate-pulse" />
          <p className="text-sm text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container min-h-screen flex">
      <Sidebar
        collapsed={sidebarCollapsed}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onCollapseToggle={() => setDesktopCollapsed((c) => !c)}
        className={cn(
          "lg:translate-x-0 transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      />
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-[padding] duration-300",
          isMobile ? "" : desktopCollapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"
        )}
      >
        <TopBar onMenuClick={() => setMobileOpen((v) => !v)} />
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto animate-route-in">
            {children}
          </div>
        </main>
      </div>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}
