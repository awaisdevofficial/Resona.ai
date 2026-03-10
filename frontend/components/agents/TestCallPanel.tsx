 "use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Volume2,
  Loader2,
} from "lucide-react"
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Track,
  createLocalTracks,
  ConnectionState,
} from "livekit-client"
import { api } from "@/lib/api"
import { cn } from "@/components/lib-utils"

interface TranscriptLine {
  id: string
  role: "user" | "agent"
  text: string
  timestamp: Date
}

interface TestCallPanelProps {
  agentId: string
  agentName: string
  open: boolean
  onClose: () => void
  /** When true, render as inline sticky sidebar card instead of fixed overlay */
  inline?: boolean
}

type CallState = "idle" | "connecting" | "connected" | "ended"

export function TestCallPanel({
  agentId,
  agentName,
  open,
  onClose,
  inline = false,
}: TestCallPanelProps) {
  const [callState, setCallState] = useState<CallState>("idle")
  const [muted, setMuted] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [agentAudioBlocked, setAgentAudioBlocked] = useState(false)

  const roomRef = useRef<Room | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenTranscriptsRef = useRef<Set<string>>(new Set())
  const callIdRef = useRef<string | null>(null)
  const callCompletedRef = useRef(false)
  const lastDurationRef = useRef(0)
  const prevOpenRef = useRef(open)
  const prevAgentIdRef = useRef(agentId)
  const [isEntering, setIsEntering] = useState(true)

  const resetPanelState = useCallback(() => {
    setCallState("idle")
    setTranscript([])
    setError(null)
    setDuration(0)
    setMuted(false)
    setAgentAudioBlocked(false)
    seenTranscriptsRef.current.clear()
  }, [])

  // Reset when panel closes; track closed so next open is detected
  useEffect(() => {
    if (!open) {
      resetPanelState()
      prevOpenRef.current = false
    }
  }, [open, resetPanelState])

  // When panel opens or user switches agent, show fresh "Start Call" / "Ready to test"
  useEffect(() => {
    if (!open) return
    const justOpened = prevOpenRef.current === false
    const agentChanged = prevAgentIdRef.current !== agentId
    if (justOpened || agentChanged) {
      resetPanelState()
    }
    prevOpenRef.current = open
    prevAgentIdRef.current = agentId
  }, [open, agentId, resetPanelState])

  // Entrance animation: slide in from right when panel first opens (open is true on mount)
  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntering(false))
    })
    return () => cancelAnimationFrame(t)
  }, [open])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      if (callState === "idle") setDuration(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  useEffect(() => {
    lastDurationRef.current = duration
  }, [duration])

  const sendTranscriptToServer = useCallback(
    (role: "user" | "agent", text: string) => {
      const callId = callIdRef.current
      if (!callId) return

      const backendRole = role === "agent" ? "assistant" : "user"

      api
        .post(`/v1/calls/${callId}/transcript`, {
          role: backendRole,
          text,
          timestamp: new Date().toISOString(),
        })
        .catch(() => {
          // Swallow errors – UI transcript is already updated
        })
    },
    []
  )

  const addTranscriptLine = useCallback(
    (role: "user" | "agent", text: string) => {
      const key = `${role}:${text}`
      if (seenTranscriptsRef.current.has(key)) return
      seenTranscriptsRef.current.add(key)
      setTimeout(() => seenTranscriptsRef.current.delete(key), 3000)

      setTranscript((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role, text, timestamp: new Date() },
      ])

      // Also persist to backend Call Logs
      sendTranscriptToServer(role, text)
    },
    [sendTranscriptToServer]
  )

  const completeCallOnServer = useCallback(() => {
    const callId = callIdRef.current
    if (!callId || callCompletedRef.current) return

    callCompletedRef.current = true
    const durationSeconds = lastDurationRef.current

    api
      .post(`/v1/calls/${callId}/complete`, {
        duration_seconds: durationSeconds,
        end_reason: "test_call_ended",
      })
      .catch(() => {
        // Best-effort – UI is already updated
      })
  }, [])

  async function startCall() {
    setError(null)
    setCallState("connecting")
    seenTranscriptsRef.current.clear()
    setTranscript([])
    callIdRef.current = null
    callCompletedRef.current = false

    try {
      const data = (await api.post(
        `/v1/agents/${agentId}/web-call-token`,
        {}
      )) as {
        token: string
        room_name: string
        livekit_url: string
        call_id?: string
      }

      if (data.call_id) {
        callIdRef.current = data.call_id
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      })
      roomRef.current = room

      room.on(
        RoomEvent.TrackSubscribed,
        (
          track: RemoteTrack,
          _pub: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement
            el.autoplay = true
            el.muted = false
            audioRef.current = el
            document.body.appendChild(el)
            // Browsers often require explicit play() after user gesture; Start Call is the gesture
            el.play().catch((e) => {
              console.warn("Agent audio autoplay blocked:", e)
              setAgentAudioBlocked(true)
            })
          }
        }
      )

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach()
      })

      // Handle data channel transcripts (our custom send_transcript)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload))
          if (msg.type === "transcript") {
            addTranscriptLine(msg.role === "agent" ? "agent" : "user", msg.text)
          }
        } catch {}
      })

      // Handle LiveKit native transcription (agent speech)
      room.on(
        RoomEvent.TranscriptionReceived,
        (segments: any[], participant: any) => {
          for (const segment of segments) {
            if (segment.final && segment.text?.trim()) {
              const isAgent = participant && participant.isAgent
              addTranscriptLine(isAgent ? "agent" : "user", segment.text.trim())
            }
          }
        }
      )

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Disconnected) {
          setCallState("ended")
          completeCallOnServer()
          cleanupRoom()
        }
      })

      room.on(RoomEvent.Disconnected, () => {
        setCallState("ended")
        cleanupRoom()
      })

      await room.connect(data.livekit_url, data.token)

      const tracks = await createLocalTracks({ audio: true, video: false })
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track)
      }
      setCallState("connected")
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error ? err.message : "Failed to connect. Try again."
      )
      setCallState("idle")
      cleanupRoom()
    }
  }

  const cleanupRoom = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.remove()
      audioRef.current = null
    }
    setAgentAudioBlocked(false)
  }, [])

  const playAgentAudio = useCallback(() => {
    const el = audioRef.current
    if (el) {
      el.play().then(() => setAgentAudioBlocked(false)).catch(() => {})
    }
  }, [])

  const hangUp = useCallback(async () => {
    cleanupRoom()
    setCallState("ended")
    completeCallOnServer()
  }, [cleanupRoom, completeCallOnServer])

  useEffect(() => {
    if (!open) {
      hangUp()
    }
  }, [open, hangUp])

  async function toggleMute() {
    if (!roomRef.current) return
    const newMuted = !muted
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted)
    setMuted(newMuted)
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0")
    const s = (secs % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  const panelContent = (
      <div
        className={cn(
          "flex flex-col h-full min-h-0",
          inline ? "rounded-xl border border-white/10 bg-[#0B0D10] shadow-modal" : ""
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-section-title text-white tracking-tight">
              Test Agent
            </h2>
            <p className="text-label text-white/70 mt-0.5 truncate max-w-[240px]" title={agentName}>{agentName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-3">
          {transcript.length === 0 && callState !== "connecting" && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-full bg-[#4DFFCE]/10 flex items-center justify-center flex-shrink-0">
                <Phone size={20} className="text-[#4DFFCE]" />
              </div>
              <div className="min-w-0 w-full max-w-[320px]">
                <p className="text-body font-semibold text-white">
                  Ready to test
                </p>
                <p className="text-label text-white/70 mt-1 leading-relaxed break-words">
                  Click Start Call to connect your browser directly to this
                  agent. The transcript will appear here in real time.
                </p>
              </div>
            </div>
          )}

          {callState === "connecting" && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={24} className="text-[#4DFFCE] animate-spin" />
              <p className="text-body text-white/70">Connecting to agent...</p>
            </div>
          )}

          {transcript.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex gap-2 min-w-0",
                line.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {line.role === "agent" && (
                <div className="h-6 w-6 rounded-full bg-[#4DFFCE]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Volume2 size={11} className="text-[#4DFFCE]" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-full min-w-0 px-3 py-2 rounded-xl text-xs leading-relaxed break-words",
                  line.role === "agent"
                    ? "bg-white/10 text-white rounded-tl-none border border-white/10"
                    : "bg-[#4DFFCE] text-[#07080A] rounded-tr-none"
                )}
              >
                {line.text}
              </div>
            </div>
          ))}

          {callState === "ended" && transcript.length > 0 && (
            <div className="text-center py-3">
              <span className="text-label text-white/70 bg-white/10 px-3 py-1 rounded-badge border border-white/10 font-medium">
                Call ended — {formatDuration(duration)}
              </span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-label text-red-400">
            {error}
          </div>
        )}

        {agentAudioBlocked && callState === "connected" && (
          <div className="mx-5 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-400">
            <p className="font-medium">No sound?</p>
            <p className="mt-0.5 text-[11px]">
              Your browser may have blocked audio. Click the button below to hear the agent.
            </p>
            <button
              type="button"
              onClick={playAgentAudio}
              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30"
            >
              Play agent audio
            </button>
          </div>
        )}

        <div className="px-5 py-4 border-t border-white/10">
          {callState === "idle" || callState === "ended" ? (
            <div className="space-y-3">
              {callState === "ended" && (
                <button
                  type="button"
                  onClick={() => {
                    setCallState("idle")
                    setTranscript([])
                    setError(null)
                  }}
                  className="btn-secondary w-full px-4 py-2 text-sm"
                >
                  Clear and reset
                </button>
              )}
              <button
                type="button"
                onClick={startCall}
                className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
              >
                <Phone size={15} />
                {callState === "ended" ? "Call again" : "Start Call"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border",
                  muted
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                    : "bg-white/5 border-white/20 text-white hover:bg-white/10"
                )}
              >
                {muted ? <MicOff size={15} /> : <Mic size={15} />}
                {muted ? "Unmute" : "Mute"}
              </button>

              {callState === "connected" && (
                <span className="text-xs tabular-nums text-white/70 min-w-[40px] text-center font-medium">
                  {formatDuration(duration)}
                </span>
              )}

              <button
                type="button"
                onClick={hangUp}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                <PhoneOff size={15} />
                End Call
              </button>
            </div>
          )}

          <p className="text-label text-white/70 text-center mt-3 break-words px-1">
            This is a browser-based test call. No phone line is used.
          </p>
        </div>
      </div>
    )

  if (inline) {
    return (
      <div className="sticky top-24 flex flex-col min-h-[420px] max-h-[calc(100vh-7rem)]">
        {panelContent}
      </div>
    )
  }

  const overlay = (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-300 ease-out",
          "bg-black/40 backdrop-blur-[4px]",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-label="Close test call panel"
      />
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 flex flex-col",
          "w-full max-w-[420px] min-w-0 h-screen min-h-screen",
          "bg-[#0B0D10] border-l border-white/10 shadow-[-8px_0_32px_rgba(0,0,0,0.5)]",
          "transition-[transform,opacity] duration-350 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
          open && !isEntering ? "translate-x-0 opacity-100" : "translate-x-full opacity-95"
        )}
      >
        {panelContent}
      </div>
    </>
  )

  if (typeof document !== "undefined") {
    return createPortal(overlay, document.body)
  }
  return null
}

