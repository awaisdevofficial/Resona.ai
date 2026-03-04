 "use client"
import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bot, Clock, DollarSign, Phone } from "lucide-react"

import { MetricCard } from "@/components/analytics/MetricCard"
import { CallVolumeChart } from "@/components/analytics/CallVolumeChart"
import { CallStatusBadge } from "@/components/calls/CallStatusBadge"
import { MakeCallModal } from "@/components/calls/MakeCallModal"
import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

export default function DashboardPage() {
  const [callModalOpen, setCallModalOpen] = useState(false)

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
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your voice AI activity"
        actions={
          <>
            <Link href="/agents/new">
              <button className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-card">
                New Agent
              </button>
            </Link>
            <button
              type="button"
              onClick={() => setCallModalOpen(true)}
              className="px-4 py-2 border border-border text-sm font-semibold text-primary rounded-xl hover:bg-gray-50 transition-colors"
            >
              Make a Call
            </button>
          </>
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
          subtitle="this month"
        />
        <MetricCard
          title="Minutes Used"
          value={summary?.total_minutes ?? 0}
          icon={Clock}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          subtitle="of 100 min limit"
        />
        <MetricCard
          title="Active Agents"
          value={Array.isArray(agents) ? agents.length : 0}
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
          subtitle="this month"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-surface rounded-xl border border-border shadow-card p-6">
          <h2 className="text-base font-semibold text-primary mb-4 tracking-tight">
            Call Volume
          </h2>
          <CallVolumeChart data={(timeSeries as any[]) ?? []} />
        </div>
        <div className="lg:col-span-2 bg-surface rounded-xl border border-border shadow-card p-6">
          <h2 className="text-base font-semibold text-primary mb-4 tracking-tight">
            Recent Calls
          </h2>
          <RecentCallsList calls={(recentCalls as any[]) ?? []} />
        </div>
      </div>
      <MakeCallModal
        isOpen={callModalOpen}
        onClose={() => setCallModalOpen(false)}
      />
    </div>
  )
}

function RecentCallsList({ calls }: { calls: any[] }) {
  if (!calls.length) {
    return (
      <p className="text-sm text-muted text-center py-8">No calls yet</p>
    )
  }
  return (
    <div className="space-y-2">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
        >
          <div>
            <p className="text-sm font-semibold text-primary">
              {call.from_number || call.to_number}
            </p>
            <p className="text-xs text-muted">{call.direction}</p>
          </div>
          <CallStatusBadge status={call.status} />
        </div>
      ))}
    </div>
  )
}

