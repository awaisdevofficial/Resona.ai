import { cn } from "../lib-utils"

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: "none" | "sm" | "md" | "lg"
  hover?: boolean
}

export function Card({
  children,
  className,
  padding = "md",
  hover = false,
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-xl border border-border shadow-card transition-all duration-200",
        padding === "none" && "p-0",
        padding === "sm" && "p-4",
        padding === "md" && "p-6",
        padding === "lg" && "p-8",
        hover && "hover:shadow-md hover:border-border/80",
        className
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 mb-4",
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-primary tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-muted mt-0.5 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
