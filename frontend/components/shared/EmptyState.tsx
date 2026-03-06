"use client";

import { cn } from "@/components/lib-utils";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

const DefaultIcon = () => (
  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
    <svg
      width="28"
      height="28"
      fill="none"
      viewBox="0 0 24 24"
      className="text-white/60"
    >
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "glass-card p-12 text-center",
        className
      )}
    >
      {icon ?? <DefaultIcon />}
      <h3 className="text-lg font-medium text-white mb-2 mt-6">{title}</h3>
      <p className="text-sm text-white/70 max-w-sm mx-auto mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}
