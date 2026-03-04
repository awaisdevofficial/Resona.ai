"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

import { AgentCard } from "@/components/agents/AgentCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { TestCallPanel } from "@/components/agents/TestCallPanel";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function AgentsPage() {
  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const [search, setSearch] = useState("");
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);

  const items = (agents as any[]) ?? [];
  const filtered = search.trim()
    ? items.filter(
        (a: any) =>
          (a.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (a.description || "").toLowerCase().includes(search.toLowerCase())
      )
    : items;
  const testingAgent = items.find((a: any) => a.id === testingAgentId);

  return (
    <div className="animate-route-in">
      <PageHeader
        title="Agents"
        subtitle="Configure and manage your voice AI agents"
        actions={
          <Link href="/agents/new">
            <Button variant="primary" size="md">
              New Agent
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-card bg-surface border border-border shadow-card animate-pulse"
            />
          ))}
        </div>
      ) : !items.length ? (
        <div className="bg-surface rounded-card border border-border shadow-card">
          <EmptyState
            title="No agents yet"
            description="Create your first agent to start making calls."
            action={{
              label: "Create Agent",
              onClick: () => (window.location.href = "/agents/new"),
            }}
          />
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="search"
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-body border border-border rounded-input bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all duration-150"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent: any) => (
              <AgentCard
                key={agent.id}
                id={agent.id}
                name={agent.name}
                description={agent.description}
                tts_voice_id={agent.tts_voice_id}
                is_active={agent.is_active}
                call_count={agent.call_count ?? 0}
                system_prompt={agent.system_prompt}
                onTestCall={() => setTestingAgentId(agent.id)}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-body text-text-muted text-center py-8">
              No agents match your search.
            </p>
          )}
        </>
      )}

      <TestCallPanel
        agentId={testingAgentId ?? ""}
        agentName={testingAgent?.name ?? ""}
        open={!!testingAgentId}
        onClose={() => setTestingAgentId(null)}
      />
    </div>
  );
}
