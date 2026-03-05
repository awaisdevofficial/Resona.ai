 "use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Eye, EyeOff, XCircle, CheckCircle2, Phone } from "lucide-react"
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
      <SipSetupWizard />
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

function SipSetupWizard() {
  type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

  interface SIPStatus {
    configured: boolean
    inbound_trunk_id?: string
    outbound_trunk_id?: string
    dispatch_rule_id?: string
    phone_number?: string
    livekit_sip_uri?: string
    origination_uri?: string
  }

  const [step, setStep] = useState<Step>(1)
  const [accountSid, setAccountSid] = useState("")
  const [authToken, setAuthToken] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [trunkSid, setTrunkSid] = useState("")
  const [terminationUri, setTerminationUri] = useState("")
  const [sipUsername, setSipUsername] = useState("")
  const [sipPassword, setSipPassword] = useState("")

  const { data: status, refetch: refetchStatus } = useQuery<SIPStatus>({
    queryKey: ["sip-status"],
    queryFn: () => api.get("/v1/settings/sip/status"),
  })

  const configure = useMutation({
    mutationFn: () =>
      api.post("/v1/settings/sip/configure", {
        account_sid: accountSid.trim(),
        auth_token: authToken.trim(),
        phone_number: phoneNumber.trim(),
        trunk_sid: trunkSid.trim(),
        termination_uri: terminationUri.trim(),
        sip_username: sipUsername.trim(),
        sip_password: sipPassword.trim(),
      }) as Promise<SIPStatus>,
    onSuccess: async () => {
      toast.success("Twilio calling is configured and ready to use")
      await refetchStatus()
      setStep(7)
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to complete Twilio setup. Check your details and try again."
      toast.error(msg)
    },
  })

  const livekitSipUri =
    status?.livekit_sip_uri ?? "sip:your_livekit_key@resona.duckdns.org"
  const originationUri = status?.origination_uri ?? `${livekitSipUri}:5060`

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-primary">
          Twilio Setup & Number Import
        </h3>
        <p className="text-sm text-muted mt-0.5">
          Connect your Twilio account, set up voice routing, and choose a number
          Resona will use for calls.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6 items-start">
        {/* Left: status + step list */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs flex items-center justify-between">
            <span className="font-medium text-muted">Status</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[11px]">
              {status?.configured ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-emerald-600 font-medium">
                    Ready to use
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-amber-700 font-medium">
                    Not configured
                  </span>
                </>
              )}
            </span>
          </div>

          <div className="space-y-1 text-xs">
            {[
              "Twilio Account",
              "Phone Number",
              "Routing Setup 1/3",
              "Routing Setup 2/3",
              "Routing Setup 3/3",
              "Assign Number",
              "Complete",
            ].map((label, idx) => {
              const s = (idx + 1) as Step
              const isActive = step === s
              const completed = status?.configured && s <= step
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(s)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 border text-left transition-colors ${
                    isActive
                      ? "bg-brand text-white border-brand"
                      : "bg-transparent text-muted border-border hover:bg-muted/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {completed ? (
                      <CheckCircle2
                        size={12}
                        className={isActive ? "text-white" : "text-emerald-500"}
                      />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-border flex items-center justify-center text-[10px]">
                        {s}
                      </span>
                    )}
                    <span className="truncate">{label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right: step content */}
        <main className="space-y-6">
          {step === 1 && (
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Account SID
            </label>
            <input
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Auth Token
            </label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Your Twilio auth token"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                if (!accountSid || !authToken) {
                  toast.error("Enter Account SID and Auth Token first")
                  return
                }
                setStep(2)
              }}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Phone number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+12025551234"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
            <p className="text-xs text-muted mt-1">
              Use E.164 format with country code (e.g. +1 for US/Canada).
            </p>
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!phoneNumber.trim()) {
                  toast.error("Enter your Twilio phone number")
                  return
                }
                setStep(3)
              }}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 max-w-md">
          <p className="text-sm text-muted">
            In the Twilio Console, go to <strong>Elastic SIP Trunking → Trunks</strong>,
            create a new trunk (for example &quot;Resona AI&quot;), and paste its
            Trunk SID below.
          </p>
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Trunk SID
            </label>
            <input
              value={trunkSid}
              onChange={(e) => setTrunkSid(e.target.value)}
              placeholder="TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!trunkSid.trim()) {
                  toast.error("Enter your Twilio Trunk SID")
                  return
                }
                setStep(4)
              }}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 max-w-md">
          <p className="text-sm text-muted">
            In your Twilio trunk&apos;s <strong>Termination</strong> tab, set a
            Termination URI and create a Credential List with the username
            and password you provide here. Twilio will use this when placing
            outbound calls.
          </p>
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Termination SIP URI
            </label>
            <input
              value={terminationUri}
              onChange={(e) => setTerminationUri(e.target.value)}
              placeholder="resonaai.pstn.twilio.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
                SIP Username
              </label>
              <input
                value={sipUsername}
                onChange={(e) => setSipUsername(e.target.value)}
                placeholder="resona_user"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
                SIP Password
              </label>
              <input
                type="password"
                value={sipPassword}
                onChange={(e) => setSipPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!terminationUri.trim() || !sipUsername || !sipPassword) {
                  toast.error(
                    "Fill in termination URI, SIP username and SIP password"
                  )
                  return
                }
                setStep(5)
              }}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-muted">
            In the trunk&apos;s <strong>Origination</strong> tab, add a new
            Origination URI using the value below (Priority 1, Weight 1). Twilio
            will use this URI to send inbound calls to Resona.
          </p>
          <div>
            <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
              Origination URI to use in Twilio
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-border text-xs font-mono">
                {originationUri}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(originationUri)
                    .then(() => toast.success("Copied URI to clipboard"))
                    .catch(() => toast.error("Failed to copy"))
                }}
                className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4 max-w-md">
          <p className="text-sm text-muted">
            In the trunk&apos;s <strong>Numbers</strong> tab, click &quot;Add a
            Number&quot; and assign the Twilio phone number{" "}
            <span className="font-mono text-primary">
              {phoneNumber || status?.phone_number || "your Twilio number"}
            </span>
            .
          </p>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(7)}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark"
            >
              Continue to Complete Setup
            </button>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className="space-y-4 max-w-xl">
          <p className="text-sm text-muted">
            When you click{" "}
            <span className="font-medium text-primary">Complete Setup</span>,
            Resona will register your Twilio routing details and phone number so
            your agents can start and receive calls.
          </p>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-border text-sm">
            {status?.configured ? (
              <>
                <CheckCircle2 className="text-emerald-500" size={18} />
                <div>
                  <p className="font-medium text-primary">
                    Twilio calling is configured
                  </p>
                  <p className="text-xs text-muted">
                    You can now make and receive calls with this Twilio number.
                    You can re-run this wizard any time to update the setup.
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="text-red-500" size={18} />
                <div>
                  <p className="font-medium text-primary">Not configured yet</p>
                  <p className="text-xs text-muted">
                    Complete the previous steps, then click the button below to
                    register with LiveKit.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => configure.mutate()}
              disabled={
                configure.isPending ||
                !accountSid ||
                !authToken ||
                !phoneNumber ||
                !trunkSid ||
                !terminationUri ||
                !sipUsername ||
                !sipPassword
              }
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
            >
              {configure.isPending ? "Configuring..." : "Complete SIP Setup"}
            </button>
            {status?.configured && (
              <div className="text-xs text-muted space-y-1">
                  <p className="font-medium text-primary">
                    Connection details
                  </p>
                <p>
                  Inbound Trunk:{" "}
                  <span className="font-mono">
                    {status.inbound_trunk_id || "—"}
                  </span>
                </p>
                <p>
                  Outbound Trunk:{" "}
                  <span className="font-mono">
                    {status.outbound_trunk_id || "—"}
                  </span>
                </p>
                {status.dispatch_rule_id && (
                  <p>
                    Dispatch Rule:{" "}
                    <span className="font-mono">
                      {status.dispatch_rule_id}
                    </span>
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <Phone size={12} />
                  <span>
                    Phone:&nbsp;
                    <span className="font-mono">
                      {status.phone_number || phoneNumber || "—"}
                    </span>
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  )
}
