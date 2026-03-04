"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function MakeCallModal({ isOpen, onClose }: Props) {
  const qc = useQueryClient();
  const [toNumber, setToNumber] = useState("");
  const [agentId, setAgentId] = useState("");

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const makeCall = useMutation({
    mutationFn: () =>
      api.post("/v1/calls", {
        agent_id: agentId,
        to_number: toNumber,
        metadata: {},
      }),
    onSuccess: () => {
      toast.success(`Call initiated to ${toNumber}`);
      qc.invalidateQueries({ queryKey: ["calls"] });
      setToNumber("");
      setAgentId("");
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.message || "Failed to start call"),
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4"
          >
            <div
              className="bg-surface rounded-2xl shadow-modal border border-border w-full max-w-md pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <h2 className="text-section-title text-text-primary tracking-tight">
                  Make a Call
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-button text-text-muted hover:text-text-primary hover:bg-background transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-label text-text-secondary mb-1.5">
                    Phone Number to Call
                  </label>
                  <input
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                    placeholder="+12025551234"
                    className="w-full px-3 py-2.5 border border-border rounded-input text-body font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                  />
                  <p className="text-label text-text-muted mt-1">
                    Include country code. Example: +12025551234
                  </p>
                </div>

                <div>
                  <label className="block text-label text-text-secondary mb-1.5">
                    Agent
                  </label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-input text-body bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
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
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => makeCall.mutate()}
                  disabled={!toNumber || !agentId || makeCall.isPending}
                >
                  <Phone size={14} className="mr-1.5" />
                  {makeCall.isPending ? "Calling..." : "Start Call"}
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
