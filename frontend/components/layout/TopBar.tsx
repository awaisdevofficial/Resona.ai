"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/components/lib-utils";

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview of your voice AI activity",
  },
  "/agents": {
    title: "Agents",
    subtitle: "Configure and manage your voice AI agents",
  },
  "/agents/new": {
    title: "Create Agent",
    subtitle: "Configure your voice AI agent",
  },
  "/calls": {
    title: "Calls",
    subtitle: "Review recent calls and transcripts",
  },
  "/knowledge-base": {
    title: "Knowledge Base",
    subtitle: "Manage knowledge for your agents",
  },
  "/webhooks": {
    title: "Webhooks",
    subtitle: "Receive call and agent events",
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Detailed insights into your call activity",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Manage your account and integrations",
  },
  "/documentation": {
    title: "Documentation",
    subtitle: "How Resona works and API reference",
  },
};

function getPageInfo(pathname: string): { title: string; subtitle?: string } {
  if (pathname.startsWith("/agents/new"))
    return { title: "Create Agent", subtitle: "Configure your voice AI agent" };
  if (pathname.match(/^\/agents\/[^/]+$/))
    return { title: "Edit Agent", subtitle: "Configure your agent" };
  return (
    PAGE_TITLES[pathname] ?? { title: "Resona" }
  );
}

interface TopBarProps {
  onMenuClick?: () => void;
  className?: string;
}

export function TopBar({ onMenuClick, className }: TopBarProps) {
  const pathname = usePathname();
  const { session } = useAuth();
  const pageInfo = getPageInfo(pathname);

  const user = session?.user;
  const displayName =
    (user?.user_metadata as { name?: string })?.name || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className={cn(
        "h-16 flex items-center justify-between px-4 lg:px-8 border-b border-white/[0.06]",
        "bg-[#07080A]/80 backdrop-blur-md sticky top-0 z-30",
        className
      )}
    >
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div>
          <h1 className="text-lg font-semibold text-white">
            {pageInfo.title}
          </h1>
          {pageInfo.subtitle && (
            <p className="hidden sm:block text-xs text-white/70">
              {pageInfo.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4DFFCE]" />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-white/[0.06]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4DFFCE]/30 to-[#2DD4A0]/20 flex items-center justify-center border border-[#4DFFCE]/30">
            <span className="text-xs font-medium text-[#4DFFCE]">
              {initials}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
