"use client";

import { cn } from "@/components/lib-utils";

const styles: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-error border-red-200",
  in_progress: "bg-blue-50 text-info border-blue-200",
  no_answer: "bg-gray-50 text-text-muted border-gray-200",
  busy: "bg-amber-50 text-warning border-amber-200",
  queued: "bg-gray-50 text-text-muted border-gray-200",
  ringing: "bg-amber-50 text-amber-600 border-amber-200",
};

const dotColors: Record<string, string> = {
  completed: "bg-success",
  failed: "bg-error",
  in_progress: "bg-info",
  no_answer: "bg-text-muted",
  busy: "bg-warning",
  queued: "bg-text-muted",
  ringing: "bg-amber-500",
};

const labels: Record<string, string> = {
  in_progress: "In Progress",
  no_answer: "No Answer",
};

export function CallStatusBadge({ status }: { status: string }) {
  const style = styles[status] ?? "bg-gray-50 text-text-muted border-gray-200";
  const dot = dotColors[status] ?? "bg-text-muted";
  const label =
    labels[status] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-badge border",
        style
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", dot)} />
      {label}
    </span>
  );
}
