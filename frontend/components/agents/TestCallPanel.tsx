 "use client"

import { useEffect, useRef, useState, useCallback } from "react"
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
}

type CallState = "idle" | "connecting" | "connected" | "ended"

export function TestCallPanel({
  agentId,
  agentName,
  open,
  onClose,
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
        if (state === ConnectionState.Connected) {
          setCallState("connected")
        }
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
    const enabled = !muted
    await roomRef.current.localParticipant.setMicrophoneEnabled(enabled)
    setMuted(!enabled)
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0")
    const s = (secs % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-[420px] bg-surface border-l border-border shadow-modal z-50",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-section-title text-text-primary tracking-tight">
              Test Agent
            </h2>
            <p className="text-label text-text-muted mt-0.5">{agentName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-button hover:bg-background text-text-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {transcript.length === 0 && callState !== "connecting" && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center">
                <Phone size={20} className="text-brand" />
              </div>
              <div>
                <p className="text-body font-semibold text-text-primary">
                  Ready to test
                </p>
                <p className="text-label text-text-muted mt-1 max-w-[260px] leading-relaxed">
                  Click Start Call to connect your browser directly to this
                  agent. The transcript will appear here in real time.
                </p>
              </div>
            </div>
          )}

          {callState === "connecting" && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={24} className="text-brand animate-spin" />
              <p className="text-body text-text-muted">Connecting to agent...</p>
            </div>
          )}

          {transcript.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex gap-2",
                line.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {line.role === "agent" && (
                <div className="h-6 w-6 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Volume2 size={11} className="text-brand" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[300px] px-3 py-2 rounded-xl text-xs leading-relaxed",
                  line.role === "agent"
                    ? "bg-background text-text-primary rounded-tl-none border border-border"
                    : "bg-brand text-white rounded-tr-none"
                )}
              >
                {line.text}
              </div>
            </div>
          ))}

          {callState === "ended" && transcript.length > 0 && (
            <div className="text-center py-3">
              <span className="text-label text-text-muted bg-background px-3 py-1 rounded-badge border border-border font-medium">
                Call ended — {formatDuration(duration)}
              </span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-input border border-error/30 bg-red-50 px-3 py-2 text-label text-error">
            {error}
          </div>
        )}

        {agentAudioBlocked && callState === "connected" && (
          <div className="mx-5 mb-3 rounded-input border border-amber-200 bg-amber-50 px-3 py-2 text-label text-amber-800">
            <p className="font-medium">No sound?</p>
            <p className="mt-0.5 text-[11px]">
              Your browser may have blocked audio. Click the button below to hear the agent.
            </p>
            <button
              type="button"
              onClick={playAgentAudio}
              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-200 text-amber-900 text-xs font-medium hover:bg-amber-300"
            >
              Play agent audio
            </button>
          </div>
        )}

        <div className="px-5 py-4 border-t border-border">
          {callState === "idle" || callState === "ended" ? (
            <div className="space-y-3">
              {callState === "ended" && (
                <button
                  onClick={() => {
                    setCallState("idle")
                    setTranscript([])
                    setError(null)
                  }}
                  className="w-full px-4 py-2 border border-border text-body font-medium text-text-primary rounded-button hover:bg-background transition-colors"
                >
                  Clear and reset
                </button>
              )}
              <button
                onClick={startCall}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white text-body font-medium rounded-button hover:bg-brand-dark transition-all duration-150 active:scale-95"
              >
                <Phone size={15} />
                {callState === "ended" ? "Call again" : "Start Call"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border",
                  muted
                    ? "bg-amber-50 border-amber-200 text-warning"
                    : "bg-background border-border text-text-primary hover:bg-background/80"
                )}
              >
                {muted ? <MicOff size={15} /> : <Mic size={15} />}
                {muted ? "Unmute" : "Mute"}
              </button>

              {callState === "connected" && (
                <span className="text-xs tabular-nums text-muted min-w-[40px] text-center font-medium">
                  {formatDuration(duration)}
                </span>
              )}

              <button
                onClick={hangUp}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                <PhoneOff size={15} />
                End Call
              </button>
            </div>
          )}

          <p className="text-label text-text-muted text-center mt-3">
            This is a browser-based test call. No phone or Twilio is used.
          </p>
        </div>
      </div>
    </>
  )
}

