"use client"

import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { cn } from "@/components/lib-utils"

const MODAL_Z = 9998
const BACKDROP_Z = 9997

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
} as const

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** sm: narrow, md: default, lg/xl: wide, full: nearly full viewport */
  size?: keyof typeof sizeClasses
  /** Optional subtitle or description below title */
  subtitle?: ReactNode
  /** If true, content area scrolls (use for long forms/lists). Default true for lg/xl/full. */
  scrollable?: boolean
  /** Optional class for the panel */
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  subtitle,
  scrollable = size === "lg" || size === "xl" || size === "full",
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed inset-0 backdrop-blur-md",
              "bg-black/60",
              "cursor-default"
            )}
            style={{ zIndex: BACKDROP_Z }}
            onClick={onClose}
            aria-hidden
          />
          <div
            className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
            style={{ zIndex: MODAL_Z }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className={cn(
                "glass-card w-full flex flex-col border border-white/10 rounded-2xl",
                "pointer-events-auto overflow-hidden",
                "max-h-[90vh]",
                sizeClasses[size],
                className
              )}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 shrink-0 bg-white/[0.02]">
                <div className="min-w-0">
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold text-white tracking-tight"
                  >
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="text-sm text-white/60 mt-0.5">{subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <div
                className={cn(
                  "flex flex-col min-h-0 px-6 py-4",
                  scrollable && "overflow-y-auto"
                )}
              >
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
