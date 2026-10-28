import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function SectionCard({ title, subtitle, action, children, className = '' }: Props) {
  return (
    <div className={`card p-5 sm:p-6 space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-label">{title}</h2>
          {subtitle && (
            <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}
