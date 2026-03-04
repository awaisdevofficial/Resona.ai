 "use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bot, Clock, DollarSign, Phone } from "lucide-react"

import { CallVolumeChart } from "@/components/analytics/CallVolumeChart"
import { MetricCard } from "@/components/analytics/MetricCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

type RangeKey = "today" | "7" | "30" | "90"

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("7")

  const { from, to } = useMemo(() => {
    const now = new Date()
    let days = 7
    if (range === "today") days = 0
    else if (range === "30") days = 30
    else if (range === "90") days = 90
    const toDate = now.toISOString()
    const fromDate = new Date(
      now.getTime() - days * 24 * 60 * 60 * 1000,
    ).toISOString()
    return { from: fromDate, to: toDate }
  }, [range])

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary", { from, to }],
    queryFn: () =>
      api.get(
        `/v1/analytics/summary?from_date=${encodeURIComponent(
          from,
        )}&to_date=${encodeURIComponent(to)}`,
      ),
  })

  const { data: timeSeries } = useQuery({
    queryKey: ["analytics-time", { from, to }],
    queryFn: () =>
      api.get(
        `/v1/analytics/calls-over-time?from_date=${encodeURIComponent(
          from,
        )}&to_date=${encodeURIComponent(to)}`,
      ),
  })

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Detailed insights into your call activity"
        actions={
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-card">
            {[
              { id: "today", label: "Today" },
              { id: "7", label: "Last 7 days" },
              { id: "30", label: "Last 30 days" },
              { id: "90", label: "Last 90 days" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id as RangeKey)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  range === opt.id
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <MetricCard
          title="Total Calls"
          value={summary?.total_calls ?? 0}
          icon={Phone}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          trend={{ value: "+12%", positive: true }}
          subtitle="selected range"
        />
        <MetricCard
          title="Minutes Used"
          value={summary?.total_minutes ?? 0}
          icon={Clock}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          subtitle="selected range"
        />
        <MetricCard
          title="Active Agents"
          value={summary?.active_agents ?? 0}
          icon={Bot}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          subtitle="configured"
        />
        <MetricCard
          title="Total Cost"
          value={summary?.total_cost_cents ?? 0}
          icon={DollarSign}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          format={(v) => `$${(v / 100).toFixed(2)}`}
          subtitle="selected range"
        />
      </div>

      <div className="bg-surface rounded-xl border border-border shadow-card p-6">
        <h2 className="text-base font-semibold text-primary mb-4 tracking-tight">
          Call volume over time
        </h2>
        <CallVolumeChart data={(timeSeries as any[]) ?? []} />
      </div>
    </div>
  )
}

