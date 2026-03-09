"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Headphones, Search, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { api, API_BASE_URL, getAuthToken } from "@/lib/api"
import { cn } from "@/components/lib-utils"

export type VoiceProvider = "kokoro" | "cartesia" | "deepgram"

export interface Voice {
  id: string
  name: string
  provider: VoiceProvider | string
  gender?: string | null
  description?: string | null
  preview_url?: string | null
}

type TabFilter = "all" | "female" | "male"

interface VoiceLibraryProps {
  open: boolean
  onClose: () => void
  selectedVoiceId: string | null
  selectedProvider: string | null
  onSelect: (voice: Voice) => void
}

export function VoiceLibrary({
  open,
  onClose,
  selectedVoiceId,
  selectedProvider,
  onSelect,
}: VoiceLibraryProps) {
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<TabFilter>("all")
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)

  const {
    data: voices = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.get("/v1/voices") as Promise<Voice[]>,
    enabled: open,
    retry: 1,
    staleTime: 60_000,
  })

  useEffect(() => {
    return () => {
      if (audio) {
        audio.pause()
        audio.src = ""
      }
    }
  }, [audio])

  const stopPreview = () => {
    if (audio) {
      audio.pause()
      audio.src = ""
      setAudio(null)
    }
    setPreviewingId(null)
  }

  const handlePreview = async (voice: Voice) => {
    if (previewingId === voice.id) {
      stopPreview()
      return
    }
    stopPreview()
    try {
      setPreviewingId(voice.id)
      const token = await getAuthToken()
      const res = await fetch(`${API_BASE_URL}/v1/voices/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          voice_id: voice.id,
          provider: voice.provider || "kokoro",
          text: "Hi, I am your AI voice assistant, ready to help you on every call.",
        }),
      })
      if (!res.ok) throw new Error("Preview failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const el = new Audio(url)
      setAudio(el)
      el.play()
      el.onended = () => {
        URL.revokeObjectURL(url)
        setPreviewingId(null)
      }
    } catch {
      setPreviewingId(null)
    }
  }

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      if (tab === "female" && v.gender?.toLowerCase() !== "female") return false
      if (tab === "male" && v.gender?.toLowerCase() !== "male") return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        v.name.toLowerCase().includes(q) ||
        v.provider.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q)
      )
    })
  }, [voices, tab, search])

  const voicesByProvider = useMemo(() => {
    const map = new Map<string, Voice[]>()
    for (const v of filteredVoices) {
      const key = (v.provider || "other").toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(v)
    }
    const order = ["kokoro", "cartesia", "deepgram", "other"]
    return order.filter((p) => map.has(p)).map((p) => ({ provider: p, voices: map.get(p)! }))
  }, [filteredVoices])

  const selectedLabel = useMemo(() => {
    if (!selectedVoiceId) return null
    const match = voices.find((v) => v.id === selectedVoiceId && v.provider === (selectedProvider || v.provider))
    return match ? `${match.name} · ${providerLabel(match.provider)}` : null
  }, [voices, selectedVoiceId, selectedProvider])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4"
          >
            <div
              className="glass-card rounded-2xl w-full max-w-4xl pointer-events-auto flex flex-col max-h-[90vh] border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Headphones size={18} />
                    Voice library
                  </h2>
                  <p className="text-xs text-white/70 mt-0.5">
                    Browse voices and choose how your agent should sound. Kokoro is the primary TTS; Cartesia is available as fallback when configured.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopPreview()
                    onClose()
                  }}
                  className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 pt-4 pb-3 flex flex-col gap-3 border-b border-white/10">
                {selectedLabel && (
                  <div className="inline-flex items-center gap-2 text-xs text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Current selection:{" "}
                    <span className="font-medium text-white">{selectedLabel}</span>
                  </div>
                )}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70"
                    />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, style, or provider..."
                      className="form-input pl-8"
                    />
                  </div>
                  <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 text-xs font-medium">
                    {[
                      { id: "all", label: "All" },
                      { id: "female", label: "Female" },
                      { id: "male", label: "Male" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id as TabFilter)}
                        className={cn(
                          "px-3 py-1.5 rounded-full transition-colors",
                          tab === t.id
                            ? "bg-[#4DFFCE] text-[#07080A]"
                            : "text-white/70 hover:text-white"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="text-sm text-white/70">Loading voices…</div>
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <p className="text-sm text-red-400">
                      Could not load voices. {(error as Error)?.message || "Please try again."}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : filteredVoices.length === 0 ? (
                  <div className="text-sm text-white/70">
                    No voices match your filter or search. Try &quot;All&quot; or clear the search.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {voicesByProvider.map(({ provider, voices: providerVoices }) => (
                      <div key={provider}>
                        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">
                          {providerLabel(provider)}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {providerVoices.map((voice) => (
                            <button
                              key={`${voice.provider}:${voice.id}`}
                              type="button"
                              onClick={() => {
                                stopPreview()
                                onSelect(voice)
                                onClose()
                              }}
                              className={cn(
                                "group flex flex-col items-stretch rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left",
                                selectedVoiceId === voice.id &&
                                  (selectedProvider || voice.provider) === voice.provider
                                  ? "ring-2 ring-[#4DFFCE]/50 border-[#4DFFCE]/60"
                                  : ""
                              )}
                            >
                              <div className="flex items-start gap-3 px-4 pt-4">
                                <div
                                  className={cn(
                                    "h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0",
                                    (voice.gender || "").toLowerCase() === "female"
                                      ? "bg-fuchsia-500"
                                      : (voice.gender || "").toLowerCase() === "male"
                                      ? "bg-sky-500"
                                      : "bg-slate-500"
                                  )}
                                >
                                  {initials(voice.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-white truncate">
                                      {voice.name}
                                    </p>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/20 shrink-0">
                                      {providerLabel(voice.provider)}
                                    </span>
                                  </div>
                                  {voice.description && (
                                    <p className="mt-1 text-xs text-white/70 line-clamp-2">
                                      {voice.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3 border-t border-dashed border-white/10 mt-3">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="flex-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handlePreview(voice)
                                  }}
                                >
                                  {previewingId === voice.id ? "Stop" : "▶ Preview"}
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="flex-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    stopPreview()
                                    onSelect(voice)
                                    onClose()
                                  }}
                                >
                                  Use voice
                                </Button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function initials(name: string) {
  const parts = name.trim().split(" ")
  if (!parts.length) return "AI"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function providerLabel(provider: string) {
  const id = provider.toLowerCase()
  if (id === "kokoro") return "Kokoro"
  if (id === "cartesia") return "Cartesia"
  if (id === "deepgram") return "Deepgram"
  return provider
}

