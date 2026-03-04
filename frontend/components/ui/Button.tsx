"use client";

import { cn } from "@/components/lib-utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand/30 active:scale-[0.98]",
  secondary:
    "bg-surface border border-border text-text-primary hover:bg-gray-50 focus-visible:ring-border active:scale-[0.98]",
  danger:
    "bg-red-50 text-error hover:bg-red-100 focus-visible:ring-error/30 active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary hover:bg-background hover:text-text-primary active:scale-[0.98]",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs font-medium rounded-button",
  md: "px-4 py-2 text-body font-medium rounded-button",
  lg: "px-5 py-2.5 text-body font-semibold rounded-button",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
