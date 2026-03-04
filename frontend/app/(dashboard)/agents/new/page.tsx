"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { ArrowLeft, Loader2, Phone, Play, Save } from "lucide-react"
import toast from "react-hot-toast"

import { PageHeader } from "@/components/shared/PageHeader"
import { TestCallPanel } from "@/components/agents/TestCallPanel"
import { api } from "@/lib/api"
import { cn } from "@/components/lib-utils"

const FIXED_DEFAULTS = {
  llm_model: "gpt-4o-mini",
  llm_temperature: 0.7,
  llm_max_tokens: 500,
  stt_provider: "deepgram",
  stt_model: "nova-2-general",
  stt_language: "en-US",
  tts_provider: "elevenlabs",
  tts_stability: 0.5,
}

const VOICE_OPTIONS = [
  { label: "Rachel — Calm, professional female", value: "Rachel" },
  { label: "Drew — Friendly male", value: "Drew" },
  { label: "Clyde — Deep male", value: "Clyde" },
  { label: "Paul — Authoritative male", value: "Paul" },
  { label: "Domi — Energetic female", value: "Domi" },
  { label: "Dave — Conversational male", value: "Dave" },
  { label: "Fin — Irish male", value: "Fin" },
  { label: "Bella — Soft female", value: "Bella" },
  { label: "Antoni — Well-rounded male", value: "Antoni" },
  { label: "Thomas — Calm male", value: "Thomas" },
  { label: "Charlie — Natural Australian male", value: "Charlie" },
  { label: "Emily — Calm female", value: "Emily" },
  { label: "Elli — Emotional female", value: "Elli" },
  { label: "Callum — Intense male", value: "Callum" },
  { label: "Patrick — Confident male", value: "Patrick" },
  { label: "Harry — Anxious male", value: "Harry" },
  { label: "Liam — Articulate male", value: "Liam" },
  { label: "Dorothy — Warm British female", value: "Dorothy" },
  { label: "Josh — Deep male", value: "Josh" },
  { label: "Arnold — Crisp male", value: "Arnold" },
  { label: "Charlotte — Seductive female", value: "Charlotte" },
  { label: "Alice — Confident British female", value: "Alice" },
  { label: "Matilda — Warm Australian female", value: "Matilda" },
  { label: "James — Calm British male", value: "James" },
  { label: "Joseph — Grounded male", value: "Joseph" },
]

interface AgentFormValues {
  name: string
  description: string
  system_prompt: string
  first_message: string
  tts_voice_id: string
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

  const form = useForm<AgentFormValues>({
    defaultValues: {
      name: "",
      description: "",
      system_prompt:
        "You are a helpful, friendly voice AI agent that assists callers with their questions.",
      first_message: "Hi, this is your AI assistant. How can I help you today?",
      tts_voice_id: "Rachel",
      silence_timeout: 30,
      max_duration: 3600,
      agent_speaks_first: true,
    },
  })

  const watchedName = form.watch("name")
  const watchedFirstMessage = form.watch("first_message")
  const watchedSystemPrompt = form.watch("system_prompt")
  const watchedVoice = form.watch("tts_voice_id")
  const watchedSilenceTimeout = form.watch("silence_timeout")
  const watchedMaxDuration = form.watch("max_duration")

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (values: AgentFormValues) =>
      api.post("/v1/agents", {
        ...FIXED_DEFAULTS,
        ...values,
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
      let token: string | null = null
      if (typeof window !== "undefined" && (window as any).Clerk?.session) {
        token = await (window as any).Clerk.session.getToken()
      }
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${BASE_URL}/v1/agents/voice-preview-by-name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ voice_id: form.getValues("tts_voice_id") }),
      })
      if (!response.ok) throw new Error("Preview failed")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch {
      toast.error("Voice preview failed. Check your ElevenLabs API key.")
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
  const displayVoice = watchedVoice || "Rachel"
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
                    {...form.register("name")}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    placeholder="Sales Assistant"
                  />
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
                    {...form.register("system_prompt")}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60 resize-none"
                    placeholder="You are a helpful, friendly voice AI agent..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#4B5563]">
                    First message to caller
                  </label>
                  <input
                    type="text"
                    {...form.register("first_message")}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    placeholder="Hi, this is your AI assistant. How can I help you today?"
                  />
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
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#4B5563]">
                    Agent voice
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                    <select
                      {...form.register("tts_voice_id")}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/60"
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={previewVoice}
                      disabled={previewLoading}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
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
                    Powered by ElevenLabs. Click Preview to hear a sample.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[#111122]">
                  Call behaviour
                </h2>
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
                onClick={previewVoice}
                disabled={previewLoading}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-primary hover:bg-gray-50 transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {previewLoading ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Play size={14} className="shrink-0" />
                )}
                Voice preview
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
    </div>
  )
}
