"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

export default function PhoneNumbersPage() {
  const qc = useQueryClient()

  const { data: numbers, isLoading } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
  })

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  })

  const importNumbers = useMutation({
    mutationFn: () => api.post("/v1/phone-numbers/import", {}),
    onSuccess: (data: any) => {
      toast.success(
        `Imported ${data.imported} number${data.imported !== 1 ? "s" : ""}`,
      )
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: () =>
      toast.error(
        "Failed to import. Check your Twilio credentials in Settings.",
      ),
  })

  const assignAgent = useMutation({
    mutationFn: ({
      numberId,
      agentId,
    }: {
      numberId: string
      agentId: string | null
    }) => api.patch(`/v1/phone-numbers/${numberId}`, { agent_id: agentId }),
    onSuccess: () => {
      toast.success("Agent assigned")
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
  })

  const releaseNumber = useMutation({
    mutationFn: (numberId: string) =>
      api.delete(`/v1/phone-numbers/${numberId}`),
    onSuccess: () => {
      toast.success("Number released")
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
  })

  return (
    <div>
      <PageHeader
        title="Phone Numbers"
        subtitle="Manage numbers from your Twilio account"
        actions={
          <button
            type="button"
            onClick={() => importNumbers.mutate()}
            disabled={importNumbers.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={importNumbers.isPending ? "animate-spin" : ""}
            />
            {importNumbers.isPending ? "Importing..." : "Import from Twilio"}
          </button>
        }
      />

      <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-5 mb-6 text-sm text-blue-700 font-medium leading-relaxed">
        Connect your Twilio account in Settings, then click Import to sync your
        numbers here. Each number can be assigned to one agent — that agent will
        answer all calls to that number.
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-100/80 rounded-xl animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : !numbers?.length ? (
        <div className="bg-surface border border-border rounded-xl shadow-card p-16 text-center">
          <p className="text-base font-semibold text-primary mb-2">
            No phone numbers yet
          </p>
          <p className="text-sm text-muted mb-4">
            Add your Twilio credentials in Settings, then import your numbers
          </p>
          <button
            type="button"
            onClick={() => importNumbers.mutate()}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            Import from Twilio
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Number
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Friendly Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Assigned Agent
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {numbers?.map((num: any) => (
                <tr
                  key={num.id}
                  className="border-b border-border/50 last:border-0 hover:bg-gray-50/50"
                >
                  <td className="px-4 py-3 font-mono text-sm font-medium text-primary">
                    {num.number}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {num.friendly_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={num.agent_id || ""}
                      onChange={(e) =>
                        assignAgent.mutate({
                          numberId: num.id,
                          agentId: e.target.value || null,
                        })
                      }
                      className="text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand bg-white"
                    >
                      <option value="">No agent assigned</option>
                      {agents?.map((agent: any) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        // eslint-disable-next-line no-restricted-globals
                        if (
                          confirm(
                            `Release ${num.number}? This cannot be undone.`,
                          )
                        ) {
                          releaseNumber.mutate(num.id)
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

