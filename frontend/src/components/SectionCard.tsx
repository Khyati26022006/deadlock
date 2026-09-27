import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  className?: string
}

export default function SectionCard({ title, children, className = '' }: Props) {
  return (
    <div className={`bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4 ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">{title}</h2>
      {children}
    </div>
  )
}
