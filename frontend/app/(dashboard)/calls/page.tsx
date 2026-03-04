"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Beaker,
  Clock,
  Phone,
  PhoneCall,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

type Filters = {
  direction?: string;
  status?: string;
  agentId?: string;
};

export default function CallsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({});
  const [selected, setSelected] = useState<any | null>(null);
  const [outboundModal, setOutboundModal] = useState(false);
  const [outboundAgent, setOutboundAgent] = useState("");
  const [outboundNumber, setOutboundNumber] = useState("");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90">("7");

  const { data: calls, isLoading } = useQuery({
    queryKey: ["calls", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.direction) params.set("direction", filters.direction);
      if (filters.status) params.set("status", filters.status);
      if (filters.agentId) params.set("agent_id", filters.agentId);
      return api.get(`/v1/calls?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const outboundCall = useMutation({
    mutationFn: (payload: { agent_id: string; to_number: string }) =>
      api.post("/v1/calls/outbound", payload),
    onSuccess: () => {
      toast.success("Call started successfully");
      setOutboundModal(false);
      setOutboundAgent("");
      setOutboundNumber("");
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to start call");
    },
  });

  const items = (calls as any[]) ?? [];
  const totalCalls = items.length;
  const completedCalls = items.filter((c: any) => c.status === "completed").length;
  const failedCalls = items.filter((c: any) => c.status === "failed").length;
  const totalDurationSeconds = items.reduce(
    (acc: number, c: any) => acc + (c.duration_seconds || 0),
    0
  );
  const avgDurationSeconds = totalCalls
    ? Math.round(totalDurationSeconds / totalCalls)
    : 0;

  const hasActiveFilters =
    Boolean(filters.direction) ||
    Boolean(filters.status) ||
    Boolean(filters.agentId);

  return (
    <div className="animate-route-in">
      <PageHeader
        title="Calls"
        subtitle="Review recent calls. Filter by direction and status, then open the transcript for any call."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-button border border-border bg-surface p-0.5 shadow-sm">
              {[
                { id: "7", label: "7d" },
                { id: "30", label: "30d" },
                { id: "90", label: "90d" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDateRange(opt.id as "7" | "30" | "90")}
                  className={cn(
                    "px-3 py-1.5 text-label font-medium rounded-md transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-inset",
                    dateRange === opt.id
                      ? "bg-brand text-white border-0"
                      : "text-text-muted hover:text-text-primary hover:bg-background/50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setOutboundModal(true)}
            >
              <Phone size={14} className="mr-1.5" />
              New Call
            </Button>
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
            value={
              avgDurationSeconds ? formatDuration(avgDurationSeconds) : "—"
            }
            helperText={
              totalDurationSeconds
                ? `${formatDuration(totalDurationSeconds)} total`
                : undefined
            }
          />
        </div>
      )}

      <div className="w-full">
        <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/50">
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                label="All"
                isActive={!filters.direction && !filters.status && !filters.agentId}
                onClick={() => setFilters({})}
              />
              <FilterPill
                label="Inbound"
                isActive={filters.direction === "inbound"}
                onClick={() =>
                  setFilters((c) => ({ ...c, direction: "inbound" }))
                }
              />
              <FilterPill
                label="Outbound"
                isActive={filters.direction === "outbound"}
                onClick={() =>
                  setFilters((c) => ({ ...c, direction: "outbound" }))
                }
              />
              <FilterPill
                label="Completed"
                isActive={filters.status === "completed"}
                onClick={() =>
                  setFilters((c) => ({
                    ...c,
                    status: c.status === "completed" ? undefined : "completed",
                  }))
                }
              />
              <FilterPill
                label="Failed"
                isActive={filters.status === "failed"}
                onClick={() =>
                  setFilters((c) => ({
                    ...c,
                    status: c.status === "failed" ? undefined : "failed",
                  }))
                }
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSelected(null);
                }}
                className="text-label"
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-background/70 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-label uppercase tracking-wider text-text-muted">
                    Date / time
                  </th>
                  <th className="px-4 py-3 text-left text-label uppercase tracking-wider text-text-muted">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-label uppercase tracking-wider text-text-muted">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-left text-label uppercase tracking-wider text-text-muted">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-label uppercase tracking-wider text-text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-label uppercase tracking-wider text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="h-5 rounded bg-background animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : !items.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-body text-text-muted"
                    >
                      No calls yet.
                    </td>
                  </tr>
                ) : (
                  items.map((call) => {
                    const isSelected = selected?.id === call.id;
                    const direction = call.direction ?? "—";
                    const isInbound = direction === "inbound";
                    const callType = getCallType(call);
                    const createdAt = call.created_at
                      ? new Date(call.created_at)
                      : null;
                    const agentName =
                      call.metadata?.agent_name || "Unknown agent";
                    const firstLine =
                      (call.transcript?.[0]?.text as string) || "";
                    const preview =
                      firstLine.length > 80
                        ? `${firstLine.slice(0, 77)}...`
                        : firstLine;

                    return (
                      <tr
                        key={call.id}
                        className={cn(
                          "border-b border-border transition-colors",
                          isSelected ? "bg-brand/5" : "odd:bg-surface even:bg-background/30 hover:bg-background/50"
                        )}
                      >
                        <td className="px-4 py-3 text-body text-text-primary whitespace-nowrap">
                          {createdAt ? (
                            <span title={createdAt.toISOString()}>
                              {formatDistanceToNow(createdAt, {
                                addSuffix: true,
                              })}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-body font-medium text-text-primary max-w-[160px] truncate">
                          {agentName}
                        </td>
                        <td className="px-4 py-3 text-body">
                          <span className="inline-flex items-center gap-1.5 rounded-badge px-2 py-0.5 text-label font-medium border bg-surface">
                            {isInbound ? (
                              <ArrowDownLeft
                                size={14}
                                className="text-success"
                              />
                            ) : (
                              <ArrowUpRight
                                size={14}
                                className="text-info"
                              />
                            )}
                            <span className="capitalize">{direction}</span>
                            <CallTypeBadge type={callType} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-body font-medium text-text-primary">
                          {call.duration_seconds
                            ? formatDuration(call.duration_seconds)
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <CallStatusBadge status={call.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelected(call)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
      />

      <AnimatePresence>
        {outboundModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOutboundModal(false)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-surface border border-border rounded-2xl shadow-modal p-5"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <h3 className="text-section-title text-text-primary mb-4">
                New outbound call
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-label text-text-secondary mb-1.5">
                    Agent
                  </label>
                  <select
                    value={outboundAgent}
                    onChange={(e) => setOutboundAgent(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  >
                    <option value="">Select an agent</option>
                    {(agents as any[])?.map((agent: any) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-label text-text-secondary mb-1.5">
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={outboundNumber}
                    onChange={(e) => setOutboundNumber(e.target.value)}
                    placeholder="+1234567890"
                    className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setOutboundModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      if (!outboundAgent || !outboundNumber.trim()) {
                        toast.error(
                          "Select an agent and enter a phone number"
                        );
                        return;
                      }
                      outboundCall.mutate({
                        agent_id: outboundAgent,
                        to_number: outboundNumber.trim(),
                      });
                    }}
                    disabled={outboundCall.isPending}
                  >
                    {outboundCall.isPending ? "Starting…" : "Start Call"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function getCallType(call: any): "web_test" | "phone" {
  const t = call?.metadata?.type;
  if (t === "web_test") return "web_test";
  return "phone";
}

function StatCard({
  label,
  value,
  helperText,
}: {
  label: string;
  value: string;
  helperText?: string;
}) {
  return (
    <div className="bg-surface rounded-card border border-border shadow-card px-4 py-3 flex flex-col gap-0.5">
      <p className="text-label font-semibold text-text-muted uppercase tracking-wide">
        {label}
      </p>
      <p className="text-stat-number text-text-primary">{value}</p>
      {helperText && (
        <p className="text-body text-text-muted mt-0.5">{helperText}</p>
      )}
    </div>
  );
}

function FilterPill({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-button px-3 py-1.5 text-label font-medium border transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 active:scale-[0.98]",
        isActive
          ? "bg-brand text-white border-brand shadow-sm"
          : "bg-surface text-text-muted border-border hover:bg-background hover:text-text-primary hover:border-border"
      )}
    >
      {label}
    </button>
  );
}

function CallTypeBadge({ type }: { type: "web_test" | "phone" }) {
  const isTest = type === "web_test";
  const label = isTest ? "Test" : "Phone";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-medium border",
        isTest
          ? "bg-brand/10 text-brand border-brand/20"
          : "bg-success/10 text-success border-success/20"
      )}
    >
      {isTest ? <Beaker size={11} /> : <PhoneCall size={11} />}
      {label}
    </span>
  );
}

function CallDetailDrawer({
  call,
  onClose,
}: {
  call: any | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {call && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-surface border-l border-border shadow-modal flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-label text-text-muted uppercase tracking-wide mb-0.5">
                  Call details
                </p>
                <p className="text-section-title text-text-primary">
                  {call.metadata?.agent_name || "Unknown agent"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-button hover:bg-background text-text-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="rounded-card bg-brand/5 border border-border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-label text-text-muted uppercase tracking-wide mb-1">
                      {call.direction === "inbound"
                        ? "Inbound"
                        : "Outbound"}
                    </p>
                    <p className="text-body font-semibold text-text-primary flex items-center gap-1.5">
                      <Phone size={14} className="text-brand" />
                      {call.to_number || call.from_number || "Unknown"}
                    </p>
                    <p className="text-label text-text-muted mt-1">
                      From {call.from_number || "—"} to {call.to_number || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CallTypeBadge type={getCallType(call)} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <CallStatusBadge status={call.status} />
                    <div className="flex items-center gap-1.5 text-label text-text-muted">
                      <Clock size={12} />
                      {call.created_at
                        ? new Date(call.created_at).toLocaleString()
                        : "—"}
                    </div>
                    {call.duration_seconds && (
                      <span className="text-label text-text-muted">
                        Duration:{" "}
                        <span className="font-medium text-text-primary">
                          {formatDuration(call.duration_seconds)}
                        </span>
                      </span>
                    )}
                    {call.end_reason && (
                      <span className="text-label text-text-muted text-right max-w-[220px]">
                        End: {call.end_reason}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!call.transcript?.length ? (
                <div className="rounded-card bg-background/50 border border-dashed border-border py-8 flex items-center justify-center">
                  <p className="text-body text-text-muted text-center px-4">
                    No transcript available yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {call.transcript.map((turn: any, index: number) => {
                    const speaker =
                      turn.speaker ?? turn.role ?? "agent";
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex",
                          speaker === "agent"
                            ? "justify-end"
                            : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-button px-3 py-2 text-body max-w-[85%]",
                            speaker === "agent"
                              ? "bg-brand text-white"
                              : "bg-background text-text-primary border border-border"
                          )}
                        >
                          <p className="text-label opacity-80 mb-0.5 uppercase">
                            {speaker}
                          </p>
                          <p>{turn.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {call.analysis && (
                <div className="rounded-card border border-border bg-background/50 p-4 space-y-3">
                  <h3 className="text-label font-semibold uppercase tracking-wide text-text-muted">
                    Analysis
                  </h3>
                  {call.analysis.summary && (
                    <p className="text-body text-text-primary leading-relaxed">
                      {call.analysis.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {call.analysis.sentiment && (
                      <span
                        className={cn(
                          "inline-flex rounded-badge px-2.5 py-0.5 text-label font-medium border",
                          call.analysis.sentiment === "positive"
                            ? "bg-emerald-50 text-success border-emerald-200"
                            : call.analysis.sentiment === "negative"
                              ? "bg-red-50 text-error border-red-200"
                              : "bg-gray-50 text-text-muted border-gray-200"
                        )}
                      >
                        {call.analysis.sentiment}
                      </span>
                    )}
                    {call.analysis.intent && (
                      <span className="text-label text-text-muted">
                        Intent:{" "}
                        <span className="font-medium text-text-primary">
                          {call.analysis.intent}
                        </span>
                      </span>
                    )}
                    {call.analysis.outcome && (
                      <span className="text-label text-text-muted">
                        Outcome:{" "}
                        <span className="font-medium text-text-primary">
                          {call.analysis.outcome}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
