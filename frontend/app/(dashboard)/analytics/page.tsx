"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Clock, DollarSign, Phone } from "lucide-react";

import { CallVolumeChart } from "@/components/analytics/CallVolumeChart";
import { MetricCard } from "@/components/analytics/MetricCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

type RangeKey = "today" | "7" | "30" | "90";

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("7");

  const { from, to } = useMemo(() => {
    const now = new Date();
    let days = 7;
    if (range === "today") days = 0;
    else if (range === "30") days = 30;
    else if (range === "90") days = 90;
    const toDate = now.toISOString();
    const fromDate = new Date(
      now.getTime() - days * 24 * 60 * 60 * 1000
    ).toISOString();
    return { from: fromDate, to: toDate };
  }, [range]);

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary", { from, to }],
    queryFn: () =>
      api.get(
        `/v1/analytics/summary?from_date=${encodeURIComponent(
          from
        )}&to_date=${encodeURIComponent(to)}`
      ),
  });

  const { data: timeSeries } = useQuery({
    queryKey: ["analytics-time", { from, to }],
    queryFn: () =>
      api.get(
        `/v1/analytics/calls-over-time?from_date=${encodeURIComponent(
          from
        )}&to_date=${encodeURIComponent(to)}`
      ),
  });

  return (
    <div className="animate-route-in">
      <PageHeader
        title="Analytics"
        subtitle="Detailed insights into your call activity"
        actions={
          <div className="inline-flex rounded-button border border-border bg-surface p-0.5 shadow-sm">
            {[
              { id: "today", label: "Today" },
              { id: "7", label: "7d" },
              { id: "30", label: "30d" },
              { id: "90", label: "90d" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id as RangeKey)}
                className={cn(
                  "px-3 py-1.5 text-label font-medium rounded-md transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-inset",
                  range === opt.id
                    ? "bg-brand text-white border-0"
                    : "text-text-muted hover:text-text-primary hover:bg-background/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
          subtitle="selected range"
        />
        <MetricCard
          title="Minutes Used"
          value={summary?.total_minutes ?? 0}
          icon={Clock}
          iconBg="bg-info/10"
          iconColor="text-info"
          subtitle="selected range"
        />
        <MetricCard
          title="Active Agents"
          value={summary?.active_agents ?? 0}
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
          subtitle="selected range"
        />
      </div>

      <div className="bg-surface rounded-card border border-border shadow-card p-6">
        <h2 className="text-section-title text-text-primary mb-4 tracking-tight">
          Call volume over time
        </h2>
        <CallVolumeChart data={(timeSeries as any[]) ?? []} />
      </div>
    </div>
  );
}
