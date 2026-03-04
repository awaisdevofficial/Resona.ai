"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

const WEBHOOK_EVENTS = [
  "call.started",
  "call.ended",
  "call.transcript",
  "agent.created",
  "agent.updated",
]

type Webhook = {
  id: string
  user_id: string
  url: string
  events: string[]
  is_active: boolean
  last_status: number | null
  created_at: string
}

export default function WebhooksPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<string[]>([])

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get("/v1/webhooks") as Promise<Webhook[]>,
  })

  const create = useMutation({
    mutationFn: (body: { url: string; events: string[] }) =>
      api.post("/v1/webhooks", body),
    onSuccess: () => {
      toast.success("Webhook created")
      setShowForm(false)
      setUrl("")
      setEvents([])
      qc.invalidateQueries({ queryKey: ["webhooks"] })
    },
    onError: () => toast.error("Failed to create webhook"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/webhooks/${id}`),
    onSuccess: () => {
      toast.success("Webhook deleted")
      qc.invalidateQueries({ queryKey: ["webhooks"] })
    },
    onError: () => toast.error("Failed to delete webhook"),
  })

  const toggleEvent = (ev: string) => {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    )
  }

  const submit = () => {
    if (!url.trim()) {
      toast.error("URL is required")
      return
    }
    create.mutate({ url: url.trim(), events })
  }

  return (
    <div>
      <PageHeader
        title="Webhooks"
        subtitle="Receive call and agent events at your endpoint"
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            <Plus size={14} />
            Add webhook
          </button>
        }
      />

      <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-5 mb-6 text-sm text-blue-700 font-medium leading-relaxed">
        Configure webhooks to receive real-time notifications when calls start,
        end, or when transcripts are generated. Your endpoint must accept POST
        requests and respond with 2xx.
      </div>

      {showForm && (
        <div className="bg-surface border border-border rounded-xl shadow-card p-6 mb-6">
          <h3 className="text-base font-semibold text-primary mb-4">
            New webhook
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
                URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-server.com/webhook"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wide">
                Events
              </label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="text-primary">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!url.trim() || create.isPending}
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
              >
                {create.isPending ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setUrl("")
                  setEvents([])
                }}
                className="px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-100/80 rounded-xl animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : !webhooks?.length ? (
        <div className="bg-surface border border-border rounded-xl shadow-card p-16 text-center">
          <p className="text-base font-semibold text-primary mb-2">
            No webhooks yet
          </p>
          <p className="text-sm text-muted mb-4">
            Add a webhook to receive call and agent events at your endpoint
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            Add webhook
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  URL
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Events
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Last status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((wh) => (
                <tr
                  key={wh.id}
                  className="border-b border-border/50 last:border-0 hover:bg-gray-50/50"
                >
                  <td className="px-4 py-3 font-mono text-sm text-primary truncate max-w-xs">
                    {wh.url}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {wh.events?.length
                      ? wh.events.join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {wh.last_status != null ? (
                      <span
                        className={
                          wh.last_status >= 200 && wh.last_status < 300
                            ? "text-emerald-600"
                            : "text-red-600"
                        }
                      >
                        {wh.last_status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            "Delete this webhook? Your endpoint will no longer receive events.",
                          )
                        ) {
                          remove.mutate(wh.id)
                        }
                      }}
                      className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
