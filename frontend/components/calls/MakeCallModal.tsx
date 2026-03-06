"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

interface TelephonyStatus {
  is_connected: boolean;
  phone_number: string | null;
  is_active: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function MakeCallModal({ isOpen, onClose }: Props) {
  const qc = useQueryClient();
  const [toNumber, setToNumber] = useState("");
  const [agentId, setAgentId] = useState("");

  const { data: telephonyStatus } = useQuery<TelephonyStatus>({
    queryKey: ["telephony-status"],
    queryFn: () => api.get("/v1/telephony/status"),
    enabled: isOpen,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
    enabled: isOpen,
  });

  const { data: phoneNumbers } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
    enabled: isOpen,
  });

  const importNumbers = useMutation({
    mutationFn: () => api.post("/v1/phone-numbers/import", {}),
    onSuccess: (data: any) => {
      toast.success(
        `Imported ${data.imported} number${data.imported !== 1 ? "s" : ""}. You can start a call now.`
      );
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
    },
    onError: () =>
      toast.error(
        "Failed to import. Connect Twilio in Settings first."
      ),
  });

  const makeTelephonyCall = useMutation({
    mutationFn: () =>
      api.post("/v1/telephony/call", {
        to_phone_number: toNumber.trim(),
      }),
    onSuccess: () => {
      toast.success(`Call initiated to ${toNumber}`);
      qc.invalidateQueries({ queryKey: ["calls"] });
      setToNumber("");
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ??
        (typeof err?.response?.data === "string" ? err.response.data : null) ??
        err?.message ??
        "Failed to start call";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  const makeOutboundCall = useMutation({
    mutationFn: () =>
      api.post("/v1/calls/outbound", {
        agent_id: agentId,
        to_number: toNumber.trim(),
      }),
    onSuccess: () => {
      toast.success(`Call initiated to ${toNumber}`);
      qc.invalidateQueries({ queryKey: ["calls"] });
      setToNumber("");
      setAgentId("");
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ??
        (typeof err?.response?.data === "string" ? err.response.data : null) ??
        err?.message ??
        "Failed to start call";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  const useTelephony = Boolean(
    telephonyStatus?.is_connected && telephonyStatus?.is_active
  );
  const fromNumber = agentId
    ? (phoneNumbers as any[])?.find((n: any) => n.agent_id === agentId)
    : null;
  const hasNoNumbers = !(phoneNumbers as any[])?.length;

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
              className="glass-card border-white/10 max-w-md w-full pointer-events-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Make a Call</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {useTelephony ? (
                  <>
                    <p className="text-sm text-white/70">
                      Call from your connected number{" "}
                      <span className="font-mono font-medium text-white">
                        {telephonyStatus?.phone_number ?? ""}
                      </span>
                    </p>
                    <div>
                      <label className="form-label">Phone number to call</label>
                      <input
                        value={toNumber}
                        onChange={(e) => setToNumber(e.target.value)}
                        placeholder="+12025551234"
                        className="form-input font-mono"
                      />
                      <p className="text-xs text-white/65 mt-1">
                        E.164 format with country code
                      </p>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => makeTelephonyCall.mutate()}
                        disabled={
                          !toNumber.trim() || makeTelephonyCall.isPending
                        }
                      >
                        <Phone size={16} />
                        {makeTelephonyCall.isPending ? "Calling…" : "Start Call"}
                      </Button>
                      <Button variant="secondary" onClick={onClose} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : hasNoNumbers ? (
                  <>
                    <p className="text-sm text-white/70">
                      Connect your Twilio account and phone number in Settings to
                      make and receive calls. Resona will set up everything
                      automatically.
                    </p>
                    <div className="flex flex-col gap-2 pt-4">
                      <Link href="/settings" onClick={onClose}>
                        <Button variant="primary" className="w-full">
                          Connect Twilio in Settings
                        </Button>
                      </Link>
                      <Button variant="ghost" onClick={onClose}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="form-label">Agent</label>
                      <select
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        className="form-input"
                      >
                        <option value="">Select an agent...</option>
                        {agents?.map((agent: any) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {agentId && (
                      <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                        {fromNumber ? (
                          <p className="text-sm text-white/70">
                            Calling from{" "}
                            <span className="font-mono font-medium text-white">
                              {fromNumber.number}
                            </span>
                          </p>
                        ) : (
                          <p className="text-sm text-amber-400">
                            This agent has no number assigned. Assign one in{" "}
                            <Link href="/settings" className="underline font-medium text-[#4DFFCE]">
                              Settings → Integrations
                            </Link>
                            .
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="form-label">Phone number to call</label>
                      <input
                        value={toNumber}
                        onChange={(e) => setToNumber(e.target.value)}
                        placeholder="+12025551234"
                        className="form-input font-mono"
                      />
                      <p className="text-xs text-white/65 mt-1">
                        Include country code. Example: +12025551234
                      </p>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => {
                          if (!fromNumber) {
                            toast.error(
                              "Assign a number to this agent in Settings → Integrations first."
                            );
                            return;
                          }
                          makeOutboundCall.mutate();
                        }}
                        disabled={
                          !toNumber.trim() ||
                          !agentId ||
                          !fromNumber ||
                          makeOutboundCall.isPending
                        }
                      >
                        <Phone size={16} />
                        {makeOutboundCall.isPending ? "Calling…" : "Start Call"}
                      </Button>
                      <Button variant="secondary" onClick={onClose} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
