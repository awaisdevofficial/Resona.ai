"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Clock, DollarSign, Phone, Radio } from "lucide-react";

import { MetricCard } from "@/components/analytics/MetricCard";
import { CallVolumeChart } from "@/components/analytics/CallVolumeChart";
import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { MakeCallModal } from "@/components/calls/MakeCallModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api"
import { cn } from "@/components/lib-utils";

const RANGE_OPTIONS = [
  { id: "7", label: "7d" },
  { id: "30", label: "30d" },
  { id: "90", label: "90d" },
] as const;

export default function DashboardPage() {
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [range, setRange] = useState<"7" | "30" | "90">("7");

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => api.get("/v1/analytics/summary"),
  });

  const { data: timeSeries } = useQuery({
    queryKey: ["analytics-time"],
    queryFn: () => api.get("/v1/analytics/calls-over-time"),
  });

  const { data: recentCalls } = useQuery({
    queryKey: ["recent-calls"],
    queryFn: () => api.get("/v1/calls?limit=10"),
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const summaryData = summary as { total_calls?: number; total_minutes?: number; total_cost_cents?: number } | undefined;
  const timeSeriesData = (timeSeries as { date: string; count?: number; calls?: number }[]) ?? [];
  const recentCallsList = ((recentCalls as any[]) ?? []).slice(0, 5);
  const agentsList = (agents as any[]) ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your voice AI activity"
        actions={
          <>
            <Link href="/agents/new">
              <Button variant="primary" size="md" className="cursor-pointer">
                New Agent
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setCallModalOpen(true)}
            >
              <Phone size={16} />
              Make a Call
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Calls"
          value={summaryData?.total_calls ?? 0}
          icon={Phone}
          iconColor="#4DFFCE"
          trend={{ value: "+12%", positive: true }}
          subtitle="this month"
        />
        <MetricCard
          title="Minutes Used"
          value={summaryData?.total_minutes ?? 0}
          icon={Clock}
          iconColor="#60A5FA"
          subtitle="of 100 min limit"
        />
        <MetricCard
          title="Active Agents"
          value={Array.isArray(agentsList) ? agentsList.length : 0}
          icon={Bot}
          iconColor="#34D399"
          subtitle="configured"
        />
        <MetricCard
          title="Total Cost"
          value={summaryData?.total_cost_cents ?? 0}
          icon={DollarSign}
          iconColor="#FBBF24"
          format={(v) => `$${(v / 100).toFixed(2)}`}
          subtitle="this month"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-white">Call Volume</h3>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    range === opt.id
                      ? "bg-[#4DFFCE]/20 text-[#4DFFCE] border border-[#4DFFCE]/40"
                      : "text-white/70 hover:text-white border border-transparent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <CallVolumeChart data={timeSeriesData} />
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-white">Recent Calls</h3>
            <Link
              href="/calls"
              className="text-sm text-[#4DFFCE] hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight size={14} />
            </Link>
          </div>
          <p className="text-xs text-white/50 mb-3">
            Active call? Click &quot;🔴 Monitor&quot; below or on <Link href="/calls" className="text-[#4DFFCE]/80 hover:underline">Calls</Link> for live transcript.
          </p>
          <RecentCallsList calls={recentCallsList} />
        </div>
      </div>

      <MakeCallModal
        isOpen={callModalOpen}
        onClose={() => setCallModalOpen(false)}
      />
    </div>
  );
}

function RecentCallsList({ calls }: { calls: any[] }) {
  if (!calls.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-white/70">No calls yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {calls.map((call) => {
        const isActive =
          (call.status === "ringing" || call.status === "in_progress") &&
          call.livekit_room;
        return (
          <div
            key={call.id}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  call.direction === "inbound" ? "bg-blue-500/15" : "bg-purple-500/15"
                }`}
              >
                <Phone
                  size={14}
                  className={
                    call.direction === "inbound" ? "text-blue-400" : "text-purple-400"
                  }
                />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {call.agent_name ?? call.from_number ?? call.to_number ?? "—"}
                </p>
                <p className="text-xs text-white/65">
                  {call.to_number ?? call.from_number ?? call.direction ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isActive && (
                <Link
                  href={`/live-calls/${call.livekit_room}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/40 transition-colors"
                >
                  <Radio size={12} />
                  Monitor
                </Link>
              )}
              <CallStatusBadge status={call.status ?? "completed"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
