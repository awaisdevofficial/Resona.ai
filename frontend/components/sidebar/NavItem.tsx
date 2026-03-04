"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/lib-utils";

interface Props {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
  collapsed?: boolean;
}

export function NavItem({
  href,
  label,
  icon: Icon,
  external,
  collapsed,
}: Props) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium",
        "transition-all duration-150 cursor-pointer relative",
        "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:rounded-r-full before:transition-all duration-200",
        isActive
          ? "text-white bg-white/10 before:bg-brand before:h-5 before:opacity-100"
          : "text-[#A0A0B8] hover:text-white hover:bg-white/5 before:opacity-0 before:h-0",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon
        size={18}
        strokeWidth={1.8}
        className={cn(
          "shrink-0",
          isActive ? "text-brand" : "text-[#A0A0B8] group-hover:text-white"
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
