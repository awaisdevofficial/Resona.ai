"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Headphones, Search, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { api, API_BASE_URL, getAuthToken } from "@/lib/api"
import { cn } from "@/components/lib-utils"

export type VoiceProvider = "cartesia" | "chatterbox"

export interface Voice {
  id: string
  name: string
  provider: VoiceProvider | string
  gender?: string | null
  description?: string | null
  preview_url?: string | null
  is_custom?: boolean
}

type TabFilter = "all" | "female" | "male" | "custom"

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
          provider: voice.provider,
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
      if (tab === "custom" && !v.is_custom) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        v.name.toLowerCase().includes(q) ||
        v.provider.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q)
      )
    })
  }, [voices, tab, search])

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
              className="bg-surface rounded-2xl shadow-modal border border-border w-full max-w-4xl pointer-events-auto flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold text-primary flex items-center gap-2">
                    <Headphones size={18} />
                    Voice Library
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Browse real human voices and choose how your agent should sound.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopPreview()
                    onClose()
                  }}
                  className="p-2 rounded-lg text-muted hover:text-primary hover:bg-gray-50 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 pt-4 pb-3 flex flex-col gap-3 border-b border-border/80">
                {selectedLabel && (
                  <div className="inline-flex items-center gap-2 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Current selection:{" "}
                    <span className="font-medium text-primary">{selectedLabel}</span>
                  </div>
                )}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, style, or provider..."
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </div>
                  <div className="inline-flex rounded-full border border-border bg-canvas/80 p-0.5 text-xs font-medium">
                    {[
                      { id: "all", label: "All" },
                      { id: "female", label: "Female" },
                      { id: "male", label: "Male" },
                      { id: "custom", label: "Custom" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id as TabFilter)}
                        className={cn(
                          "px-3 py-1.5 rounded-full transition-colors",
                          tab === t.id
                            ? "bg-brand text-white"
                            : "text-muted hover:text-primary"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                {tab === "custom" && <CloneVoiceSection />}

                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="text-sm text-muted">Loading voices…</div>
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <p className="text-sm text-red-600">
                      Could not load voices. {(error as Error)?.message || "Please try again."}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : filteredVoices.length === 0 ? (
                  <div className="text-sm text-muted">
                    No voices match your filter or search. Try &quot;All&quot; or clear the search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVoices.map((voice) => (
                      <button
                        key={`${voice.provider}:${voice.id}`}
                        type="button"
                        onClick={() => {
                          stopPreview()
                          onSelect(voice)
                          onClose()
                        }}
                        className={cn(
                          "group flex flex-col items-stretch rounded-xl border border-border bg-canvas/80 hover:bg-white hover:shadow-sm transition-all text-left",
                          selectedVoiceId === voice.id &&
                            (selectedProvider || voice.provider) === voice.provider
                            ? "ring-2 ring-brand/50 border-brand/60"
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
                              <p className="text-sm font-semibold text-primary truncate">
                                {voice.name}
                              </p>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                                {providerLabel(voice.provider)}
                              </span>
                            </div>
                            {voice.description && (
                              <p className="mt-1 text-xs text-muted line-clamp-2">
                                {voice.description}
                              </p>
                            )}
                            {voice.is_custom && (
                              <p className="mt-1 text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Custom clone
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3 border-t border-dashed border-border/70 mt-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePreview(voice)
                            }}
                          >
                            {previewingId === voice.id ? "Stop" : "Preview"}
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
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function CloneVoiceSection() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleClone = async () => {
    if (!file || !name.trim()) return
    setLoading(true)
    try {
      const token = await getAuthToken()
      const formData = new FormData()
      formData.append("name", name.trim())
      formData.append("file", file)

      const res = await fetch(`${API_BASE_URL}/v1/voices/clone/cartesia`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      })
      if (!res.ok) throw new Error("Clone failed")
      // voices query will be refetched by the parent on next open; keep simple here
      setName("")
      setFile(null)
    } catch {
      // no-op; parent can show toast if desired
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-canvas/60 px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">Clone a Voice</p>
          <p className="text-[11px] text-muted">
            Upload at least 30 seconds of clean speech to create a custom voice.
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          Cartesia cloning
        </span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Voice name (e.g. Support Voice)"
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-[11px]"
        />
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          disabled={!file || !name.trim() || loading}
          onClick={handleClone}
          className="text-xs"
        >
          {loading ? "Cloning…" : "Create Clone"}
        </Button>
      </div>
    </div>
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
  if (id === "cartesia") return "Cartesia"
  if (id === "chatterbox") return "Chatterbox (offline)"
  return provider
}

