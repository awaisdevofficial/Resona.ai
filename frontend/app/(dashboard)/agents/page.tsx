"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { AgentCard } from "@/components/agents/AgentCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"
import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api } from "@/lib/api"

export default function AgentsPage() {
  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  })

  const [testingAgentId, setTestingAgentId] = useState<string | null>(null)

  const items = (agents as any[]) ?? []
  const testingAgent = items.find((a) => a.id === testingAgentId)

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Configure and manage your voice AI agents"
        actions={
          <Link href="/agents/new">
            <button className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-card">
              New Agent
            </button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-2 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-gray-100/80 animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState
          title="No agents yet"
          description="Create your first agent to start making calls."
          action={{
            label: "Create Agent",
            onClick: () => (window.location.href = "/agents/new"),
          }}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((agent) => (
            <AgentCard
              key={agent.id}
              id={agent.id}
              name={agent.name}
              description={agent.description}
              tts_voice_id={agent.tts_voice_id}
              is_active={agent.is_active}
              call_count={agent.call_count ?? 0}
              onTestCall={() => setTestingAgentId(agent.id)}
            />
          ))}
        </div>
      )}

      <TestCallPanel
        agentId={testingAgentId ?? ""}
        agentName={testingAgent?.name ?? ""}
        open={!!testingAgentId}
        onClose={() => setTestingAgentId(null)}
      />
    </div>
  )
}