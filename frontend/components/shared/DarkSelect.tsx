"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/lib-utils";

export type DarkSelectOption = { value: string; label: string };

interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Custom dropdown with dark theme. Avoids native <select> white option backgrounds.
 */
export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  id,
  "aria-label": ariaLabel,
}: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label ?? placeholder;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "form-input w-full flex items-center justify-between gap-2 text-left",
          "cursor-pointer"
        )}
      >
        <span className={value ? "text-white" : "text-white/55"}>{displayLabel}</span>
        <ChevronDown
          size={16}
          className={cn("text-white/70 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-activedescendant={value ? `option-${value}` : undefined}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-white/10 bg-[#0B0D10] py-1 shadow-xl"
        >
          {options.map((opt) => (
            <li
              key={opt.value}
              id={`option-${opt.value}`}
              role="option"
              aria-selected={value === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "px-4 py-2.5 text-sm cursor-pointer transition-colors",
                value === opt.value
                  ? "bg-[#4DFFCE]/20 text-[#4DFFCE]"
                  : "text-white hover:bg-white/10"
              )}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
