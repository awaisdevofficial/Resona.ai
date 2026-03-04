"use client";

import { cn } from "@/components/lib-utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
}

export function Card({
  children,
  className,
  padding = "md",
  hover = false,
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-card border border-border shadow-card transition-all duration-200",
        padding === "none" && "p-0",
        padding === "sm" && "p-4",
        padding === "md" && "p-6",
        padding === "lg" && "p-8",
        hover && "hover:shadow-dropdown hover:border-border/80",
        className
      )}
    >
      {children}
    </div>
  );
}
