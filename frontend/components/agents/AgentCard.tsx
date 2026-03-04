"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Trash2, Copy, Mic, Phone, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { cn } from "@/components/lib-utils";

interface AgentCardProps {
  id: string;
  name: string;
  description?: string | null;
  tts_voice_id?: string;
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
  is_active = true,
  call_count = 0,
  system_prompt,
  onTestCall,
}: AgentCardProps) {
  const router = useRouter();
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

  const promptPreview = (system_prompt || "No system prompt.").slice(0, 80);
  const promptDisplay = promptPreview.length >= 80 ? `${promptPreview}...` : promptPreview;

  function handleCardClick() {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    router.push(`/agents/${id}`);
  }

  return (
    <div
      className={cn(
        "relative bg-surface border border-border rounded-card shadow-card p-5",
        "flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-dropdown hover:border-border/80",
        "transition-all duration-200 cursor-pointer"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full flex-shrink-0",
              is_active ? "bg-success" : "bg-text-muted"
            )}
          />
          <h3 className="text-section-title text-text-primary truncate">
            {name || "Untitled agent"}
          </h3>
        </div>
        <div
          ref={menuRef}
          className="relative shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-button text-text-muted hover:text-text-primary hover:bg-background transition-all duration-150 active:scale-95"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-button shadow-dropdown z-10 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`/agents/${id}`);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-body text-text-primary hover:bg-background text-left rounded-button mx-1 transition-colors"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => duplicateAgent.mutate()}
                className="w-full flex items-center gap-2 px-3 py-2 text-body text-text-primary hover:bg-background text-left rounded-button mx-1 transition-colors"
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete agent "${name}"? This cannot be undone.`)) {
                    deleteAgent.mutate();
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-body text-error hover:bg-red-50 text-left rounded-button mx-1 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-body text-text-secondary line-clamp-2 min-h-[2.5rem]">
        {promptDisplay}
      </p>

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
        <span className="text-label text-text-muted">
          {tts_voice_id ? (
            <span className="inline-flex items-center gap-1.5">
              <Mic size={12} className="text-brand" />
              {tts_voice_id}
            </span>
          ) : (
            "No voice"
          )}
        </span>
        <span className="text-label text-text-muted">
          {call_count} {call_count === 1 ? "call" : "calls"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTestCall?.();
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-brand text-white text-label font-semibold rounded-button hover:bg-brand-dark transition-all duration-150 active:scale-95"
        >
          <Phone size={12} />
          Test
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/agents/${id}`);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-border text-text-primary text-label font-medium rounded-button hover:bg-background transition-all duration-150 active:scale-95"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>
    </div>
  );
}
