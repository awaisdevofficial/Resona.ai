"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { ArrowLeft, BookOpen, Play, Loader2, Phone, Save, Settings, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api, API_BASE_URL, getAuthToken } from "@/lib/api"
import { MAX_FIRST_MESSAGE_LEN, MAX_SYSTEM_PROMPT_LEN } from "@/lib/agentLimits"
import { cn } from "@/components/lib-utils"
import { VoiceLibrary, Voice } from "@/components/agents/VoiceLibrary"
import { DarkSelect } from "@/components/shared/DarkSelect"

const FIXED_DEFAULTS = {
  llm_model: "gpt-4o",
  llm_temperature: 0.8,
  llm_max_tokens: 300,
  stt_provider: "elevenlabs",
  stt_model: "scribe_v2_realtime",
  stt_language: "en-US",
  tts_provider: "elevenlabs",
  tts_stability: 0.45,
}

const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-US", label: "Spanish (US)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "de-DE", label: "German" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "pt-PT", label: "Portuguese (Portugal)" },
  { value: "nl-NL", label: "Dutch" },
  { value: "pl-PL", label: "Polish" },
  { value: "ru-RU", label: "Russian" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { value: "tr-TR", label: "Turkish" },
  { value: "sv-SE", label: "Swedish" },
  { value: "da-DK", label: "Danish" },
  { value: "fi-FI", label: "Finnish" },
  { value: "no-NO", label: "Norwegian" },
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
    staleTime: 30_000, // 30s — avoid refetch on tab focus for faster feel
  })

  const form = useForm<AgentFormValues>({
    defaultValues: {
      name: "",
      description: "",
      system_prompt: "",
      first_message: "",
      tts_voice_id: "",
      tts_provider: "elevenlabs",
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
        tts_provider: agent.tts_provider ?? "elevenlabs",
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

  const voiceId = watchedVoice || agent?.tts_voice_id
  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.get("/v1/voices") as Promise<Voice[]>,
    enabled: voiceLibraryOpen || !!voiceId,
    staleTime: 90_000, // 90s — backend caches voices; avoid refetch on every open
  })
  const displayVoiceName = useMemo(() => {
    const vid = (voiceId || "").trim()
    if (!vid) return "Default"
    const v = (voices as Voice[]).find((x) => (x.id || "").trim() === vid)
    return v?.name ?? (vid.length > 12 ? `${vid.slice(0, 8)}…` : vid)
  }, [voices, voiceId])

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
        tts_provider: updatedAgent.tts_provider ?? "elevenlabs",
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
      const token = await getAuthToken()
      const response = await fetch(`${API_BASE_URL}/v1/voices/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          voice_id: form.getValues("tts_voice_id") || agent.tts_voice_id,
          provider: form.getValues("tts_provider") ?? agent?.tts_provider ?? "elevenlabs",
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
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="animate-spin text-[#4DFFCE]" size={28} />
        <p className="text-sm text-white/60">Loading agent...</p>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center max-w-md mx-auto">
        <p className="text-sm text-white/70">Agent not found.</p>
        <button
          onClick={() => router.push("/agents")}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-[#4DFFCE] hover:underline"
        >
          <ArrowLeft size={14} />
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
  const displaySilenceTimeout = watchedSilenceTimeout ?? agent.silence_timeout ?? 30
  const displayMaxDuration = watchedMaxDuration ?? agent.max_duration ?? 3600

  return (
    <>
      <div className="min-h-[80vh]">
        {/* Hero header */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => router.push("/agents")}
                className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-[#4DFFCE] transition-colors mb-2"
              >
                <ArrowLeft size={14} />
                Agents
              </button>
              <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight truncate">
                {displayName || "Edit agent"}
              </h1>
              <p className="text-sm text-white/60 mt-0.5">
                Configure behaviour, voice, and knowledge. Test live before saving.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => router.push("/agents")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setTestPanelOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#4DFFCE]/40 bg-[#4DFFCE]/15 text-sm font-medium text-[#4DFFCE] hover:bg-[#4DFFCE]/25 transition-colors"
              >
                <Phone size={14} />
                Test Agent
              </button>
              <button
                type="button"
                onClick={form.handleSubmit((v) => save(v))}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4DFFCE] text-[#07080A] text-sm font-semibold hover:bg-[#5affd6] transition-colors disabled:opacity-60 disabled:pointer-events-none"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save changes
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === "config"
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <Settings size={16} />
            Configuration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === "knowledge"
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <BookOpen size={16} />
            Knowledge Base
          </button>
        </div>

        {activeTab === "knowledge" ? (
          <KnowledgeBaseTab agentId={params.id} />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.35fr)] gap-6 items-start">
          <form className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-semibold text-white tracking-tight">Identity</h2>
                <p className="text-xs text-white/60 mt-0.5">Name and description for your agent.</p>
              </div>
              <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="form-label">Agent name</label>
                    <input
                      type="text"
                      {...form.register("name", { required: "Agent name is required" })}
                      className="form-input"
                    />
                    {form.formState.errors.name && (
                      <p className="text-[11px] text-red-400 mt-0.5">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="form-label">
                      Description{" "}
                      <span className="text-white/70 font-normal">(optional)</span>
                    </label>
                    <textarea
                      {...form.register("description")}
                      rows={3}
                      className="form-input resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-white">Conversation</h2>
                  <div className="space-y-2">
                    <label className="form-label">System prompt</label>
                    <textarea
                      {...form.register("system_prompt", {
                        required: "System prompt is required",
                        maxLength: {
                          value: MAX_SYSTEM_PROMPT_LEN,
                          message: `Max ${MAX_SYSTEM_PROMPT_LEN} characters (keeps test-call URL safe)`,
                        },
                      })}
                      maxLength={MAX_SYSTEM_PROMPT_LEN}
                      rows={4}
                      className="form-input resize-none"
                    />
                    <p className="text-[11px] text-white/70">
                      {form.watch("system_prompt")?.length ?? 0} / {MAX_SYSTEM_PROMPT_LEN}
                    </p>
                    {form.formState.errors.system_prompt && (
                      <p className="text-[11px] text-red-400 mt-0.5">
                        {form.formState.errors.system_prompt.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="form-label">First message to caller</label>
                    <input
                      type="text"
                      {...form.register("first_message", {
                        required: "First message is required",
                        maxLength: {
                          value: MAX_FIRST_MESSAGE_LEN,
                          message: `Max ${MAX_FIRST_MESSAGE_LEN} characters`,
                        },
                      })}
                      maxLength={MAX_FIRST_MESSAGE_LEN}
                      className="form-input"
                    />
                    <p className="text-[11px] text-white/70">
                      {form.watch("first_message")?.length ?? 0} / {MAX_FIRST_MESSAGE_LEN}
                    </p>
                    {form.formState.errors.first_message && (
                      <p className="text-[11px] text-red-400 mt-0.5">
                        {form.formState.errors.first_message.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="form-label">Who speaks first</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => form.setValue("agent_speaks_first", true)}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                          form.watch("agent_speaks_first") !== false
                            ? "bg-[#4DFFCE] text-[#07080A] border-[#4DFFCE]"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
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
                            ? "bg-[#4DFFCE] text-[#07080A] border-[#4DFFCE]"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        User speaks first
                      </button>
                    </div>
                    <p className="text-[11px] text-white/70">
                      Choose whether the agent greets the caller or waits for them to speak first.
                    </p>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-semibold text-white tracking-tight">Voice & behaviour</h2>
                <p className="text-xs text-white/60 mt-0.5">Speaking voice, language, and call settings.</p>
              </div>
              <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-[#4DFFCE]/20 text-[#4DFFCE] flex items-center justify-center text-xs font-semibold">
                        {(displayVoiceName || "AI").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white/80">
                          Speaking voice
                        </p>
                        <p className="text-sm text-white truncate">
                          {displayVoiceName || "Default voice"}
                        </p>
                        <p className="text-[11px] text-white/70">
                          Voice
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setVoiceLibraryOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#4DFFCE]/50 text-xs font-medium text-[#4DFFCE] hover:bg-[#4DFFCE]/10 transition-colors"
                      >
                        Change voice
                      </button>
                      <button
                        type="button"
                        onClick={previewVoice}
                        disabled={previewLoading}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 text-xs font-medium text-white/60 hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {previewLoading ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                        Preview
                      </button>
                    </div>
                    <p className="text-[11px] text-white/70">
                      Browse voice library.
                    </p>
                    {form.formState.errors.tts_voice_id && (
                      <p className="text-[11px] text-red-400">
                        {form.formState.errors.tts_voice_id.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">Call behaviour</h3>
                  <div className="space-y-2">
                    <label className="form-label">Language</label>
                    <Controller
                      name="stt_language"
                      control={form.control}
                      rules={{ required: "Language is required" }}
                      render={({ field }) => (
                        <DarkSelect
                          value={field.value}
                          onChange={field.onChange}
                          options={LANGUAGE_OPTIONS}
                          aria-label="Language"
                        />
                      )}
                    />
                    <p className="text-[11px] text-white/70">
                      Supported languages for speech recognition and synthesis.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="form-label">Silence timeout</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={5}
                          max={300}
                          {...form.register("silence_timeout", { valueAsNumber: true })}
                          className="form-input pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/70">
                          sec
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="form-label">Max call duration</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={60}
                          max={14400}
                          {...form.register("max_duration", { valueAsNumber: true })}
                          className="form-input pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/70">
                          sec
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-semibold text-white tracking-tight">Call Transfer</h2>
                <p className="text-xs text-white/60 mt-0.5">Optional number for human handoff.</p>
              </div>
              <div className="p-6 space-y-2">
                <label className="form-label">
                  Transfer to number{" "}
                  <span className="text-white/50 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  {...form.register("transfer_number")}
                  placeholder="+1234567890"
                  className="form-input max-w-md"
                />
                <p className="text-[11px] text-white/60">
                  When the caller asks to speak to a human, the agent will transfer to this number.
                </p>
              </div>
            </section>
          </form>

          <aside className="lg:sticky lg:top-8 flex flex-col gap-5 min-w-0">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col gap-0">
              <div className="px-5 py-4 border-b border-white/10 bg-white/[0.03]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white tracking-tight">
                      Live preview
                    </h2>
                    <p className="text-xs text-white/60 mt-0.5">
                      How your agent will sound and respond.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestPanelOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#4DFFCE]/40 bg-[#4DFFCE]/15 text-xs font-semibold text-[#4DFFCE] hover:bg-[#4DFFCE]/25 transition-colors shrink-0"
                  >
                    <Phone size={13} />
                    Test Agent
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
              <div className="space-y-4 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                      Agent name
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5 truncate">
                      {displayName || "Untitled agent"}
                    </p>
                  </div>
                <span className="inline-flex items-center rounded-full bg-[#4DFFCE]/15 px-2.5 py-1 text-xs font-medium text-[#4DFFCE] border border-[#4DFFCE]/30 shrink-0 w-fit" title={voiceId || undefined}>
                  Voice: {displayVoiceName}
                </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                    First message
                  </p>
                  <p className="text-sm text-white leading-relaxed">{displayFirstMessage}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                    System prompt
                  </p>
                  <p className="text-xs text-white/70 line-clamp-4 whitespace-pre-line leading-relaxed">
                    {displaySystemPrompt}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-white/10 text-xs text-white/70">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4DFFCE] shrink-0" />
                    <span>Silence: {displaySilenceTimeout}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#60A5FA] shrink-0" />
                    <span>Max: {Math.round(displayMaxDuration / 60)} min</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-3 border-t border-white/10">
                <p className="text-[11px] text-white/60">Changes sync to your next test call.</p>
                <button
                  type="button"
                  onClick={() => setVoiceLibraryOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#4DFFCE]/50 text-xs font-medium text-[#4DFFCE] hover:bg-[#4DFFCE]/10 transition-colors w-full sm:w-auto"
                >
                  Change voice
                </button>
              </div>
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
        selectedProvider={watchedProvider ?? agent?.tts_provider ?? "elevenlabs"}
        onSelect={(voice: Voice) => {
          form.setValue("tts_voice_id", voice.id)
          form.setValue("tts_provider", voice.provider ?? "elevenlabs")
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-white tracking-tight">Add knowledge</h2>
          <p className="text-xs text-white/60 mt-0.5">Give your agent reference text it can use in conversations.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="form-label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product FAQ, Company Info"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste text directly..."
              rows={6}
              className="form-input resize-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={createMutation.isPending || !name.trim() || !content.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4DFFCE] text-[#07080A] text-sm font-semibold hover:bg-[#5affd6] transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            {createMutation.isPending ? "Adding..." : "Add entry"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-white tracking-tight">Existing entries</h2>
          <p className="text-xs text-white/60 mt-0.5">{entries.length} {entries.length === 1 ? "entry" : "entries"} in this agent&apos;s knowledge base.</p>
        </div>
        <div className="p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/60 py-8">
            <Loader2 size={16} className="animate-spin" />
            Loading...
          </div>
        ) : !entries.length ? (
          <p className="text-sm text-white/60 py-8">No knowledge base entries yet. Add one above.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-white/10 p-4 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{entry.name}</p>
                  <p className="text-xs text-white/60 mt-0.5 line-clamp-2">
                    {entry.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this entry?")) deleteMutation.mutate(entry.id)
                  }}
                  className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  aria-label="Delete entry"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>
    </div>
  )
}