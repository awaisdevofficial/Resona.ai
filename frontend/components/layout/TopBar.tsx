"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/components/lib-utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/agents": "Agents",
  "/calls": "Calls",
  "/phone-numbers": "Phone Numbers",
  "/knowledge-base": "Knowledge Base",
  "/webhooks": "Webhooks",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/agents/new")) return "New Agent";
  if (pathname.match(/^\/agents\/[^/]+$/)) return "Edit Agent";
  return PAGE_TITLES[pathname] ?? "Resona";
}

interface TopBarProps {
  onMenuClick?: () => void;
  className?: string;
}

export function TopBar({ onMenuClick, className }: TopBarProps) {
  const pathname = usePathname();
  const { session } = useAuth();
  const title = getPageTitle(pathname);

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
        "h-[60px] bg-surface border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0",
        "shadow-[0_1px_0_0_rgba(0,0,0,0.04)]",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background transition-all duration-150 active:scale-95"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="text-page-title text-text-primary truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <button
          type="button"
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background transition-all duration-150 active:scale-95 cursor-pointer"
          aria-label="Notifications"
        >
          <Bell size={20} />
        </button>
        <div
          className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20"
          title={displayName}
        >
          <span className="text-label font-semibold text-brand">{initials}</span>
        </div>
      </div>
    </header>
  );
}
