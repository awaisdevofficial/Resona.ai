"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { cn } from "../lib-utils"

interface Props {
  href: string
  label: string
  icon: LucideIcon
  external?: boolean
}

export function NavItem({ href, label, icon: Icon, external }: Props) {
  const pathname = usePathname()
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium",
        "transition-all duration-150 group relative",
        isActive
          ? "bg-brand/10 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:bg-brand before:rounded-full"
          : "text-[#A8A8C0] hover:bg-white/5 hover:text-white/80",
      )}
    >
      <Icon
        size={15}
        strokeWidth={1.6}
        className={cn(
          isActive ? "text-brand" : "text-[#666680] group-hover:text-white/60",
        )}
      />
      {label}
    </Link>
  )
}

