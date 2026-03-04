"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Phone, X } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"

import { api } from "@/lib/api"

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function MakeCallModal({ isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [toNumber, setToNumber] = useState("")
  const [agentId, setAgentId] = useState("")

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  })

  const makeCall = useMutation({
    mutationFn: () =>
      api.post("/v1/calls", {
        agent_id: agentId,
        to_number: toNumber,
        metadata: {},
      }),
    onSuccess: () => {
      toast.success(`Call initiated to ${toNumber}`)
      qc.invalidateQueries({ queryKey: ["calls"] })
      setToNumber("")
      setAgentId("")
      onClose()
    },
    onError: (err: any) =>
      toast.error(err?.message || "Failed to start call"),
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-surface rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <h2 className="text-base font-semibold text-primary tracking-tight">
                  Make a Call
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100 text-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Phone Number to Call
                  </label>
                  <input
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                    placeholder="+12025551234"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
                  />
                  <p className="text-xs text-muted mt-1">
                    Include country code. Example: +12025551234
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Agent
                  </label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-brand bg-white"
                  >
                    <option value="">Select an agent...</option>
                    {agents?.map((agent: any) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border flex gap-3">
                <button
                  type="button"
                  onClick={() => makeCall.mutate()}
                  disabled={!toNumber || !agentId || makeCall.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  <Phone size={14} />
                  {makeCall.isPending ? "Calling..." : "Start Call"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border border-border text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

