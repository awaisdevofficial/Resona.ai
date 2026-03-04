"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Clock, DollarSign, Phone } from "lucide-react";

import { MetricCard } from "@/components/analytics/MetricCard";
import { CallVolumeChart } from "@/components/analytics/CallVolumeChart";
import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { MakeCallModal } from "@/components/calls/MakeCallModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

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
  })

  const { data: timeSeries } = useQuery({
    queryKey: ["analytics-time"],
    queryFn: () => api.get("/v1/analytics/calls-over-time"),
  })

  const { data: recentCalls } = useQuery({
    queryKey: ["recent-calls"],
    queryFn: () => api.get("/v1/calls?limit=10"),
  })

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  })

  return (
    <div className="animate-route-in">
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
              Make a Call
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <MetricCard
          title="Total Calls"
          value={summary?.total_calls ?? 0}
          icon={Phone}
          iconBg="bg-brand/10"
          iconColor="text-brand"
          trend={{ value: "+12%", positive: true }}
          subtitle="this month"
        />
        <MetricCard
          title="Minutes Used"
          value={summary?.total_minutes ?? 0}
          icon={Clock}
          iconBg="bg-info/10"
          iconColor="text-info"
          subtitle="of 100 min limit"
        />
        <MetricCard
          title="Active Agents"
          value={Array.isArray(agents) ? agents.length : 0}
          icon={Bot}
          iconBg="bg-success/10"
          iconColor="text-success"
          subtitle="configured"
        />
        <MetricCard
          title="Total Cost"
          value={summary?.total_cost_cents ?? 0}
          icon={DollarSign}
          iconBg="bg-warning/10"
          iconColor="text-warning"
          format={(v) => `$${(v / 100).toFixed(2)}`}
          subtitle="this month"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-surface rounded-card border border-border shadow-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-section-title text-text-primary tracking-tight">
              Call Volume
            </h2>
            <div className="flex rounded-button border border-border bg-surface p-0.5 shadow-sm">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={`px-3 py-1.5 text-label font-medium rounded-md transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-inset ${
                    range === opt.id
                      ? "bg-brand text-white border-0"
                      : "text-text-muted hover:text-text-primary hover:bg-background/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <CallVolumeChart data={(timeSeries as any[]) ?? []} />
        </div>
        <div className="lg:col-span-2 bg-surface rounded-card border border-border shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-section-title text-text-primary tracking-tight">
              Recent Calls
            </h2>
            <Link
              href="/calls"
              className="text-label font-medium text-brand hover:text-brand-dark transition-colors"
            >
              View all →
            </Link>
          </div>
          <RecentCallsList calls={((recentCalls as any[]) ?? []).slice(0, 5)} />
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
        <p className="text-body text-text-muted">No calls yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-0">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex items-center justify-between py-3 px-2 -mx-2 rounded-button border-b border-border last:border-0 hover:bg-background transition-colors"
        >
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary truncate">
              {call.from_number || call.to_number || "—"}
            </p>
            <p className="text-label text-text-muted">{call.direction ?? "—"}</p>
          </div>
          <CallStatusBadge status={call.status} />
        </div>
      ))}
    </div>
  );
}
