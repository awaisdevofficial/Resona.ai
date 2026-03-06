"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Trash2, Copy, Pencil, Phone, Beaker } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

interface AgentCardProps {
  id: string;
  name: string;
  description?: string | null;
  tts_voice_id?: string;
  voiceName?: string;
  is_active?: boolean;
  call_count?: number;
  system_prompt?: string | null;
  onTestCall?: () => void;
}

export function AgentCard({
  id,
  name,
  description,
  tts_voice_id,
  voiceName,
  is_active = true,
  call_count = 0,
  system_prompt,
  onTestCall,
}: AgentCardProps) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const deleteAgent = useMutation({
    mutationFn: () => api.delete(`/v1/agents/${id}`),
    onSuccess: () => {
      toast.success("Agent deleted");
      qc.invalidateQueries({ queryKey: ["agents"] });
      setMenuOpen(false);
    },
    onError: () => toast.error("Failed to delete agent"),
  });

  const duplicateAgent = useMutation({
    mutationFn: () => api.post(`/v1/agents/${id}/duplicate`, {}),
    onSuccess: () => {
      toast.success("Agent duplicated");
      qc.invalidateQueries({ queryKey: ["agents"] });
      setMenuOpen(false);
    },
    onError: () => toast.error("Failed to duplicate"),
  });

  const descriptionDisplay =
    description?.trim() ||
    (system_prompt
      ? `${(system_prompt || "").slice(0, 100)}${(system_prompt || "").length > 100 ? "…" : ""}`
      : "No description.");
  const voiceLabel =
    voiceName ??
    (tts_voice_id
      ? tts_voice_id.length > 14
        ? `${tts_voice_id.slice(0, 10)}…`
        : tts_voice_id
      : "Default");
  const initials = (name || "A").slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-white/[0.03] p-6 transition-all duration-300",
        "hover:border-[#4DFFCE]/25 hover:bg-white/[0.05] hover:shadow-[0_0_0_1px_rgba(77,255,206,0.08)]",
        "border-white/10"
      )}
    >
      {/* Top: avatar + name + menu */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition-colors",
              is_active
                ? "bg-[#4DFFCE]/15 text-[#4DFFCE] border border-[#4DFFCE]/25"
                : "bg-white/10 text-white/50 border border-white/10"
            )}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">
              {name || "Untitled agent"}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-md px-2 text-[10px] font-medium uppercase tracking-wider",
                  is_active
                    ? "bg-[#4DFFCE]/15 text-[#4DFFCE]"
                    : "bg-white/10 text-white/50"
                )}
              >
                {is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-white/10 bg-[#0f1216] py-1 shadow-xl">
              <Link
                href={`/agents/${id}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Pencil size={14} />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => duplicateAgent.mutate()}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white text-left transition-colors"
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${name}"? This cannot be undone.`)) {
                    deleteAgent.mutate();
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 text-left transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-white/60 line-clamp-2 mb-5 min-h-[2.5rem] leading-relaxed">
        {descriptionDisplay}
      </p>

      {/* Meta: voice + calls */}
      <div className="flex flex-wrap items-center gap-3 mb-5 text-xs">
        <span className="rounded-lg bg-white/5 px-2.5 py-1.5 text-white/70 border border-white/5">
          Voice: {voiceLabel}
        </span>
        <span className="flex items-center gap-1.5 text-white/50">
          <Phone size={12} />
          {call_count.toLocaleString()} calls
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTestCall?.();
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#4DFFCE] px-4 py-2.5 text-sm font-semibold text-[#07080A] transition-all hover:bg-[#5affd6] hover:shadow-[0_0_20px_rgba(77,255,206,0.25)]"
        >
          <Beaker size={14} />
          Test
        </button>
        <Link
          href={`/agents/${id}`}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent px-4 py-2.5 text-sm font-medium text-white transition-all hover:border-[#4DFFCE]/40 hover:bg-white/5"
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>
    </div>
  );
}
