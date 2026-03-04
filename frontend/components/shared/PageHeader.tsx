interface Props {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-6 mb-8">
      <div>
        <h1 className="text-2xl font-bold text-primary tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted mt-1.5 leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}

