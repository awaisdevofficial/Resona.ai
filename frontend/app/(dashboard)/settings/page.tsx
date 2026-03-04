 "use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Eye, EyeOff, XCircle } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { api } from "@/lib/api"

type Tab = "integrations" | "api-keys" | "profile" | "billing"

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("integrations")

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your account and integrations"
      />

      <div className="flex gap-1 mb-8 border-b border-border">
        {[
          { id: "integrations", label: "Integrations" },
          { id: "api-keys", label: "API Keys" },
          { id: "profile", label: "Profile" },
          { id: "billing", label: "Billing" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-primary"
            }`}
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

function IntegrationsTab() {
  return (
    <div className="space-y-6 max-w-2xl">
      <TwilioCard />
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
      <div className="bg-surface border border-border rounded-xl shadow-card p-6">
        <h3 className="text-base font-semibold text-primary mb-1">API Keys</h3>
        <p className="text-sm text-muted mb-4">
          Create keys to access the Resona API programmatically. Keys are shown once on creation.
        </p>
        <div className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => create.mutate(name)}
            disabled={!name.trim() || create.isPending}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create key"}
          </button>
        </div>
        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-amber-800 mb-1">Save this key. You won&apos;t see it again.</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-sm font-mono text-amber-900 truncate bg-amber-100 px-2 py-1 rounded">
                {newKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="px-3 py-1.5 text-sm font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-100"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={dismissNewKey}
                className="px-3 py-1.5 text-sm font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-100"
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
              className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
            >
              <div>
                <span className="text-sm font-medium text-primary">{k.name || "Unnamed"}</span>
                <span className="text-xs font-mono text-muted ml-2">{k.prefix}...</span>
              </div>
              <button
                type="button"
                onClick={() => revoke.mutate(k.id)}
                disabled={revoke.isPending}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Revoke
              </button>
            </li>
          ))}
          {(!keys || keys.length === 0) && (
            <li className="text-sm text-muted py-4">No API keys yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div className="text-sm text-muted">
      Profile settings will be available in a future update.
    </div>
  )
}

function BillingTab() {
  return (
    <div className="text-sm text-muted">
      Billing settings will be available in a future update.
    </div>
  )
}

function TwilioCard() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [sid, setSid] = useState("")
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)

  const { data } = useQuery({
    queryKey: ["twilio-credentials"],
    queryFn: () => api.get("/v1/settings/twilio"),
  })

  const save = useMutation({
    mutationFn: () =>
      api.post("/v1/settings/twilio", {
        account_sid: sid,
        auth_token: token,
      }),
    onSuccess: () => {
      toast.success("Twilio connected")
      setShowForm(false)
      setSid("")
      setToken("")
      qc.invalidateQueries({ queryKey: ["twilio-credentials"] })
    },
    onError: () => toast.error("Invalid Twilio credentials"),
  })

  const disconnect = useMutation({
    mutationFn: () => api.delete("/v1/settings/twilio"),
    onSuccess: () => {
      toast.success("Twilio disconnected")
      qc.invalidateQueries({ queryKey: ["twilio-credentials"] })
    },
  })

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-primary">Twilio</h3>
          <p className="text-sm text-muted mt-0.5">
            Connect your Twilio account to make and receive calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.is_connected ? (
            <>
              <CheckCircle size={16} className="text-emerald-500" />
              <span className="text-sm text-emerald-600 font-medium">
                Connected
              </span>
            </>
          ) : (
            <>
              <XCircle size={16} className="text-red-400" />
              <span className="text-sm text-red-500 font-medium">
                Not connected
              </span>
            </>
          )}
        </div>
      </div>

      {data?.is_connected && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-muted">
            Account SID:{" "}
            <span className="font-mono text-primary">{data.account_sid}</span>
          </p>
        </div>
      )}

      {!showForm && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            {data?.is_connected ? "Update credentials" : "Connect Twilio"}
          </button>
          {data?.is_connected && (
            <button
              type="button"
              onClick={() => disconnect.mutate()}
              className="px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="space-y-3 mt-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Account SID
            </label>
            <input
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Auth Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Your Twilio auth token"
                className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!sid || !token || save.isPending}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {save.isPending ? "Verifying..." : "Save credentials"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setSid("")
                setToken("")
              }}
              className="px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

