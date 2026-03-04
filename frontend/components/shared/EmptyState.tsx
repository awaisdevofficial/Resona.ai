interface Props {
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6 shadow-card">
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="#6C63FF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-primary mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-muted max-w-sm leading-relaxed mb-6">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-card"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

