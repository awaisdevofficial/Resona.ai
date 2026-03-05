"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { ArrowLeft, BookOpen, Play, Loader2, Phone, Save, Settings, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api } from "@/lib/api"
import { cn } from "@/components/lib-utils"
import { VoiceLibrary, Voice } from "@/components/agents/VoiceLibrary"

const FIXED_DEFAULTS = {
  llm_model: "gpt-4o-mini",
  llm_temperature: 0.7,
  llm_max_tokens: 500,
  stt_provider: "deepgram",
  stt_model: "nova-2-general",
  stt_language: "en-US",
  tts_provider: "cartesia",
  tts_stability: 0.5,
}

const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-US", label: "Spanish (US)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
]

interface AgentFormValues {
  name: string
  description: string
  system_prompt: string
  first_message: string
  tts_voice_id: string
  tts_provider?: string
  stt_language: string
  silence_timeout: number
  max_duration: number
  agent_speaks_first: boolean
  transfer_number: string
}

export default function AgentEditPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [testPanelOpen, setTestPanelOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"config" | "knowledge">("config")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", params.id],
    queryFn: () => api.get(`/v1/agents/${params.id}`) as Promise<any>,
  })

  const form = useForm<AgentFormValues>({
    defaultValues: {
      name: "",
      description: "",
      system_prompt: "",
      first_message: "",
      tts_voice_id: "",
      tts_provider: "cartesia",
      stt_language: "en-US",
      silence_timeout: 30,
      max_duration: 3600,
      agent_speaks_first: true,
      transfer_number: "",
    },
  })

  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name || "",
        description: agent.description || "",
        system_prompt: agent.system_prompt || "",
        first_message: agent.first_message || "",
        tts_voice_id: agent.tts_voice_id || "",
        tts_provider: agent.tts_provider || "cartesia",
        stt_language: agent.stt_language || "en-US",
        silence_timeout: agent.silence_timeout || 30,
        max_duration: agent.max_duration || 3600,
        agent_speaks_first: agent.tools_config?.agent_speaks_first ?? true,
        transfer_number: agent.tools_config?.transfer_number ?? "",
      })
    }
  }, [agent, form])

  const watchedName = form.watch("name")
  const watchedFirstMessage = form.watch("first_message")
  const watchedSystemPrompt = form.watch("system_prompt")
  const watchedVoice = form.watch("tts_voice_id")
  const watchedProvider = form.watch("tts_provider")
  const watchedLanguage = form.watch("stt_language")
  const watchedSilenceTimeout = form.watch("silence_timeout")
  const watchedMaxDuration = form.watch("max_duration")

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (values: AgentFormValues) =>
      api.patch(`/v1/agents/${params.id}`, {
        ...FIXED_DEFAULTS,
        ...values,
        tts_provider: values.tts_provider || FIXED_DEFAULTS.tts_provider,
        tools_config: {
          agent_speaks_first: values.agent_speaks_first,
          transfer_number: values.transfer_number || undefined,
        },
      }),
    onSuccess: (updatedAgent: any) => {
      toast.success("Agent saved")
      form.reset({
        name: updatedAgent.name || "",
        description: updatedAgent.description || "",
        system_prompt: updatedAgent.system_prompt || "",
        first_message: updatedAgent.first_message || "",
        tts_voice_id: updatedAgent.tts_voice_id || "",
        tts_provider: updatedAgent.tts_provider || "cartesia",
        silence_timeout: updatedAgent.silence_timeout || 30,
        max_duration: updatedAgent.max_duration || 3600,
        agent_speaks_first:
          updatedAgent.tools_config?.agent_speaks_first ?? true,
        transfer_number: updatedAgent.tools_config?.transfer_number ?? "",
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["agent", params.id] })
    },
    onError: () => toast.error("Failed to save agent"),
  })

  async function previewVoice() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPreviewLoading(true)
    try {
      let token: string | null = null
      if (typeof window !== "undefined" && (window as any).Clerk?.session) {
        token = await (window as any).Clerk.session.getToken()
      }
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${BASE_URL}/v1/voices/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          voice_id: form.getValues("tts_voice_id") || agent.tts_voice_id,
          provider: form.getValues("tts_provider") || agent.tts_provider || "cartesia",
          text:
            "Hi, I am your AI voice assistant, ready to help you on every call.",
        }),
      })
      if (!response.ok) throw new Error("Preview failed")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch {
      toast.error("Voice preview failed.")
    } finally {
      setPreviewLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand" size={24} />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted">Agent not found.</p>
        <button
          onClick={() => router.push("/agents")}
          className="mt-4 text-sm text-brand hover:underline"
        >
          Back to agents
        </button>
      </div>
    )
  }

  const displayName = watchedName || agent.name
  const displayFirstMessage =
    watchedFirstMessage || agent.first_message || "Hi, how can I help you today?"
  const displaySystemPrompt =
    watchedSystemPrompt ||
    agent.system_prompt ||
    "You are a helpful, friendly voice AI agent."
  const displayVoice = watchedVoice || agent.tts_voice_id || "Default"
  const displaySilenceTimeout = watchedSilenceTimeout ?? agent.silence_timeout ?? 30
  const displayMaxDuration = watchedMaxDuration ?? agent.max_duration ?? 3600

  return (
    <>
      <div>
        <PageHeader
          title={displayName}
          subtitle="Edit your agent's configuration and test it live."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/agents")}
                className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium text-[#6B7280] rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={() => setTestPanelOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-brand/30 bg-brand/5 text-sm font-medium text-brand rounded-lg hover:bg-brand/10 transition-colors"
              >
                <Phone size={14} />
                Test Agent
              </button>
              <button
                onClick={form.handleSubmit((v) => save(v))}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save changes
              </button>
            </div>
          }
        />

        <div className="mt-4 flex gap-2 border-b border-border mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
              activeTab === "config"
                ? "border-brand text-brand bg-brand/5"
                : "border-transparent text-muted hover:text-primary hover:bg-canvas/50"
            )}
          >
            <Settings size={16} />
            Configuration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
              activeTab === "knowledge"
                ? "border-brand text-brand bg-brand/5"
                : "border-transparent text-muted hover:text-primary hover:bg-canvas/50"
            )}
          >
            <BookOpen size={16} />
            Knowledge Base
          </button>
        </div>

        {activeTab === "knowledge" ? (
          <KnowledgeBaseTab agentId={params.id} />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-6 items-start">
          <form className="space-y-6 bg-surface border border-border rounded-xl shadow-card p-6">
            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#111122]">Identity</h2>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      Agent name
                    </label>
                    <input
                      type="text"
                      {...form.register("name", { required: "Agent name is required" })}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    />
                    {form.formState.errors.name && (
                      <p className="text-[11px] text-red-500 mt-0.5">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      Description{" "}
                      <span className="text-[#9CA3AF] font-normal">(optional)</span>
                    </label>
                    <textarea
                      {...form.register("description")}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60 resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#111122]">Conversation</h2>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      System prompt
                    </label>
                    <textarea
                      {...form.register("system_prompt", {
                        required: "System prompt is required",
                      })}
                      rows={4}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60 resize-none"
                    />
                    {form.formState.errors.system_prompt && (
                      <p className="text-[11px] text-red-500 mt-0.5">
                        {form.formState.errors.system_prompt.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      First message to caller
                    </label>
                    <input
                      type="text"
                      {...form.register("first_message", {
                        required: "First message is required",
                      })}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    />
                    {form.formState.errors.first_message && (
                      <p className="text-[11px] text-red-500 mt-0.5">
                        {form.formState.errors.first_message.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      Who speaks first
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => form.setValue("agent_speaks_first", true)}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                          form.watch("agent_speaks_first") !== false
                            ? "bg-brand text-white border-brand"
                            : "bg-white text-[#6B7280] border-border hover:bg-gray-50"
                        )}
                      >
                        Agent speaks first
                      </button>
                      <button
                        type="button"
                        onClick={() => form.setValue("agent_speaks_first", false)}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                          form.watch("agent_speaks_first") === false
                            ? "bg-brand text-white border-brand"
                            : "bg-white text-[#6B7280] border-border hover:bg-gray-50"
                        )}
                      >
                        User speaks first
                      </button>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Choose whether the agent greets the caller or waits for them to speak first.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#111122]">Voice</h2>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-semibold">
                        {(displayVoice || "AI").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#4B5563]">
                          Speaking voice
                        </p>
                        <p className="text-sm text-[#111827] truncate">
                          {displayVoice || "Cartesia default voice"}
                        </p>
                        <p className="text-[11px] text-[#9CA3AF]">
                          Provider: {(watchedProvider || agent.tts_provider || "cartesia").toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setVoiceLibraryOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-primary hover:bg-gray-50 transition-colors"
                      >
                        Change voice
                      </button>
                      <button
                        type="button"
                        onClick={previewVoice}
                        disabled={previewLoading}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {previewLoading ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                        Preview
                      </button>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Browse real human voices powered by Cartesia or Deepgram.
                    </p>
                    {form.formState.errors.tts_voice_id && (
                      <p className="text-[11px] text-red-500">
                        {form.formState.errors.tts_voice_id.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#111122]">
                    Call behaviour
                  </h2>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#4B5563]">
                      Language
                    </label>
                    <select
                      {...form.register("stt_language", {
                        required: "Language is required",
                      })}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Supported languages for speech recognition and synthesis.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[#4B5563]">
                        Silence timeout
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={5}
                          max={300}
                          {...form.register("silence_timeout", { valueAsNumber: true })}
                          className="w-full rounded-lg border border-border bg-white px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">
                          sec
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[#4B5563]">
                        Max call duration
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={60}
                          max={14400}
                          {...form.register("max_duration", { valueAsNumber: true })}
                          className="w-full rounded-lg border border-border bg-white px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">
                          sec
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <section className="space-y-4 pt-4 border-t border-border">
                <h2 className="text-sm font-semibold text-[#111122]">Call Transfer</h2>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#4B5563]">
                    Transfer to number{" "}
                    <span className="text-[#9CA3AF] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    {...form.register("transfer_number")}
                    placeholder="+1234567890"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                  />
                  <p className="text-[11px] text-[#9CA3AF]">
                    When the caller asks to speak to a human, the agent will transfer to
                    this number.
                  </p>
                </div>
              </section>
            </section>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => router.push("/agents")}
                className="px-4 py-2 border border-border text-sm font-medium text-[#111122] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={form.handleSubmit((v) => save(v))}
                disabled={saving}
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>

          <aside className="lg:sticky lg:top-8 flex flex-col gap-5 min-w-0">
            <div className="bg-surface border border-border rounded-xl shadow-card p-5 flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-primary tracking-tight">
                    Agent preview
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    See how your agent will sound and introduce itself.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTestPanelOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-brand/30 bg-brand/5 text-xs font-semibold text-brand hover:bg-brand/10 transition-colors shrink-0"
                >
                  <Phone size={13} />
                  Test Agent
                </button>
              </div>

              <div className="space-y-4 rounded-xl bg-canvas/50 border border-dashed border-border px-4 py-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Agent name
                    </p>
                    <p className="text-sm font-semibold text-primary mt-0.5 truncate">
                      {displayName || "Untitled agent"}
                    </p>
                  </div>
                <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand border border-brand/20 shrink-0 w-fit">
                  {displayVoice}
                </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    First message
                  </p>
                  <p className="text-sm text-primary leading-relaxed">{displayFirstMessage}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    System prompt
                  </p>
                  <p className="text-xs text-muted line-clamp-4 whitespace-pre-line leading-relaxed">
                    {displaySystemPrompt}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-border/50 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>Silence: {displaySilenceTimeout}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span>Max: {Math.round(displayMaxDuration / 60)} min</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-1 border-t border-border">
                <p className="text-xs text-muted">Changes here are autosynced to your next test call.</p>
                <button
                  type="button"
                  onClick={() => setVoiceLibraryOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-primary hover:bg-gray-50 transition-colors w-full sm:w-auto"
                >
                  Change voice
                </button>
              </div>
            </div>
          </aside>
        </div>
        )}
      </div>

      <TestCallPanel
        agentId={params.id}
        agentName={displayName || agent.name}
        open={testPanelOpen}
        onClose={() => setTestPanelOpen(false)}
      />
      <VoiceLibrary
        open={voiceLibraryOpen}
        onClose={() => setVoiceLibraryOpen(false)}
        selectedVoiceId={watchedVoice || agent.tts_voice_id}
        selectedProvider={watchedProvider || agent.tts_provider}
        onSelect={(voice: Voice) => {
          form.setValue("tts_voice_id", voice.id)
          form.setValue("tts_provider", voice.provider)
        }}
      />
    </>
  )
}

function KnowledgeBaseTab({ agentId }: { agentId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [content, setContent] = useState("")

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["knowledge-base", agentId],
    queryFn: () =>
      api.get(`/v1/knowledge-base/agent/${agentId}`) as Promise<
        { id: string; name: string; content: string }[]
      >,
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; content: string; agent_id: string }) =>
      api.post("/v1/knowledge-base", body),
    onSuccess: () => {
      toast.success("Knowledge added")
      setName("")
      setContent("")
      qc.invalidateQueries({ queryKey: ["knowledge-base", agentId] })
    },
    onError: () => toast.error("Failed to add knowledge"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/knowledge-base/${id}`),
    onSuccess: () => {
      toast.success("Deleted")
      qc.invalidateQueries({ queryKey: ["knowledge-base", agentId] })
    },
    onError: () => toast.error("Failed to delete"),
  })

  const handleAdd = () => {
    if (!name.trim() || !content.trim()) {
      toast.error("Name and content are required")
      return
    }
    createMutation.mutate({
      name: name.trim(),
      content: content.trim(),
      agent_id: agentId,
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl shadow-card p-6">
        <h2 className="text-sm font-semibold text-[#111122] mb-4">
          Add Knowledge
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#4B5563] mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product FAQ, Company Info"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4B5563] mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste text directly..."
              rows={6}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60 resize-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={createMutation.isPending || !name.trim() || !content.trim()}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-6">
        <h2 className="text-sm font-semibold text-[#111122] mb-4">
          Existing entries
        </h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            Loading...
          </div>
        ) : !entries.length ? (
          <p className="text-sm text-muted">No knowledge base entries yet.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 bg-canvas/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary">{entry.name}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {entry.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this entry?")) deleteMutation.mutate(entry.id)
                  }}
                  className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}