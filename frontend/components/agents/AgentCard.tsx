"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MoreVertical, Trash2, Copy, Mic, Phone } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import toast from "react-hot-toast"

import { api } from "@/lib/api"
import { cn } from "../lib-utils"

interface AgentCardProps {
  id: string
  name: string
  description?: string | null
  tts_voice_id?: string
  is_active?: boolean
  call_count?: number
  onTestCall?: () => void
}

export function AgentCard({
  id,
  name,
  description,
  tts_voice_id,
  is_active = true,
  call_count = 0,
  onTestCall,
}: AgentCardProps) {
  const router = useRouter()
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)

  const deleteAgent = useMutation({
    mutationFn: () => api.delete(`/v1/agents/${id}`),
    onSuccess: () => {
      toast.success("Agent deleted")
      qc.invalidateQueries({ queryKey: ["agents"] })
      setMenuOpen(false)
    },
  })

  const duplicateAgent = useMutation({
    mutationFn: () => api.post(`/v1/agents/${id}/duplicate`, {}),
    onSuccess: () => {
      toast.success("Agent duplicated")
      qc.invalidateQueries({ queryKey: ["agents"] })
      setMenuOpen(false)
    },
  })

  // Dismiss menu when clicking outside
  function handleCardClick() {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    router.push(`/agents/${id}`)
  }

  return (
    <div
      className={cn(
        "relative bg-surface border border-border rounded-xl shadow-card px-5 py-4",
        "flex items-center gap-4 hover:bg-gray-50/80 hover:shadow-md hover:border-border/80 transition-all duration-200 cursor-pointer"
      )}
      onClick={handleCardClick}
    >
      {/* Left: status + name + description */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span
          className={cn(
            "inline-flex h-2 w-2 rounded-full flex-shrink-0",
            is_active ? "bg-emerald-400" : "bg-gray-300"
          )}
        />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary truncate tracking-tight">
            {name}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-1">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Middle: voice badge */}
      <div className="flex items-center gap-2 min-w-[140px] justify-end">
        {tts_voice_id ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/5 text-[11px] text-brand font-medium border border-brand/20">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white text-[9px] font-bold">
              11
            </span>
            <Mic size={10} />
            {tts_voice_id}
          </span>
        ) : (
          <span className="text-xs text-muted">No voice set</span>
        )}
      </div>

      {/* Right: call count + test button + menu */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <p className="text-xs text-muted min-w-[70px] text-right">
          {call_count} {call_count === 1 ? "call" : "calls"}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onTestCall?.()
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white text-xs font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-card"
        >
          <Phone size={12} />
          Test
        </button>

        {/* Three-dot menu — stop propagation so row click doesn't fire */}
        <div
          className="relative flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-muted transition-colors"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-xl shadow-lg z-10 py-1.5 text-sm font-medium">
              <button
                type="button"
                onClick={() => router.push(`/agents/${id}`)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-primary rounded-lg mx-1"
              >
                <span className="flex-1">Edit</span>
              </button>
              <button
                type="button"
                onClick={() => duplicateAgent.mutate()}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-primary rounded-lg mx-1"
              >
                <Copy size={12} />
                <span className="flex-1">Duplicate</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete agent "${name}"? This cannot be undone.`)) {
                    deleteAgent.mutate()
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-left text-red-600 rounded-lg mx-1"
              >
                <Trash2 size={12} />
                <span className="flex-1">Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
