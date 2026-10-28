import { useState } from 'react'

interface Step {
  iteration: number
  process_index: number
  process_qualified: boolean
  work_before: number[]
  work_after: number[]
  finish_vector: boolean[]
  note: string
}

interface Props {
  steps: Step[]
  processIds?: string[]
}

export default function StepTrace({ steps, processIds }: Props) {
  const [open, setOpen] = useState(false)

  if (steps.length === 0) return null

  return (
    <div className="card overflow-hidden transition-all">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-neutral-50/70 hover:bg-neutral-100/70 transition-colors cursor-pointer group text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-neutral-800" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 group-hover:text-neutral-900 transition-colors">
            Algorithm Trace &bull; {steps.length} {steps.length === 1 ? 'iteration' : 'iterations'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 group-hover:text-neutral-600 transition-colors">
            {open ? 'Hide details' : 'View steps'}
          </span>
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-100 divide-y divide-neutral-100 bg-white">
          {steps.map((s, idx) => {
            const pid = processIds?.[s.process_index] ?? `P${s.process_index}`
            return (
              <div key={idx} className="px-5 py-3 flex items-start gap-3 hover:bg-neutral-50/50 transition-colors">
                <div
                  className={[
                    'mt-1.5 shrink-0 w-2 h-2 rounded-full',
                    s.process_qualified ? 'bg-neutral-900' : 'bg-neutral-300',
                  ].join(' ')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-medium text-neutral-400">#{s.iteration}</span>
                    <span className="text-xs font-mono font-bold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                      {pid}
                    </span>
                    <span
                      className={[
                        'text-xs font-medium px-2 py-0.5 rounded-full border',
                        s.process_qualified
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-neutral-100 text-neutral-500 border-neutral-200',
                      ].join(' ')}
                    >
                      {s.process_qualified ? 'Qualified' : 'Skipped'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1 font-mono leading-relaxed break-words">{s.note}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
