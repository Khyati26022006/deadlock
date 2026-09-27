/**
 * StepTrace – expandable step-by-step execution trace.
 * Works for both IterationSnapshot (Banker's) and DetectionSnapshot.
 */

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
    <div className="bg-gray-900 rounded-xl border border-gray-700">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <span className="font-medium uppercase tracking-widest text-xs text-gray-500">
          Step-by-step trace ({steps.length} steps)
        </span>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-700 divide-y divide-gray-800">
          {steps.map((s, idx) => {
            const pid = processIds?.[s.process_index] ?? `P${s.process_index}`
            return (
              <div key={idx} className="px-4 py-3 flex items-start gap-3">
                <span
                  className={[
                    'mt-0.5 shrink-0 w-2 h-2 rounded-full',
                    s.process_qualified ? 'bg-green-500' : 'bg-gray-600',
                  ].join(' ')}
                />
                <div className="min-w-0">
                  <p className="text-xs font-mono text-gray-200">
                    Step {s.iteration} — {pid}{' '}
                    <span
                      className={
                        s.process_qualified ? 'text-green-400' : 'text-gray-500'
                      }
                    >
                      {s.process_qualified ? '✓ qualified' : '✗ skipped'}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 break-words">{s.note}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
