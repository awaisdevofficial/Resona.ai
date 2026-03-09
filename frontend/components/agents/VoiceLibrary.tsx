"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Headphones, Search, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { API_BASE_URL, getAuthToken } from "@/lib/api"
import { cn } from "@/components/lib-utils"

export type VoiceProvider = "piper" | "kokoro"

export interface Voice {
  id: string
  name: string
  provider: VoiceProvider | string
  language?: string
  language_code?: string
  country?: string
  gender?: "male" | "female" | "neutral" | string
  quality?: "low" | "medium" | "high" | "x_low"
  description?: string
}

const LANG_FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇧🇷",
  ar: "🇸🇦",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  hi: "🇮🇳",
  ru: "🇷🇺",
  nl: "🇳🇱",
  pl: "🇵🇱",
  tr: "🇹🇷",
  fa: "🇮🇷",
  el: "🇬🇷",
  cy: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  ca: "🇪🇸",
  cs: "🇨🇿",
  da: "🇩🇰",
  fi: "🇫🇮",
  hu: "🇭🇺",
  is: "🇮🇸",
  ka: "🇬🇪",
  kk: "🇰🇿",
  lb: "🇱🇺",
  lv: "🇱🇻",
  ml: "🇮🇳",
  ne: "🇳🇵",
  no: "🇳🇴",
  ro: "🇷🇴",
  sk: "🇸🇰",
  sl: "🇸🇮",
  sr: "🇷🇸",
  sv: "🇸🇪",
  sw: "🇰🇪",
  uk: "🇺🇦",
  vi: "🇻🇳",
}

const providerLabel: Record<string, string> = {
  piper: "Piper TTS",
  kokoro: "Piper TTS",
}

type TabFilter = "all" | "english" | "other"

interface VoiceLibraryProps {
  open: boolean
  onClose: () => void
  selectedVoiceId: string | null
  selectedProvider: string | null
  onSelect: (voice: Voice) => void
}

function getProviderLabel(provider: string): string {
  return providerLabel[provider?.toLowerCase()] ?? provider
}

