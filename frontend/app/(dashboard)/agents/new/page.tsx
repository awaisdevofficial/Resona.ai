"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { ArrowLeft, Loader2, Phone, Play, Save } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api, API_BASE_URL, getAuthToken } from "@/lib/api"
import { MAX_FIRST_MESSAGE_LEN, MAX_SYSTEM_PROMPT_LEN } from "@/lib/agentLimits"
import { cn } from "@/components/lib-utils"
import { VoiceLibrary, Voice } from "@/components/agents/VoiceLibrary"

const FIXED_DEFAULTS = {
  llm_model: "gpt-4o-mini",
  llm_temperature: 0.7,
  llm_max_tokens: 500,
  stt_provider: "deepgram",
  stt_model: "nova-2-general",
  stt_language: "en-US",
  tts_provider: "deepgram",
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
      tts_voice_id: "",
      tts_provider: "deepgram",
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
          provider: form.getValues("tts_provider") || "deepgram",
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
  const displayVoice = watchedVoice || "Default"
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
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium text-[#6B7280] rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        }
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-6 items-start">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 bg-surface border border-border rounded-xl shadow-card p-6"
        >
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
                    placeholder="Sales Assistant"
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
                    placeholder="Handles inbound sales calls and answers product questions."
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
                      maxLength: {
                        value: MAX_SYSTEM_PROMPT_LEN,
                        message: `Max ${MAX_SYSTEM_PROMPT_LEN} characters (keeps test-call URL safe)`,
                      },
                    })}
                    maxLength={MAX_SYSTEM_PROMPT_LEN}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60 resize-none"
                    placeholder="You are a helpful, friendly voice AI agent..."
                  />
                  <p className="text-[11px] text-[#6B7280]">
                    {form.watch("system_prompt")?.length ?? 0} / {MAX_SYSTEM_PROMPT_LEN}
                  </p>
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
                      maxLength: {
                        value: MAX_FIRST_MESSAGE_LEN,
                        message: `Max ${MAX_FIRST_MESSAGE_LEN} characters`,
                      },
                    })}
                    maxLength={MAX_FIRST_MESSAGE_LEN}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    placeholder="Hi, this is your AI assistant. How can I help you today?"
                  />
                  <p className="text-[11px] text-[#6B7280]">
                    {form.watch("first_message")?.length ?? 0} / {MAX_FIRST_MESSAGE_LEN}
                  </p>
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
                        Provider: {(watchedProvider || "deepgram").toUpperCase()}
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
                    Browse real human voices powered by Cartesia or Deepgram. Choose a
                    voice before saving your agent.
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
          </section>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => router.push("/agents")}
              className="px-4 py-2 border border-border text-sm font-medium text-[#111122] rounded-lg hover:bg-gray-50 transition-colors"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create agent"}
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
              <p className="text-xs text-muted">Preview updates live as you type.</p>
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
        selectedProvider={watchedProvider || "deepgram"}
        onSelect={(voice: Voice) => {
          form.setValue("tts_voice_id", voice.id)
          form.setValue("tts_provider", voice.provider)
        }}
      />
    </div>
  )
}
