"use client";

import Link from "next/link";
import {
  BarChart2,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
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
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

interface SidebarProps {
  className?: string;
  collapsed?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onCollapseToggle?: () => void;
}

export function Sidebar({
  className,
  collapsed,
  isOpen,
  onClose,
  onCollapseToggle,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full z-50 bg-[#0B0D10] border-r border-white/[0.06]",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]",
        className
      )}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4DFFCE] to-[#2DD4A0] flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-[#07080A]">R</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-white text-lg tracking-tight">
              Resona
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onCollapseToggle}
          className="hidden lg:flex w-6 h-6 items-center justify-center rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronLeft size={14} />
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 text-white/50"
          aria-label="Close menu"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto min-h-0">
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

      <div className="p-3 border-t border-white/[0.06] space-y-1">
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
        />
        <Link
          href="/documentation"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60",
            "hover:bg-white/5 hover:text-white transition-all duration-200",
            collapsed && "justify-center"
          )}
        >
          <BookOpen size={18} />
          {!collapsed && <span>Documentation</span>}
        </Link>
        <UserFooter collapsed={collapsed} />
      </div>
    </aside>
  );
}
