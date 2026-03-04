import { cn } from "../lib-utils"

const styles: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  no_answer: "bg-gray-50 text-gray-600 border-gray-200",
  busy: "bg-amber-50 text-amber-700 border-amber-200",
  queued: "bg-gray-50 text-gray-400 border-gray-200",
  ringing: "bg-amber-50 text-amber-600 border-amber-200",
}

const labels: Record<string, string> = {
  in_progress: "In Progress",
  no_answer: "No Answer",
}

export function CallStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border",
        styles[status] ?? "bg-gray-50 text-gray-500 border-gray-200",
      )}
    >
      {labels[status] ??
        status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
    </span>
  )
}

