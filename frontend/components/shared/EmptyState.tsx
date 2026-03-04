"use client";

import { cn } from "@/components/lib-utils";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const DefaultIcon = () => (
  <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center shadow-card">
    <svg
      width="28"
      height="28"
      fill="none"
      viewBox="0 0 24 24"
      className="text-brand"
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
        "flex flex-col items-center justify-center py-24 px-8 text-center",
        className
      )}
    >
      {icon ?? <DefaultIcon />}
      <h3 className="text-section-title text-text-primary mt-6 mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-body text-text-secondary max-w-sm leading-relaxed mb-6">
        {description}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-5 py-2.5 bg-brand text-white text-body font-semibold rounded-button hover:bg-brand-dark transition-all duration-150 shadow-card cursor-pointer active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
