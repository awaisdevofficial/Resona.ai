"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, Plus, Search, Bot } from "lucide-react";

import { AgentCard } from "@/components/agents/AgentCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { TestCallPanel } from "@/components/agents/TestCallPanel";
import { api } from "@/lib/api";

export default function AgentsPage() {
  const { data: agents, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.get("/v1/voices") as Promise<{ id: string; name: string }[]>,
    enabled: !isLoading && !!((agents as any[])?.length > 0),
  });

  const voiceNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (voices as { id: string; name: string }[]).forEach((v) => {
      map[v.id] = v.name;
    });
    return map;
  }, [voices]);

  const [search, setSearch] = useState("");
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);

  const items = (agents as any[]) ?? [];
  const filtered = search.trim()
    ? items.filter(
        (a: any) =>
          (a.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (a.description || "").toLowerCase().includes(search.toLowerCase()) ||
          (a.system_prompt || "").toLowerCase().includes(search.toLowerCase())
      )
    : items;
  const testingAgent = items.find((a: any) => a.id === testingAgentId);

  return (
    <div className="animate-fade-in">
      {/* Hero header */}
      <div className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4DFFCE]/10 border border-[#4DFFCE]/20">
                <Bot className="h-5 w-5 text-[#4DFFCE]" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Agents
                </h1>
                <p className="text-sm text-white/60 mt-0.5">
                  Voice AI agents that handle your calls
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/documentation"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-all"
            >
              <BookOpen size={16} />
              Docs
            </Link>
            <Link
              href="/agents/new"
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl"
            >
              <Plus size={18} />
              New Agent
            </Link>
          </div>
        </div>
      </div>

      {isError && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-300">
            Failed to load agents. {(error as Error)?.message || "Please try again."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search bar */}
      {items.length > 0 && (
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/50 pointer-events-none"
              strokeWidth={2}
            />
            <input
              type="text"
              placeholder="Search by name, description, or prompt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-12 pr-4 py-3.5 rounded-2xl w-full text-white placeholder:text-white/40"
              aria-label="Search agents"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-white/10 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-5 w-32 rounded-lg bg-white/10 animate-pulse" />
                      <div className="h-3 w-20 rounded bg-white/5 animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mb-5">
                  <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
                </div>
                <div className="flex gap-3 mt-4">
                  <div className="h-10 flex-1 rounded-xl bg-white/10 animate-pulse" />
                  <div className="h-10 flex-1 rounded-xl bg-white/5 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-[#4DFFCE]/20 bg-[#4DFFCE]/5">
              <Bot className="h-10 w-10 text-[#4DFFCE]" />
            </div>
          }
          title={items.length === 0 ? "No agents yet" : "No matching agents"}
          description={
            items.length === 0
              ? "Create your first voice AI agent to start handling calls."
              : "Try a different search term or clear the search."
          }
          action={
            items.length === 0 ? (
              <Link href="/agents/new" className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold">
                <Plus size={18} />
                Create your first agent
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="btn-secondary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl"
              >
                Clear search
              </button>
            )
          }
          className="py-16"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((agent: any) => (
            <AgentCard
              key={agent.id}
              id={agent.id}
              name={agent.name}
              description={agent.description}
              tts_voice_id={agent.tts_voice_id}
              voiceName={agent.tts_voice_id ? voiceNameById[agent.tts_voice_id] : undefined}
              is_active={agent.is_active}
              call_count={agent.call_count ?? 0}
              system_prompt={agent.system_prompt}
              onTestCall={() => setTestingAgentId(agent.id)}
            />
          ))}
        </div>
      )}

      {/* Test Call panel — only mount when user clicks "Test" on a card */}
      {testingAgentId && (
        <TestCallPanel
          agentId={testingAgentId}
          agentName={testingAgent?.name ?? ""}
          open={true}
          onClose={() => setTestingAgentId(null)}
        />
      )}
    </div>
  );
}
