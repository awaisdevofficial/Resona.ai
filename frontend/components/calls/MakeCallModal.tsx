"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Modal } from "@/components/shared/Modal";
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

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
    enabled: isOpen,
  });

  const { data: phoneNumbers = [] } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
    enabled: isOpen,
  });

  const makeOutboundCall = useMutation({
    mutationFn: (payload: { agent_id: string; to_number: string }) =>
      api.post("/v1/calls/outbound", payload),
    onSuccess: (_, variables) => {
      toast.success(`Call initiated to ${variables.to_number}`);
      qc.invalidateQueries({ queryKey: ["calls"] });
      setToNumber("");
      setAgentId("");
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.message ??
        (typeof err?.response?.data?.detail === "string"
          ? err.response?.data?.detail
          : "Failed to start call");
      toast.error(msg);
    },
  });

  const agentsList = (agents as any[]) ?? [];
  const numbersList = (phoneNumbers as any[]) ?? [];
  const fromNumber = agentId
    ? numbersList.find((n: any) => n.agent_id === agentId)
    : null;

  const handleStartCall = () => {
    const num = toNumber.trim();
    if (!num) {
      toast.error("Enter a phone number to call");
      return;
    }
    if (!agentId) {
      toast.error("Select an agent");
      return;
    }
    if (!fromNumber) {
      toast.error(
        "This agent has no phone number. Assign one in Settings → Integrations."
      );
      return;
    }
    makeOutboundCall.mutate({ agent_id: agentId, to_number: num });
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Make a Call"
      subtitle="Choose an agent and enter the number to call"
      size="md"
    >
      <div className="space-y-4">
        {agentsList.length === 0 ? (
          <p className="text-sm text-white/70 py-2">
            Create an agent first in{" "}
            <Link href="/agents/new" className="text-[#4DFFCE] hover:underline">
              Agents
            </Link>
            .
          </p>
        ) : (
          <>
            <div>
              <label className="form-label">Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="form-input w-full"
              >
                <option value="">Select an agent...</option>
                {agentsList.map((agent: any) => (
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
                    No number assigned to this agent.{" "}
                    <Link
                      href="/settings"
                      className="underline font-medium text-[#4DFFCE]"
                    >
                      Settings → Integrations
                    </Link>{" "}
                    to add or assign a number.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="form-label">Number to call</label>
              <input
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                placeholder="+12025551234"
                className="form-input w-full font-mono"
              />
              <p className="text-xs text-white/65 mt-1">
                Include country code (e.g. +233...)
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleStartCall}
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

        <p className="text-xs text-white/50 pt-2 border-t border-white/10">
          Need to connect a phone account?{" "}
          <Link href="/settings" className="text-[#4DFFCE]/80 hover:underline">
            Settings → Integrations
          </Link>
        </p>
      </div>
    </Modal>
  );
}
