"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

export default function PhoneNumbersPage() {
  const qc = useQueryClient();

  const { data: numbers, isLoading } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
  });

  const importNumbers = useMutation({
    mutationFn: () => api.post("/v1/phone-numbers/import", {}),
    onSuccess: (data: any) => {
      toast.success(
        `Imported ${data.imported} number${data.imported !== 1 ? "s" : ""}`
      );
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
    },
    onError: () =>
      toast.error(
        "Failed to import. Check your Twilio credentials in Settings."
      ),
  });

  const assignAgent = useMutation({
    mutationFn: ({
      numberId,
      agentId,
    }: {
      numberId: string;
      agentId: string | null;
    }) => api.patch(`/v1/phone-numbers/${numberId}`, { agent_id: agentId }),
    onSuccess: () => {
      toast.success("Agent assigned");
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
    },
  });

  const releaseNumber = useMutation({
    mutationFn: (numberId: string) =>
      api.delete(`/v1/phone-numbers/${numberId}`),
    onSuccess: () => {
      toast.success("Number released");
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
    },
    onError: () => toast.error("Failed to release number"),
  });

  return (
    <div className="animate-route-in">
      <PageHeader
        title="Phone Numbers"
        subtitle="Manage numbers from your Twilio account. Assign an agent to each number."
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => importNumbers.mutate()}
            disabled={importNumbers.isPending}
          >
            <RefreshCw
              size={14}
              className={cn("mr-1.5", importNumbers.isPending && "animate-spin")}
            />
            {importNumbers.isPending ? "Importing..." : "Import from Twilio"}
          </Button>
        }
      />

      <div className="bg-info/10 border border-info/20 rounded-card p-5 mb-6 text-body text-info font-medium leading-relaxed">
        Connect your Twilio account in Settings, then click Import to sync your
        numbers. Each number can be assigned to one agent — that agent will
        answer all calls to that number.
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-card bg-surface border border-border shadow-card animate-pulse"
            />
          ))}
        </div>
      ) : !numbers?.length ? (
        <div className="bg-surface rounded-card border border-border shadow-card">
          <EmptyState
            title="No phone numbers yet"
            description="Add your Twilio credentials in Settings, then import your numbers."
            action={{
              label: "Import from Twilio",
              onClick: () => importNumbers.mutate(),
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
                    Number
                  </th>
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Friendly Name
                  </th>
                  <th className="text-left px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Assigned Agent
                  </th>
                  <th className="text-right px-4 py-3 text-label uppercase tracking-wide text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {numbers?.map((num: any) => (
                  <tr
                    key={num.id}
                    className="border-b border-border last:border-0 hover:bg-background/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-body font-medium text-text-primary">
                      {num.number}
                    </td>
                    <td className="px-4 py-3 text-body text-text-secondary">
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
                        className="text-body border border-border rounded-input px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-surface min-w-[180px]"
                      >
                        <option value="">No agent assigned</option>
                        {agents?.map((agent: any) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              `Release ${num.number}? This cannot be undone.`
                            )
                          ) {
                            releaseNumber.mutate(num.id);
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
