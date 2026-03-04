"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
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
    <div className="animate-route-in">
      <PageHeader
        title="Webhooks"
        subtitle="Receive call and agent events at your endpoint"
        actions={
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-1.5" />
            Add webhook
          </Button>
        }
      />

      <div className="bg-info/10 border border-info/20 rounded-card p-5 mb-6 text-body text-info font-medium leading-relaxed">
        Configure webhooks to receive real-time notifications when calls start,
        end, or when transcripts are generated. Your endpoint must accept POST
        requests and respond with 2xx.
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface border border-border rounded-card shadow-card p-6 mb-6 overflow-hidden"
          >
            <h3 className="text-section-title text-text-primary mb-4">
              New webhook
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-label text-text-secondary mb-1.5">
                  URL
                </label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-3 py-2.5 border border-border rounded-input text-body font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-label text-text-secondary mb-2">
                  Events
                </label>
                <div className="flex flex-wrap gap-3">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label
                      key={ev}
                      className="flex items-center gap-2 text-body cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={events.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                        className="rounded border-border text-brand focus:ring-brand/30"
                      />
                      <span className="text-text-primary">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  onClick={submit}
                  disabled={!url.trim() || create.isPending}
                >
                  {create.isPending ? "Creating..." : "Create"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false);
                    setUrl("");
                    setEvents([]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-card bg-surface border border-border shadow-card animate-pulse"
            />
          ))}
        </div>
      ) : !webhooks?.length ? (
        <div className="bg-surface rounded-card border border-border shadow-card">
          <EmptyState
            title="No webhooks yet"
            description="Add a webhook to receive call and agent events at your endpoint."
            action={{
              label: "Add webhook",
              onClick: () => setShowForm(true),
            }}
          />
        </div>
      ) : (
        <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    URL
                  </th>
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Events
                  </th>
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Last triggered
                  </th>
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted w-20">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => (
                  <tr
                    key={wh.id}
                    className="border-b border-border last:border-0 hover:bg-background/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-body text-text-primary truncate max-w-xs">
                      {wh.url}
                    </td>
                    <td className="px-4 py-3 text-body">
                      <div className="flex flex-wrap gap-1">
                        {wh.events?.map((ev) => (
                          <span
                            key={ev}
                            className="inline-flex rounded-badge px-2 py-0.5 text-label font-medium bg-brand/10 text-brand border border-brand/20"
                          >
                            {ev}
                          </span>
                        ))}
                        {(!wh.events || wh.events.length === 0) && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-label text-text-muted">
                      {wh.last_status != null ? (
                        <span
                          className={
                            wh.last_status >= 200 && wh.last_status < 300
                              ? "text-success"
                              : "text-error"
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
                          wh.is_active ? "bg-success" : "bg-text-muted"
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
                        className="p-1.5 rounded-button text-text-muted hover:text-error hover:bg-red-50 transition-colors"
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
