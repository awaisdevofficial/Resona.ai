"use client"

import { useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Beaker,
  Clock,
  Phone,
  PhoneCall,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { CallStatusBadge } from "@/components/calls/CallStatusBadge"
import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

type Filters = {
  direction?: string
  status?: string
  agentId?: string
}

export default function CallsPage() {
  const [filters, setFilters] = useState<Filters>({})
  const [selected, setSelected] = useState<any | null>(null)

  const { data: calls, isLoading } = useQuery({
    queryKey: ["calls", filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.direction) params.set("direction", filters.direction)
      if (filters.status) params.set("status", filters.status)
      if (filters.agentId) params.set("agent_id", filters.agentId)
      return api.get(`/v1/calls?${params.toString()}`)
    },
  })

  const items = (calls as any[]) ?? []

  const totalCalls = items.length
  const completedCalls = items.filter((call) => call.status === "completed").length
  const failedCalls = items.filter((call) => call.status === "failed").length
  const totalDurationSeconds = items.reduce(
    (acc, call) => acc + (call.duration_seconds || 0),
    0,
  )
  const avgDurationSeconds = totalCalls
    ? Math.round(totalDurationSeconds / totalCalls)
    : 0

  const hasActiveFilters =
    Boolean(filters.direction) || Boolean(filters.status) || Boolean(filters.agentId)

  return (
    <div>
      <PageHeader
        title="Calls"
        subtitle="Review recent calls made by your agents. Filter by direction and status, then drill into the full transcript for each call."
        actions={
          <div className="hidden md:flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-full bg-canvas text-xs font-medium text-muted border border-border/70">
              {isLoading
                ? "Loading calls..."
                : `${totalCalls.toLocaleString()} call${
                    totalCalls === 1 ? "" : "s"
                  }`}
            </div>
          </div>
        }
      />

      {!isLoading && !!items.length && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Total calls" value={totalCalls.toLocaleString()} />
          <StatCard
            label="Completion rate"
            value={
              totalCalls
                ? `${Math.round((completedCalls / totalCalls) * 100)}%`
                : "—"
            }
            helperText={`${completedCalls} completed • ${failedCalls} failed`}
          />
          <StatCard
            label="Avg. duration"
            value={avgDurationSeconds ? formatDuration(avgDurationSeconds) : "—"}
            helperText={
              totalDurationSeconds
                ? `${formatDuration(totalDurationSeconds)} total talk time`
                : undefined
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-canvas/40">
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                label="All directions"
                isActive={!filters.direction}
                onClick={() =>
                  setFilters((current) => ({ ...current, direction: undefined }))
                }
              />
              <FilterPill
                label="Inbound"
                isActive={filters.direction === "inbound"}
                onClick={() =>
                  setFilters((current) => ({ ...current, direction: "inbound" }))
                }
              />
              <FilterPill
                label="Outbound"
                isActive={filters.direction === "outbound"}
                onClick={() =>
                  setFilters((current) => ({ ...current, direction: "outbound" }))
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filters.status ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value || undefined,
                  }))
                }
                className="h-8 rounded-lg border border-border bg-white/80 px-2.5 text-xs text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In progress</option>
                <option value="queued">Queued</option>
                <option value="ringing">Ringing</option>
                <option value="failed">Failed</option>
                <option value="no_answer">No answer</option>
                <option value="busy">Busy</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters({})
                    setSelected(null)
                  }}
                  className="text-[11px] font-medium text-muted hover:text-primary underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead className="bg-gray-50/70 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  From
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  To
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-border/60">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-5 rounded bg-gray-100 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : !items.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    No calls yet.
                  </td>
                </tr>
              ) : (
                items.map((call) => {
                  const isSelected = selected?.id === call.id
                  const direction = call.direction ?? "—"
                  const isInbound = direction === "inbound"
                  const callType = getCallType(call)

                  return (
                    <tr
                      key={call.id}
                      onClick={() => setSelected(call)}
                      className={`border-b border-border/60 hover:bg-gray-50/60 cursor-pointer transition-colors ${
                        isSelected ? "bg-brand/5" : "bg-transparent"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          {isInbound ? (
                            <ArrowDownLeft size={14} className="text-emerald-500" />
                          ) : (
                            <ArrowUpRight size={14} className="text-blue-500" />
                          )}
                          <span className="capitalize">{direction}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <CallTypeBadge type={callType} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        {call.from_number || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        {call.to_number || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <CallStatusBadge status={call.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        {call.duration_seconds
                          ? formatDuration(call.duration_seconds)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {call.created_at
                          ? new Date(call.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-border rounded-xl shadow-card p-5 flex flex-col min-h-[280px]">
          <h2 className="text-base font-semibold text-primary mb-4 tracking-tight shrink-0">
            Call details
          </h2>
          <div className="flex-1 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center rounded-lg bg-canvas/30 border border-dashed border-border py-8">
                <p className="text-sm text-muted text-center px-4">
                  Select a call from the table to view its transcript.
                </p>
              </div>
            ) : !selected.transcript?.length ? (
              <div className="flex-1 flex items-center justify-center rounded-lg bg-canvas/30 border border-dashed border-border py-8">
                <p className="text-sm text-muted text-center px-4">
                  No transcript available for this call yet.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                <div className="rounded-lg bg-gradient-to-r from-brand/10 via-brand/5 to-transparent border border-border px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                        {selected.direction === "inbound"
                          ? "Inbound call"
                          : "Outbound call"}
                      </p>
                      <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                        <Phone size={14} className="text-brand" />
                        {selected.to_number ||
                          selected.from_number ||
                          "Unknown number"}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        From {selected.from_number || "—"} to{" "}
                        {selected.to_number || "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CallTypeBadge type={getCallType(selected)} />
                        {selected.metadata?.type === "web_test" && (
                          <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 text-[11px] font-medium">
                            <Beaker size={12} className="mr-1" />
                            {selected.metadata?.test_title || "Web test call"}
                          </span>
                        )}
                        {selected.metadata?.type !== "web_test" &&
                          (selected.to_number || selected.from_number) && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium">
                              <PhoneCall size={12} className="mr-1" />
                              Phone number call
                            </span>
                          )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <CallStatusBadge status={selected.status} />
                      <div className="flex items-center gap-1.5 text-[11px] text-muted">
                        <Clock size={12} />
                        <span>
                          {selected.created_at
                            ? new Date(selected.created_at).toLocaleString()
                            : "Unknown start time"}
                        </span>
                      </div>
                      {selected.duration_seconds ? (
                        <div className="text-[11px] text-muted">
                          Duration:{" "}
                          <span className="font-medium text-primary">
                            {formatDuration(selected.duration_seconds)}
                          </span>
                        </div>
                      ) : null}
                      {typeof selected.cost_cents === "number" &&
                        selected.cost_cents > 0 && (
                          <div className="text-[11px] text-muted">
                            Cost:{" "}
                            <span className="font-medium text-primary">
                              {formatCurrency(selected.cost_cents)}
                            </span>
                          </div>
                        )}
                      {selected.end_reason && (
                        <div className="text-[11px] text-muted max-w-[220px] text-right">
                          End reason:{" "}
                          <span className="font-medium text-primary">
                            {selected.end_reason}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {selected.transcript.map((turn: any, index: number) => {
                    const speaker = turn.speaker ?? turn.role ?? "agent"
                    return (
                      <div
                        key={index}
                        className={`flex ${
                          speaker === "agent" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                            speaker === "agent"
                              ? "bg-brand text-white"
                              : "bg-gray-100 text-primary"
                          }`}
                        >
                          <p className="text-[10px] opacity-70 mb-0.5 uppercase tracking-wide">
                            {speaker}
                          </p>
                          <p>{turn.text}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100
  if (!Number.isFinite(dollars)) return "$0.00"
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getCallType(call: any): "web_test" | "phone" {
  const metadataType = call?.metadata?.type
  if (metadataType === "web_test") return "web_test"
  return "phone"
}

function StatCard({
  label,
  value,
  helperText,
}: {
  label: string
  value: string
  helperText?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 shadow-card flex flex-col gap-0.5">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">
        {label}
      </p>
      <p className="text-lg font-semibold text-primary">{value}</p>
      {helperText && (
        <p className="text-xs text-muted mt-0.5 leading-snug">{helperText}</p>
      )}
    </div>
  )
}

function FilterPill({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
        isActive
          ? "bg-brand/10 text-brand border-brand/30"
          : "bg-canvas text-muted border-border hover:bg-white"
      }`}
    >
      {label}
    </button>
  )
}

function CallTypeBadge({ type }: { type: "web_test" | "phone" }) {
  const isTest = type === "web_test"
  const label = isTest ? "Test call" : "Phone number call"

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
        isTest
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      {isTest ? <Beaker size={12} /> : <PhoneCall size={12} />}
      {label}
    </span>
  )
}


