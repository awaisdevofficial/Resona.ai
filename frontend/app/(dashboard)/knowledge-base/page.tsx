"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { Modal } from "@/components/shared/Modal";
import { PageHeader } from "@/components/shared/PageHeader";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [agentId, setAgentId] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => api.get("/v1/knowledge-base") as Promise<KBEntry[]>,
  });

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e: KBEntry) =>
        e.name.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

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
    <div className="animate-fade-in">
      <PageHeader
        title="Knowledge Base"
        subtitle="Add and manage knowledge your agents can use during calls"
        actions={
          <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add entry
          </button>
        }
      />

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60" size={18} />
        <input
          type="text"
          placeholder="Search knowledge entries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-input pl-11 w-full max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 glass-card animate-pulse" />
          ))}
        </div>
      ) : !entries.length ? (
        <EmptyState
          icon={
            <div className="w-16 h-16 rounded-2xl bg-[#4DFFCE]/10 flex items-center justify-center mx-auto">
              <BookOpen size={28} className="text-[#4DFFCE]" />
            </div>
          }
          title="No knowledge base entries"
          description="Add your first knowledge entry to help your agents answer questions."
          action={
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={16} />
              Add entry
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredEntries.map((entry: KBEntry) => (
            <div
              key={entry.id}
              className="glass-card p-5 group hover:border-[#4DFFCE]/20 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4DFFCE]/10 flex items-center justify-center">
                    <BookOpen size={18} className="text-[#4DFFCE]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">{entry.name}</h3>
                    <p className="text-xs text-white/60">
                      {entry.agent_id
                        ? agents.find((a: any) => a.id === entry.agent_id)?.name ?? "Assigned"
                        : "Not assigned"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this entry?")) remove.mutate(entry.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-sm text-white/60 line-clamp-3">{entry.content}</p>
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
    <Modal
      open={true}
      onClose={onClose}
      title="Add Knowledge"
      subtitle="Text, URL, and PDF (more sources coming soon)"
      size="lg"
      scrollable
    >
      <div className="flex gap-2 border-b border-white/10 pb-4 mb-4">
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium text-[#4DFFCE] border-b-2 border-[#4DFFCE] -mb-px"
        >
          Text
        </button>
        <button
          type="button"
          disabled
          className="px-4 py-2 text-sm font-medium text-white/70 cursor-not-allowed opacity-60"
        >
          URL
        </button>
        <button
          type="button"
          disabled
          className="px-4 py-2 text-sm font-medium text-white/70 cursor-not-allowed opacity-60"
        >
          PDF
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="form-label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product FAQ, Company Info"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste text directly..."
            rows={6}
            className="form-input resize-none"
          />
        </div>
        <div>
          <label className="form-label">Assign to agent (optional)</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="form-input"
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
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!name.trim() || !content.trim() || isPending}
          className="btn-primary flex-1"
        >
          {isPending ? "Adding..." : "Add"}
        </button>
      </div>
    </Modal>
  );
}
