"use client"
import {
  BarChart2,
  BookOpen,
  Bot,
  Hash,
  LayoutGrid,
  Phone,
  Settings,
} from "lucide-react"
import { NavItem } from "./NavItem"
import { UserFooter } from "./UserFooter"

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/phone-numbers", label: "Phone Numbers", icon: Hash },
]

const insightsNav = [
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/webhooks", label: "Webhooks", icon: Phone },
]

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-screen bg-sidebar flex flex-col sticky top-0 overflow-y-auto">
      <div className="px-5 py-6 border-b border-white/5">
        <span className="text-lg font-bold text-white tracking-tight">
          Resona<span className="text-brand">.ai</span>
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6">
        <div className="space-y-0.5">
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-[#444460]">
            Main
          </p>
          {mainNav.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>

        <div className="space-y-0.5">
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-[#444460]">
            Insights
          </p>
          {insightsNav.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      <div className="px-3 pb-4 space-y-0.5 border-t border-white/5 pt-4">
        <NavItem href="/settings" label="Settings" icon={Settings} />
        <NavItem
          href="https://docs.resona.ai"
          label="Documentation"
          icon={BookOpen}
          external
        />
        <UserFooter />
      </div>
    </aside>
  )
}

