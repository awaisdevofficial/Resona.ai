"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

type KBEntry = {
  id: string;
  name: string;
  content: string;
  agent_id: string | null;
  source_type: string;
  created_at: string;
};

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [agentId, setAgentId] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => api.get("/v1/knowledge-base") as Promise<KBEntry[]>,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents") as Promise<{ id: string; name: string }[]>,
  });

  const create = useMutation({
    mutationFn: (body: { name: string; content: string; agent_id?: string | null }) =>
      api.post("/v1/knowledge-base", {
        name: body.name,
        content: body.content,
        ...(body.agent_id ? { agent_id: body.agent_id } : {}),
      }),
    onSuccess: () => {
      toast.success("Knowledge base entry created");
      setAddOpen(false);
      setName("");
      setContent("");
      setAgentId("");
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
    onError: () => toast.error("Failed to create"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/knowledge-base/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });

  const submit = () => {
    if (!name.trim() || !content.trim()) {
      toast.error("Name and content are required");
      return;
    }
    create.mutate({
      name: name.trim(),
      content: content.trim(),
      agent_id: agentId || undefined,
    });
  };

  return (
    <div className="animate-route-in">
      <PageHeader
        title="Knowledge Base"
        subtitle="Add and manage knowledge your agents can use during calls"
        actions={
          <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            Add entry
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-card bg-surface border border-border shadow-card animate-pulse"
            />
          ))}
        </div>
      ) : !entries.length ? (
        <div className="bg-surface rounded-card border border-border shadow-card">
          <EmptyState
            icon={
              <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center shadow-card">
                <BookOpen size={28} className="text-brand" />
              </div>
            }
            title="No knowledge base entries"
            description="Add text content that your agents can use to answer questions."
            action={{
              label: "Add entry",
              onClick: () => setAddOpen(true),
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-surface rounded-card border border-border shadow-card p-5 hover:-translate-y-0.5 hover:shadow-dropdown transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                  <BookOpen size={18} className="text-brand" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this entry?")) remove.mutate(entry.id);
                  }}
                  className="p-1.5 rounded-button text-text-muted hover:text-error hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <h3 className="text-section-title text-text-primary mt-3 truncate">
                {entry.name}
              </h3>
              <p className="text-body text-text-secondary line-clamp-2 mt-1">
                {entry.content}
              </p>
              <p className="text-label text-text-muted mt-3">
                {entry.agent_id
                  ? agents.find((a: any) => a.id === entry.agent_id)?.name ?? "Assigned"
                  : "Not assigned"}
              </p>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddKnowledgeModal
          name={name}
          setName={setName}
          content={content}
          setContent={setContent}
          agentId={agentId}
          setAgentId={setAgentId}
          agents={agents}
          onClose={() => setAddOpen(false)}
          onSubmit={submit}
          isPending={create.isPending}
        />
      )}
    </div>
  );
}

function AddKnowledgeModal({
  name,
  setName,
  content,
  setContent,
  agentId,
  setAgentId,
  agents,
  onClose,
  onSubmit,
  isPending,
}: {
  name: string;
  setName: (s: string) => void;
  content: string;
  setContent: (s: string) => void;
  agentId: string;
  setAgentId: (s: string) => void;
  agents: any[];
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-surface rounded-2xl border border-border shadow-modal p-6">
        <h3 className="text-section-title text-text-primary mb-4">
          Add knowledge
        </h3>
        <div className="flex gap-2 border-b border-border mb-4">
          <button
            type="button"
            className="px-4 py-2 text-label font-medium text-brand border-b-2 border-brand -mb-px"
          >
            Text
          </button>
          <button
            type="button"
            disabled
            className="px-4 py-2 text-label font-medium text-text-muted cursor-not-allowed opacity-60"
          >
            URL
          </button>
          <button
            type="button"
            disabled
            className="px-4 py-2 text-label font-medium text-text-muted cursor-not-allowed opacity-60"
          >
            PDF
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-label text-text-secondary mb-1.5">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product FAQ"
              className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
            />
          </div>
          <div>
            <label className="block text-label text-text-secondary mb-1.5">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste or type content..."
              rows={6}
              className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-label text-text-secondary mb-1.5">
              Assign to agent (optional)
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              <option value="">No agent</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!name.trim() || !content.trim() || isPending}
            className="flex-1"
          >
            {isPending ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </>
  );
}
