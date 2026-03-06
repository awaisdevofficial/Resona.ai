 "use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Eye, EyeOff, Phone, RefreshCw, Trash2, XCircle } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"
import { cn } from "@/components/lib-utils"

type Tab = "integrations" | "api-keys" | "profile" | "billing"

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("integrations")

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Manage your account and integrations"
      />

      <div className="flex gap-1 mb-8 p-1 rounded-lg bg-white/5 border-b-0">
        {[
          { id: "integrations", label: "Integrations" },
          { id: "api-keys", label: "API Keys" },
          { id: "profile", label: "Profile" },
          { id: "billing", label: "Billing" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as Tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium rounded-md border-b-2 transition-colors",
              tab === t.id
                ? "bg-white/10 text-white border-[#4DFFCE]"
                : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "integrations" && <IntegrationsTab />}
      {tab === "api-keys" && <ApiKeysTab />}
      {tab === "profile" && <ProfileTab />}
      {tab === "billing" && <BillingTab />}
    </div>
  )
}

interface TelephonyStatus {
  is_connected: boolean
  phone_number: string | null
  inbound_trunk_id: string | null
  outbound_trunk_id: string | null
  dispatch_rule_id: string | null
  is_active: boolean
  assigned_agent_id: string | null
}

function IntegrationsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [accountSid, setAccountSid] = useState("")
  const [authToken, setAuthToken] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [showToken, setShowToken] = useState(false)

  const { data: status } = useQuery<TelephonyStatus>({
    queryKey: ["telephony-status"],
    queryFn: () => api.get("/v1/telephony/status"),
  })

  const { data: phoneNumbers = [] } = useQuery<{ id: string; number: string; friendly_name?: string; agent_id?: string }[]>({
    queryKey: ["phone-numbers"],
    queryFn: () => api.get("/v1/phone-numbers"),
    enabled: !!status?.is_connected,
  })

  const { data: agents = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["agents"],
    queryFn: () => api.get("/v1/agents"),
    enabled: !!status?.is_connected,
  })

  const connect = useMutation({
    mutationFn: () =>
      api.post("/v1/telephony/connect", {
        twilio_account_sid: accountSid.trim(),
        twilio_auth_token: authToken.trim(),
        twilio_phone_number: phoneNumber.trim(),
      }),
    onSuccess: () => {
      toast.success("Twilio connected. Your number is ready for calls.")
      setShowForm(false)
      setAccountSid("")
      setAuthToken("")
      setPhoneNumber("")
      qc.invalidateQueries({ queryKey: ["telephony-status"] })
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: (err: any) => {
      const msg =
        typeof err?.message === "string"
          ? err.message
          : "Failed to connect. Check your Twilio credentials and number."
      toast.error(msg)
    },
  })

  const disconnect = useMutation({
    mutationFn: () => api.delete("/v1/telephony/disconnect"),
    onSuccess: () => {
      toast.success("Twilio disconnected")
      qc.invalidateQueries({ queryKey: ["telephony-status"] })
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: () => toast.error("Failed to disconnect"),
  })

  const importNumbers = useMutation({
    mutationFn: () => api.post("/v1/phone-numbers/import", {}),
    onSuccess: (data: { imported?: number }) => {
      toast.success(`Imported ${data?.imported ?? 0} number(s). Assign an agent below.`)
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: () => toast.error("Failed to import. Connect Twilio above first."),
  })

  const assignTelephonyAgent = useMutation({
    mutationFn: (agentId: string) => api.patch("/v1/telephony/assign-agent", { agent_id: agentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telephony-status"] })
    },
    onError: () => toast.error("Failed to assign agent"),
  })

  const assignNumberAgent = useMutation({
    mutationFn: ({ numberId, agentId }: { numberId: string; agentId: string | null }) =>
      api.patch(`/v1/phone-numbers/${numberId}`, { agent_id: agentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: () => toast.error("Failed to assign agent"),
  })

  const releaseNumber = useMutation({
    mutationFn: (numberId: string) => api.delete(`/v1/phone-numbers/${numberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phone-numbers"] })
    },
    onError: () => toast.error("Failed to release number"),
  })

  const primaryNumber = status?.phone_number ?? null
  const importedOnly = phoneNumbers.filter((n) => n.number !== primaryNumber)
  const hasPrimaryRow = !!primaryNumber
  type Row = { id: string; number: string; agent_id?: string; isPrimary: boolean }
  const allRows: Row[] = hasPrimaryRow
    ? [{ id: "primary", number: primaryNumber, agent_id: status?.assigned_agent_id ?? undefined, isPrimary: true }, ...importedOnly.map((n) => ({ id: n.id, number: n.number, agent_id: n.agent_id, isPrimary: false }))]
    : importedOnly.map((n) => ({ id: n.id, number: n.number, agent_id: n.agent_id, isPrimary: false }))

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Twilio connect card */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Phone size={18} />
              Twilio & Phone
            </h3>
            <p className="text-sm text-white/70 mt-0.5">
              Connect one Twilio account. Resona sets up the SIP trunk and routing. Add more numbers below and assign an agent to each.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.is_connected ? (
              <>
                <CheckCircle size={16} className="text-emerald-500" />
                <span className="text-sm text-emerald-600 font-medium">
                  {status.is_active ? "Connected" : "Connected (inactive)"}
                </span>
              </>
            ) : (
              <>
                <XCircle size={16} className="text-red-400" />
                <span className="text-sm text-red-500 font-medium">Not connected</span>
              </>
            )}
          </div>
        </div>

        {!showForm && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-primary"
            >
              {status?.is_connected ? "Reconnect (replace)" : "Connect Twilio"}
            </button>
            {status?.is_connected && (
              <button
                type="button"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="px-4 py-2 border border-red-500/30 text-red-400 text-sm font-medium rounded-full hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>
        )}

        {showForm && (
          <div className="space-y-3 mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1 uppercase tracking-wide">Account SID</label>
              <input
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-[#4DFFCE]/50 focus:ring-1 focus:ring-[#4DFFCE]/30 bg-white/5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1 uppercase tracking-wide">Auth Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Your Twilio auth token"
                  className="w-full px-3 py-2 pr-10 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-[#4DFFCE]/50 focus:ring-1 focus:ring-[#4DFFCE]/30 bg-white/5"
                />
                <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1 uppercase tracking-wide">Phone number (E.164)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+12025551234"
                className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-[#4DFFCE]/50 focus:ring-1 focus:ring-[#4DFFCE]/30 bg-white/5"
              />
              <p className="text-xs text-white/70 mt-1">Primary number for this account. Must be in your Twilio account.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => connect.mutate()}
                disabled={!accountSid.trim() || !authToken.trim() || !phoneNumber.trim() || connect.isPending}
                className="btn-primary disabled:opacity-50"
              >
                {connect.isPending ? "Connecting…" : "Connect"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setAccountSid(""); setAuthToken(""); setPhoneNumber(""); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Numbers & agents: one table, import, assign agent per number */}
      {status?.is_connected && (
        <div className="bg-white/5 border border-white/10 rounded-xl shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Numbers & agents</h3>
              <p className="text-sm text-white/70 mt-0.5">
                Assign an agent to each number. Inbound calls to that number will be handled by the assigned agent.
              </p>
            </div>
            <button
              type="button"
              onClick={() => importNumbers.mutate()}
              disabled={importNumbers.isPending}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
                "bg-white/5 border border-white/10 text-white hover:bg-white/10/80 transition-colors disabled:opacity-50"
              )}
            >
              <RefreshCw size={14} className={importNumbers.isPending ? "animate-spin" : ""} />
              {importNumbers.isPending ? "Importing…" : "Import more numbers"}
            </button>
          </div>

          {allRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/5/30 py-8 px-4 text-center">
              <p className="text-sm text-white/70">No numbers yet. Connect Twilio above, then use &quot;Import more numbers&quot; to sync from your Twilio account.</p>
              <button
                type="button"
                onClick={() => importNumbers.mutate()}
                disabled={importNumbers.isPending}
                className="mt-3 btn-primary disabled:opacity-50"
              >
                {importNumbers.isPending ? "Importing…" : "Import numbers"}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5/50 border-b border-white/10">
                    <th className="text-left py-3 px-4 font-medium text-white/70">Number</th>
                    <th className="text-left py-3 px-4 font-medium text-white/70">Agent</th>
                    <th className="w-12 py-3 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/10 last:border-0 hover:bg-white/10/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-white">{row.number}</span>
                        {row.isPrimary && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[#4DFFCE]/20 text-[#4DFFCE] font-medium">Primary</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={row.isPrimary ? (status?.assigned_agent_id ?? "") : (row.agent_id ?? "")}
                          onChange={(e) => {
                            const id = e.target.value || null
                            if (row.isPrimary) {
                              if (id) assignTelephonyAgent.mutate(id)
                            } else {
                              assignNumberAgent.mutate({ numberId: row.id, agentId: id })
                            }
                          }}
                          className="w-full max-w-[200px] px-3 py-2 border border-white/10 rounded-lg bg-white/5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-[#4DFFCE]/50 focus:ring-1 focus:ring-[#4DFFCE]/30"
                        >
                          <option value="">No agent</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {row.isPrimary ? (
                          <span className="text-xs text-white/70">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Release ${row.number}?`)) releaseNumber.mutate(row.id)
                            }}
                            className="p-1.5 rounded text-white/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Release number"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ApiKeysTab() {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [newKey, setNewKey] = useState<string | null>(null)

  const { data: keys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get("/v1/api-keys") as Promise<
      { id: string; name: string; prefix: string; last_used: string | null; expires_at: string | null; is_active: boolean; created_at: string }[]
    >,
  })

  const create = useMutation({
    mutationFn: (keyName: string) =>
      api.post("/v1/api-keys", { name: keyName }) as Promise<{
        id: string
        name: string
        key: string
        prefix: string
        created_at: string
      }>,
    onSuccess: (data) => {
      setNewKey(data.key)
      setName("")
      qc.invalidateQueries({ queryKey: ["api-keys"] })
      toast.success("API key created")
    },
    onError: () => toast.error("Failed to create API key"),
  })

  const revoke = useMutation({
    mutationFn: (keyId: string) => api.delete(`/v1/api-keys/${keyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] })
      toast.success("API key revoked")
    },
    onError: () => toast.error("Failed to revoke API key"),
  })

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey)
      toast.success("Copied to clipboard")
    }
  }

  const dismissNewKey = () => setNewKey(null)

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl shadow-card p-6">
        <h3 className="text-base font-semibold text-white mb-1">API Keys</h3>
        <p className="text-sm text-white/70 mb-4">
          Create keys to access the Resona API programmatically. Keys are shown once on creation.
        </p>
        <div className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            className="form-input flex-1"
          />
          <button
            type="button"
            onClick={() => create.mutate(name)}
            disabled={!name.trim() || create.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create key"}
          </button>
        </div>
        {newKey && (
          <div className="bg-amber-500/15 border border-amber-500/30 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-amber-200 mb-1">Save this key. You won&apos;t see it again.</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-sm font-mono text-amber-100 truncate bg-white/10 px-2 py-1 rounded">
                {newKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="px-3 py-1.5 text-sm font-medium text-amber-200 border border-amber-500/40 rounded hover:bg-amber-500/20"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={dismissNewKey}
                className="px-3 py-1.5 text-sm font-medium text-amber-200 border border-amber-500/40 rounded hover:bg-amber-500/20"
              >
                Done
              </button>
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {keys?.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div>
                <span className="text-sm font-medium text-white">{k.name || "Unnamed"}</span>
                <span className="text-xs font-mono text-white/70 ml-2">{k.prefix}...</span>
              </div>
              <button
                type="button"
                onClick={() => revoke.mutate(k.id)}
                disabled={revoke.isPending}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Revoke
              </button>
            </li>
          ))}
          {(!keys || keys.length === 0) && (
            <li className="text-sm text-white/70 py-4">No API keys yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div className="text-sm text-white/70">
      Profile settings will be available in a future update.
    </div>
  )
}

function BillingTab() {
  return (
    <div className="text-sm text-white/70">
      Billing settings will be available in a future update.
    </div>
  )
}
