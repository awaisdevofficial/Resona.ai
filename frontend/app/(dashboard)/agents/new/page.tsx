"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { ArrowLeft, Loader2, Phone, Play, Save } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api, API_BASE_URL, getAuthToken } from "@/lib/api"
import { MAX_FIRST_MESSAGE_LEN, MAX_SYSTEM_PROMPT_LEN } from "@/lib/agentLimits"
import { cn } from "@/components/lib-utils"
import { VoiceLibrary, Voice } from "@/components/agents/VoiceLibrary"
import { DarkSelect } from "@/components/shared/DarkSelect"

const FIXED_DEFAULTS = {
  llm_model: "gpt-4o-mini",
  llm_temperature: 0.7,
  llm_max_tokens: 500,
  stt_provider: "deepgram",
  stt_model: "nova-2-general",
  stt_language: "en-US",
  tts_provider: "kokoro",
  tts_stability: 0.5,
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
}

export default function NewAgentPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [testPanelOpen, setTestPanelOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)

  const form = useForm<AgentFormValues>({
    defaultValues: {
      name: "",
      description: "",
      system_prompt:
        "You are a helpful, friendly voice AI agent that assists callers with their questions.",
      first_message: "Hi, this is your AI assistant. How can I help you today?",
      tts_voice_id: "alloy",
      tts_provider: "kokoro",
      stt_language: "en-US",
      silence_timeout: 30,
      max_duration: 3600,
      agent_speaks_first: true,
    },
  })

  const watchedName = form.watch("name")
  const watchedFirstMessage = form.watch("first_message")
  const watchedSystemPrompt = form.watch("system_prompt")
  const watchedVoice = form.watch("tts_voice_id")
  const watchedProvider = form.watch("tts_provider")
  const watchedLanguage = form.watch("stt_language")
  const watchedSilenceTimeout = form.watch("silence_timeout")
  const watchedMaxDuration = form.watch("max_duration")

  const { data: ttsSettings } = useQuery({
    queryKey: ["settings", "tts"],
    queryFn: () => api.get("/v1/settings/tts") as Promise<{ default_provider: string }>,
  })
  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.get("/v1/voices") as Promise<Voice[]>,
    enabled: voiceLibraryOpen || !!watchedVoice,
  })

  // Default to Kokoro when backend is using self-hosted (Whisper + Kokoro); only set once so user can change
  const defaultKokoroSet = useRef(false)
  useEffect(() => {
    if (
      ttsSettings?.default_provider === "whisper_kokoro" &&
      !defaultKokoroSet.current
    ) {
      defaultKokoroSet.current = true
      form.setValue("tts_provider", "kokoro")
      form.setValue("tts_voice_id", "alloy")
    }
  }, [ttsSettings?.default_provider, form])

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (values: AgentFormValues) =>
      api.post("/v1/agents", {
        ...FIXED_DEFAULTS,
        ...values,
        tts_provider: values.tts_provider || FIXED_DEFAULTS.tts_provider,
        tools_config: { agent_speaks_first: values.agent_speaks_first },
      }),
    onSuccess: (agent: any) => {
      toast.success("Agent created")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["analytics-summary"] })
      router.push(`/agents/${agent.id}`)
    },
    onError: () => {
      toast.error("Failed to create agent")
    },
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
          voice_id: form.getValues("tts_voice_id"),
          provider: form.getValues("tts_provider") || "kokoro",
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

  const displayName = watchedName || "Untitled agent"
  const displayFirstMessage =
    watchedFirstMessage || "Hi, this is your AI assistant. How can I help you today?"
  const displaySystemPrompt =
    watchedSystemPrompt ||
    "You are a helpful, friendly voice AI agent that assists callers with their questions."
  const displayVoiceName = useMemo(() => {
    if (!watchedVoice) return "Default"
    const v = (voices as Voice[]).find((x) => x.id === watchedVoice)
    return v?.name ?? (watchedVoice.length > 12 ? `${watchedVoice.slice(0, 8)}…` : watchedVoice)
  }, [voices, watchedVoice])
  const displaySilenceTimeout = watchedSilenceTimeout ?? 30
  const displayMaxDuration = watchedMaxDuration ?? 3600

  function onSubmit(values: AgentFormValues) {
    create(values)
  }

  return (
    <div>
      <PageHeader
        title="Create Agent"
        subtitle="Configure your voice AI agent's personality and behaviour."
        actions={
          <button
            type="button"
            onClick={() => router.push("/agents")}
            className="btn-secondary"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        }
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-6 items-start">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 glass-panel border border-white/10 rounded-xl shadow-card p-6"
        >
          <section className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-white">Identity</h2>
                <div className="space-y-2">
                  <label className="form-label block text-xs">
                    Agent name
                  </label>
                  <input
                    type="text"
                    {...form.register("name", { required: "Agent name is required" })}
                    className="form-input"
                    placeholder="Sales Assistant"
                  />
                  {form.formState.errors.name && (
                    <p className="text-[11px] text-red-400 mt-0.5">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="form-label block text-xs">
                    Description{" "}
                    <span className="text-white/70 font-normal">(optional)</span>
                  </label>
                  <textarea
                    {...form.register("description")}
                    rows={3}
                    className="form-input resize-none"
                    placeholder="Handles inbound sales calls and answers product questions."
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-white">Conversation</h2>
                <div className="space-y-2">
                  <label className="form-label block text-xs">
                    System prompt
                  </label>
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
                    placeholder="You are a helpful, friendly voice AI agent..."
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
                  <label className="form-label block text-xs">
                    First message to caller
                  </label>
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
                    placeholder="Hi, this is your AI assistant. How can I help you today?"
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
                  <label className="form-label block text-xs">
                    Who speaks first
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => form.setValue("agent_speaks_first", true)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                        form.watch("agent_speaks_first") !== false
                          ? "bg-[#4DFFCE] text-[#07080A] border-[#4DFFCE]"
                          : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
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
                          : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-white">Voice</h2>
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
                        {displayVoiceName || "Kokoro default voice"}
                      </p>
                      <p className="text-[11px] text-white/70">
                        Provider: {(watchedProvider || "kokoro").toUpperCase()}
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
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
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
                    Browse voices (Kokoro self-hosted). Choose a voice before saving your agent.
                  </p>
                  {form.formState.errors.tts_voice_id && (
                    <p className="text-[11px] text-red-400">
                      {form.formState.errors.tts_voice_id.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-white">
                  Call behaviour
                </h2>
                <div className="space-y-2">
                  <label className="form-label block text-xs">
                    Language
                  </label>
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
                    <label className="form-label block text-xs">
                      Silence timeout
                    </label>
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
                    <label className="form-label block text-xs">
                      Max call duration
                    </label>
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
          </section>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => router.push("/agents")}
              className="btn-secondary"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create agent"}
            </button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-8 flex flex-col gap-5 min-w-0">
          <div className="glass-panel border border-white/10 rounded-xl shadow-card p-5 flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
<h2 className="text-base font-semibold text-[#4DFFCE] tracking-tight">
                Agent preview
                </h2>
                <p className="text-xs text-white/70 mt-0.5">
                  See how your agent will sound and introduce itself.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestPanelOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#4DFFCE]/50 bg-[#4DFFCE]/10 text-xs font-semibold text-[#4DFFCE] hover:bg-[#4DFFCE]/20 transition-colors shrink-0"
              >
                <Phone size={13} />
                Test Agent
              </button>
            </div>

            <div className="space-y-4 rounded-xl bg-white/[0.03] border border-dashed border-white/10 px-4 py-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                    Agent name
                  </p>
                  <p className="text-sm font-semibold text-white mt-0.5 truncate">
                    {displayName || "Untitled agent"}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-[#4DFFCE]/20 px-2.5 py-1 text-xs font-medium text-[#4DFFCE] border border-[#4DFFCE]/30 shrink-0 w-fit" title={watchedVoice || undefined}>
                  Voice: {displayVoiceName}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  First message
                </p>
                <p className="text-sm text-white/90 leading-relaxed">{displayFirstMessage}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  System prompt
                </p>
                <p className="text-xs text-white/70 line-clamp-4 whitespace-pre-line leading-relaxed">
                  {displaySystemPrompt}
                </p>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-white/10/50 text-xs text-white/70">
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

            <div className="flex flex-col gap-3 pt-1 border-t border-white/10">
              <p className="text-xs text-white/70">Preview updates live as you type.</p>
              <button
                type="button"
                onClick={() => setVoiceLibraryOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#4DFFCE]/50 text-xs font-medium text-[#4DFFCE] hover:bg-[#4DFFCE]/10 transition-colors w-full sm:w-auto"
              >
                Change voice
              </button>
            </div>
          </div>
        </aside>
      </div>

      <TestCallPanel
        agentId={undefined as any}
        agentName={displayName}
        open={testPanelOpen}
        onClose={() => setTestPanelOpen(false)}
      />
      <VoiceLibrary
        open={voiceLibraryOpen}
        onClose={() => setVoiceLibraryOpen(false)}
        selectedVoiceId={watchedVoice}
        selectedProvider={watchedProvider || "kokoro"}
        onSelect={(voice: Voice) => {
          form.setValue("tts_voice_id", voice.id)
          form.setValue("tts_provider", voice.provider || "kokoro")
        }}
      />
    </div>
  )
}
