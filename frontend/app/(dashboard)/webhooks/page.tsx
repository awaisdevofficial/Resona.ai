"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

const WEBHOOK_EVENTS = [
  "call.completed",
  "call.started",
  "call.failed",
];

type Webhook = {
  id: string;
  user_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_status: number | null;
  created_at: string;
};

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get("/v1/webhooks") as Promise<Webhook[]>,
  });

  const create = useMutation({
    mutationFn: (body: { url: string; events: string[] }) =>
      api.post("/v1/webhooks", body),
    onSuccess: () => {
      toast.success("Webhook created");
      setShowForm(false);
      setUrl("");
      setEvents([]);
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: () => toast.error("Failed to create webhook"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/webhooks/${id}`),
    onSuccess: () => {
      toast.success("Webhook deleted");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: () => toast.error("Failed to delete webhook"),
  });

  const toggleEvent = (ev: string) => {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  };

  const submit = () => {
    if (!url.trim()) {
      toast.error("URL is required");
      return;
    }
    create.mutate({ url: url.trim(), events });
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Webhooks"
        subtitle="Receive call and agent events at your endpoint"
        actions={
          <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} />
            Add webhook
          </button>
        }
      />

      <div className="glass-panel-sm p-4 mb-6 border-l-2 border-l-[#4DFFCE]/50">
        <p className="text-sm text-white/80">
          Webhooks send POST requests to your endpoint when selected events occur.
          Your endpoint should respond with a 2xx status code.
        </p>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-6 mb-6 overflow-hidden animate-fade-in"
          >
            <h3 className="text-lg font-medium text-white mb-4">New Webhook</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">Webhook URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.yourapp.com/webhooks/resona"
                  className="form-input font-mono"
                />
              </div>
              <div>
                <label className="form-label">Events</label>
                <div className="flex flex-wrap gap-2">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleEvent(ev)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                        events.includes(ev)
                          ? "bg-[#4DFFCE]/20 text-[#4DFFCE] border border-[#4DFFCE]/30"
                          : "bg-white/5 text-white/60 border border-transparent hover:bg-white/10"
                      )}
                    >
                      {events.includes(ev) && "✓ "}
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setUrl("");
                    setEvents([]);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!url.trim() || create.isPending}
                  className="btn-primary"
                >
                  <Plus size={16} />
                  {create.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-card animate-pulse" />
          ))}
        </div>
      ) : !webhooks?.length ? (
        <EmptyState
          title="No webhooks yet"
          description="Add a webhook to receive call and agent events at your endpoint."
          action={
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              Add webhook
            </button>
          }
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/70">
                    URL
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/70">
                    Events
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/70">
                    Last triggered
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/70 w-20">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide text-white/70">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => (
                  <tr
                    key={wh.id}
                    className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-white truncate max-w-xs">
                      {wh.url}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {wh.events?.map((ev) => (
                          <span
                            key={ev}
                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-[#4DFFCE]/15 text-[#4DFFCE]"
                          >
                            {ev}
                          </span>
                        ))}
                        {(!wh.events || wh.events.length === 0) && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/70">
                      {wh.last_status != null ? (
                        <span
                          className={
                            wh.last_status >= 200 && wh.last_status < 300
                              ? "text-[#4DFFCE]"
                              : "text-red-400"
                          }
                        >
                          {wh.last_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex h-2 w-2 rounded-full",
                          wh.is_active ? "bg-[#4DFFCE]" : "bg-white/40"
                        )}
                        title={wh.is_active ? "Active" : "Inactive"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this webhook? Your endpoint will no longer receive events."
                            )
                          ) {
                            remove.mutate(wh.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
