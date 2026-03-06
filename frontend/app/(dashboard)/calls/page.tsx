"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import Link from "next/link";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
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

  const { data: phoneNumbers, isLoading: phoneNumbersLoading } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
  });

  const { data: telephonyStatus } = useQuery({
    queryKey: ["telephony-status"],
    queryFn: () => api.get("/v1/telephony/status"),
  });

  const importNumbers = useMutation({
    mutationFn: () => api.post("/v1/phone-numbers/import", {}),
    onSuccess: (data: any) => {
      toast.success(
        `Imported ${data.imported} number${data.imported !== 1 ? "s" : ""}. You can start a call now.`
      );
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
    },
    onError: () =>
      toast.error(
        "Failed to import. Add your Twilio credentials in Settings first."
      ),
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

  const hasActiveFilters =
    Boolean(filters.direction) ||
    Boolean(filters.status) ||
    Boolean(filters.agentId);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Calls"
        subtitle="Review recent calls. Filter by direction and status, then open the transcript for any call."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
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
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    dateRange === opt.id
                      ? "bg-[#4DFFCE]/20 text-[#4DFFCE] border border-[#4DFFCE]/40"
                      : "text-white/70 hover:text-white border border-transparent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOutboundModal(true)}
              className="btn-primary"
            >
              <Phone size={16} />
              New Call
            </button>
          </div>
        }
      />

      {!phoneNumbersLoading && !telephonyStatus?.is_connected && !(phoneNumbers as any[])?.length && (
        <div className="glass-panel-sm p-4 mb-6 border-l-2 border-l-amber-500/50 text-sm text-amber-400">
          <p className="font-medium mb-1">Connect your phone number</p>
          <p className="text-white/60">
            To make and receive calls, connect your Twilio account and number in{" "}
            <Link href="/settings" className="underline font-medium text-[#4DFFCE] hover:no-underline">
              Settings → Integrations
            </Link>
            . Resona will set up the SIP trunk and routing automatically.
          </p>
        </div>
      )}

      <div className="w-full">
        <div className="glass-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
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
              <button
                type="button"
                onClick={() => {
                  setFilters({});
                  setSelected(null);
                }}
                className="btn-ghost text-xs"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/70">
                    Date / time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/70">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/70">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/70">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/70">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/70">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.06]">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="h-5 rounded bg-white/10 animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : !items.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-white/70"
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
                          "border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]",
                          isSelected && "bg-[#4DFFCE]/5"
                        )}
                      >
                        <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
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
                        <td className="px-4 py-3 text-sm font-medium text-white max-w-[160px] truncate">
                          {agentName}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-white/10 text-white/80">
                            {isInbound ? (
                              <ArrowDownLeft size={14} className="text-[#4DFFCE]" />
                            ) : (
                              <ArrowUpRight size={14} className="text-[#60A5FA]" />
                            )}
                            <span className="capitalize">{direction}</span>
                            <CallTypeBadge type={callType} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {call.duration_seconds
                            ? formatDuration(call.duration_seconds)
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <CallStatusBadge status={call.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelected(call)}
                            className="btn-secondary text-sm py-1.5 px-3"
                          >
                            View
                          </button>
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-sm glass-card p-5 pointer-events-auto"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
              >
              <h3 className="text-lg font-semibold text-white mb-4">
                New outbound call
              </h3>

              {!phoneNumbers?.length ? (
                <div className="space-y-4">
                  <p className="text-sm text-white/70">
                    Import your own number first to make and receive calls.
                    Add Twilio credentials in Settings, then import your numbers.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => importNumbers.mutate()}
                      disabled={importNumbers.isPending}
                    >
                      {importNumbers.isPending ? "Importing…" : "Import from Twilio"}
                    </button>
                    <Link href="/settings" onClick={() => setOutboundModal(false)}>
                      <button type="button" className="btn-secondary w-full">
                        Go to Settings → Integrations
                      </button>
                    </Link>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="button" className="btn-ghost" onClick={() => setOutboundModal(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Agent</label>
                      <select
                        value={outboundAgent}
                        onChange={(e) => setOutboundAgent(e.target.value)}
                        className="form-input"
                      >
                        <option value="">Select an agent</option>
                        {(agents as any[])?.map((agent: any) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {outboundAgent && (() => {
                      const fromNumber = (phoneNumbers as any[])?.find(
                        (n: any) => n.agent_id === outboundAgent
                      );
                      return (
                        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                          {fromNumber ? (
                            <p className="text-sm text-white/70">
                              Calling from{" "}
                              <span className="font-mono font-medium text-white">
                                {fromNumber.number}
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-amber-400">
                              This agent has no number assigned. Assign one in{" "}
                              <Link href="/settings" className="underline font-medium text-[#4DFFCE]">
                                Settings → Integrations
                              </Link>
                              .
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <label className="form-label">Phone number to call</label>
                      <input
                        type="tel"
                        value={outboundNumber}
                        onChange={(e) => setOutboundNumber(e.target.value)}
                        placeholder="+1234567890"
                        className="form-input"
                      />
                      <p className="text-xs text-white/65 mt-1">
                        Include country code (e.g. +12025551234)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      onClick={() => setOutboundModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      onClick={() => {
                        if (!outboundAgent || !outboundNumber.trim()) {
                          toast.error(
                            "Select an agent and enter a phone number"
                          );
                          return;
                        }
                        const fromNumber = (phoneNumbers as any[])?.find(
                          (n: any) => n.agent_id === outboundAgent
                        );
                        if (!fromNumber) {
                          toast.error(
                            "Assign a number to this agent in Settings → Integrations first."
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
                    </button>
                  </div>
                </>
              )}
              </motion.div>
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
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
        isActive
          ? "bg-[#4DFFCE]/20 text-[#4DFFCE] border border-[#4DFFCE]/40"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-transparent"
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        isTest
          ? "bg-[#4DFFCE]/15 text-[#4DFFCE]"
          : "bg-emerald-500/15 text-emerald-400"
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
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    if (!call) return;
    setIsEntering(true);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntering(false));
    });
    return () => cancelAnimationFrame(t);
  }, [call?.id]);

  if (!call || typeof document === "undefined") return null;

  const open = true;
  const overlay = (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-300 ease-out",
          "bg-black/40 backdrop-blur-[4px]",
          "opacity-100 pointer-events-auto"
        )}
        aria-label="Close call details"
      />
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full max-w-[420px] min-w-0 h-screen min-h-screen",
          "bg-[#0B0D10] border-l border-white/10 shadow-[-8px_0_32px_rgba(0,0,0,0.5)]",
          "transition-[transform,opacity] duration-350 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
          open && !isEntering ? "translate-x-0 opacity-100" : "translate-x-full opacity-95"
        )}
      >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-xs text-white/70 uppercase tracking-wide mb-0.5">
                  Call details
                </p>
                <p className="text-base font-semibold text-white">
                  {call.metadata?.agent_name || "Unknown agent"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="rounded-xl bg-[#4DFFCE]/5 border border-[#4DFFCE]/20 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/70 uppercase tracking-wide mb-1">
                      {call.direction === "inbound" ? "Inbound" : "Outbound"}
                    </p>
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Phone size={14} className="text-[#4DFFCE]" />
                      {call.to_number || call.from_number || "Unknown"}
                    </p>
                    <p className="text-xs text-white/70 mt-1">
                      From {call.from_number || "—"} to {call.to_number || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CallTypeBadge type={getCallType(call)} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <CallStatusBadge status={call.status} />
                    <div className="flex items-center gap-1.5 text-xs text-white/70">
                      <Clock size={12} />
                      {call.created_at
                        ? new Date(call.created_at).toLocaleString()
                        : "—"}
                    </div>
                    {call.duration_seconds && (
                      <span className="text-xs text-white/70">
                        Duration:{" "}
                        <span className="font-medium text-white">
                          {formatDuration(call.duration_seconds)}
                        </span>
                      </span>
                    )}
                    {call.end_reason && (
                      <span className="text-xs text-white/70 text-right max-w-[220px]">
                        End: {call.end_reason}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!call.transcript?.length ? (
                <div className="rounded-xl bg-white/5 border border-dashed border-white/10 py-8 flex items-center justify-center">
                  <p className="text-sm text-white/70 text-center px-4">
                    No transcript available yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {call.transcript.map((turn: any, index: number) => {
                    const speaker = turn.speaker ?? turn.role ?? "agent";
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex",
                          speaker === "agent" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-xl px-3 py-2 text-sm max-w-[85%]",
                            speaker === "agent"
                              ? "bg-[#4DFFCE] text-[#07080A]"
                              : "bg-white/10 text-white border border-white/10"
                          )}
                        >
                          <p className="text-xs opacity-80 mb-0.5 uppercase">
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
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/70">
                    Analysis
                  </h3>
                  {call.analysis.summary && (
                    <p className="text-sm text-white leading-relaxed">
                      {call.analysis.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {call.analysis.sentiment && (
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          call.analysis.sentiment === "positive"
                            ? "bg-[#4DFFCE]/15 text-[#4DFFCE]"
                            : call.analysis.sentiment === "negative"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-white/10 text-white/60"
                        )}
                      >
                        {call.analysis.sentiment}
                      </span>
                    )}
                    {call.analysis.intent && (
                      <span className="text-xs text-white/70">
                        Intent:{" "}
                        <span className="font-medium text-white">
                          {call.analysis.intent}
                        </span>
                      </span>
                    )}
                    {call.analysis.outcome && (
                      <span className="text-xs text-white/70">
                        Outcome:{" "}
                        <span className="font-medium text-white">
                          {call.analysis.outcome}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}