function getLangFlag(languageCode?: string): string {
  const code = (languageCode || "").split("_")[0].split("-")[0].toLowerCase()
  return LANG_FLAGS[code] ?? "🌐"
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
  const [languageFilter, setLanguageFilter] = useState<string>("all")
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
    queryFn: async () => {
      const token = await getAuthToken()
      const res = await fetch(`${API_BASE_URL}/v1/voices`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Failed to fetch voices")
      return res.json() as Promise<Voice[]>
    },
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
          provider: "piper",
          text: "Hi, I am your AI voice assistant, ready to help you on every call.",
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { detail?: string })?.detail || (res.status === 404 ? "This voice is not installed on the TTS server." : "Preview failed")
        throw new Error(msg)
      }
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

  const languageOptions = useMemo(() => {
    const langCount = new Map<string, number>()
    for (const v of voices) {
      const lang = v.language || "Unknown"
      langCount.set(lang, (langCount.get(lang) || 0) + 1)
    }
    return Array.from(langCount.entries())
      .map(([lang, count]) => ({ lang, count }))
      .sort((a, b) => a.lang.localeCompare(b.lang))
  }, [voices])

  const filteredVoices = useMemo(() => {
    const piperOnly = voices.filter((v) => {
      const p = (v.provider || "").toLowerCase()
      return p === "piper" || p === "kokoro"
    })
    return piperOnly.filter((v) => {
      if (tab === "english" && !(v.language_code || "").toLowerCase().startsWith("en")) return false
      if (tab === "other" && (v.language_code || "").toLowerCase().startsWith("en")) return false
      if (languageFilter !== "all" && (v.language || "Unknown") !== languageFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        (v.name || "").toLowerCase().includes(q) ||
        (v.language || "").toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        (v.language_code || "").toLowerCase().includes(q)
      )
    })
  }, [voices, tab, languageFilter, search])

  const selectedLabel = useMemo(() => {
    const sid = (selectedVoiceId || "").trim()
    if (!sid) return null
    const sp = (selectedProvider || "piper").toLowerCase()
    const match = voices.find(
      (v) => (v.id || "").trim() === sid && (v.provider || "piper").toLowerCase() === sp
    )
    return match ? `${match.name} · ${getProviderLabel(match.provider)}` : null
  }, [voices, selectedVoiceId, selectedProvider])

  const qualityColor = (quality?: string) => {
    switch ((quality || "").toLowerCase()) {
      case "high":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
      case "medium":
        return "bg-blue-500/20 text-blue-400 border-blue-500/40"
      case "low":
      case "x_low":
        return "bg-white/10 text-white/70 border-white/20"
      default:
        return "bg-white/10 text-white/70 border-white/20"
    }
  }

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
                    {voices.length} voices available · Select any voice for your agent
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Preview plays the selected voice only when it&apos;s installed on your TTS server.
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
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70"
                      />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, language, or description..."
                        className="form-input pl-8 w-full"
                      />
                    </div>
                    <select
                      value={languageFilter}
                      onChange={(e) => setLanguageFilter(e.target.value)}
                      className="form-input min-w-[180px] bg-white/5 border-white/10 text-white"
                    >
                      <option value="all">All Languages</option>
                      {languageOptions.map(({ lang, count }) => (
                        <option key={lang} value={lang}>
                          {lang} ({count})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 text-xs font-medium">
                    {[
                      { id: "all" as TabFilter, label: "All" },
                      { id: "english" as TabFilter, label: "English" },
                      { id: "other" as TabFilter, label: "Other Languages" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="h-32 rounded-xl border border-white/10 bg-white/5 animate-pulse"
                      />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <p className="text-sm text-red-400">
                      No voices found. {(error as Error)?.message || "Please try again."}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVoices.map((voice) => {
                      const sid = (selectedVoiceId || "").trim()
                      const sp = (selectedProvider || voice.provider || "piper").toLowerCase()
                      const vp = (voice.provider || "piper").toLowerCase()
                      const isSelected =
                        sid === (voice.id || "").trim() && sp === vp
                      const genderIcon =
                        (voice.gender || "").toLowerCase() === "female"
                          ? "♀"
                          : (voice.gender || "").toLowerCase() === "male"
                            ? "♂"
                            : "—"
                      return (
                        <div
                          key={`${voice.provider}:${voice.id}`}
                          className={cn(
                            "flex flex-col rounded-xl border transition-all text-left",
                            isSelected
                              ? "ring-2 ring-[#4DFFCE]/50 border-[#4DFFCE]/60 bg-white/10"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex items-start gap-3 px-4 pt-4">
                            <span className="text-xl shrink-0" title={voice.language}>
                              {getLangFlag(voice.language_code)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-white truncate">
                                  {voice.name}
                                </p>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/20 shrink-0">
                                  {getProviderLabel(voice.provider)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-white/70">
                                {voice.language || "Unknown"}
                                <span className="ml-1.5 text-white/50">{genderIcon}</span>
                              </p>
                              {voice.quality && (
                                <span
                                  className={cn(
                                    "inline-block mt-1 text-[10px] px-2 py-0.5 rounded border",
                                    qualityColor(voice.quality)
                                  )}
                                >
                                  {voice.quality}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-4 pb-3 pt-3 border-t border-dashed border-white/10 mt-3">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 text-xs"
                              onClick={() => handlePreview(voice)}
                            >
                              {previewingId === voice.id ? "Stop" : "▶ Preview"}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex-1 text-xs"
                              onClick={() => {
                                stopPreview()
                                onSelect(voice)
                                onClose()
                              }}
                            >
                              Use voice
                            </Button>
                          </div>
                        </div>
                      )
                    })}
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
