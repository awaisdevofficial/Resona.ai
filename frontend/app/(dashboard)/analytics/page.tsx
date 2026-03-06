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

  const summaryData = summary as { total_calls?: number; total_minutes?: number; active_agents?: number; total_cost_cents?: number } | undefined;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Detailed insights into your call activity"
        actions={
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
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
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Calls"
          value={summaryData?.total_calls ?? 0}
          icon={Phone}
          iconColor="#4DFFCE"
          trend={{ value: "+12%", positive: true }}
          subtitle="selected range"
        />
        <MetricCard
          title="Minutes Used"
          value={summaryData?.total_minutes ?? 0}
          icon={Clock}
          iconColor="#60A5FA"
          subtitle="selected range"
        />
        <MetricCard
          title="Active Agents"
          value={summaryData?.active_agents ?? 0}
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
          subtitle="selected range"
        />
      </div>

      <div className="glass-card p-6">
        <h2 className="text-lg font-medium text-white mb-4 tracking-tight">
          Call volume over time
        </h2>
        <CallVolumeChart data={(timeSeries as any[]) ?? []} />
      </div>
    </div>
  );
}
