"use client";

import { cn } from "@/components/lib-utils";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-6 mb-8 flex-wrap",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-page-title text-text-primary tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-body text-text-secondary mt-1.5 leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
