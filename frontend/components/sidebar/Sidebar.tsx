"use client";

import {
  BarChart2,
  BookOpen,
  Bot,
  Hash,
  LayoutGrid,
  Phone,
  Settings,
  Webhook,
} from "lucide-react";
import { NavItem } from "./NavItem";
import { UserFooter } from "./UserFooter";
import { cn } from "@/components/lib-utils";

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/phone-numbers", label: "Phone Numbers", icon: Hash },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

interface SidebarProps {
  className?: string;
  collapsed?: boolean;
}

export function Sidebar({ className, collapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        "w-sidebar shrink-0 h-screen bg-sidebar flex flex-col fixed left-0 top-0 z-30",
        "transition-[width] duration-200 ease-out",
        collapsed && "w-[72px]",
        className
      )}
    >
      <div className="px-4 py-5 border-b border-white/5 flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0 shadow-card">
          <span className="text-white font-bold text-sm">R</span>
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-white tracking-tight truncate">
            Resona
          </span>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto min-h-0">
        {mainNav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-white/5 space-y-0.5">
        <NavItem href="/settings" label="Settings" icon={Settings} collapsed={collapsed} />
        <NavItem
          href="https://docs.resona.ai"
          label="Documentation"
          icon={BookOpen}
          external
          collapsed={collapsed}
        />
        <UserFooter collapsed={collapsed} />
      </div>
    </aside>
  );
}
