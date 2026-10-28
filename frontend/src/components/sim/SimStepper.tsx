interface StepMeta {
  index: number
  label: string
  badge?: string
  badgeOk?: boolean | null
}

interface Props {
  activeStep: number
  resultsReady: boolean
  hasDeadlock: boolean
  safetyLabel: string | null
  detectionLabel: string | null
  preventionLabel: string | null
  recoveryLabel: string | null
  onSelect: (step: number) => void
}

const STEP_NAMES = ['Scenario', 'Need Matrix', 'Avoidance', 'Detection', 'Prevention', 'Recovery']

function badgeClasses(ok: boolean | null | undefined) {
  if (ok === true)  return 'border-neutral-400 text-neutral-700 bg-neutral-100'
  if (ok === false) return 'border-red-300 text-red-600 bg-red-50'
  return 'border-neutral-200 text-neutral-500 bg-white'
}

export default function SimStepper({ activeStep, resultsReady, hasDeadlock, safetyLabel, detectionLabel, preventionLabel, recoveryLabel, onSelect }: Props) {
  function buildMeta(): StepMeta[] {
    return [
      { index: 1, label: STEP_NAMES[0] },
      { index: 2, label: STEP_NAMES[1] },
      { index: 3, label: STEP_NAMES[2], badge: safetyLabel ?? undefined, badgeOk: safetyLabel === 'SAFE' ? true : safetyLabel ? false : null },
      { index: 4, label: STEP_NAMES[3], badge: detectionLabel ?? undefined, badgeOk: detectionLabel === 'NO DEADLOCK' ? true : detectionLabel ? false : null },
      { index: 5, label: STEP_NAMES[4], badge: preventionLabel ?? undefined, badgeOk: null },
      { index: 6, label: STEP_NAMES[5], badge: recoveryLabel ?? undefined, badgeOk: recoveryLabel === 'RESOLVED' ? true : recoveryLabel === 'FAILED' ? false : null },
    ]
  }

  const steps = buildMeta()

  return (
    <div className="bg-white border border-neutral-200 rounded-sm p-5">
      {/* Horizontal — md+ */}
      <ol className="hidden md:flex items-start justify-between gap-1">
        {steps.map((s, idx) => {
          const isActive = s.index === activeStep
          const isLocked = s.index === 6 && !hasDeadlock && resultsReady
          const clickable = resultsReady && !isLocked

          return (
            <li key={s.index} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="flex w-full items-center">
                <div className={`flex-1 h-px ${idx === 0 ? 'invisible' : 'bg-neutral-200'}`} />
                <button
                  onClick={() => clickable && onSelect(s.index)}
                  disabled={!clickable}
                  title={isLocked ? 'Only available when a deadlock is detected' : undefined}
                  className={[
                    'w-8 h-8 rounded-sm border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-150',
                    isActive   ? 'border-black bg-black text-white'
                    : clickable ? 'border-neutral-300 bg-white text-neutral-500 hover:border-black hover:text-black cursor-pointer'
                               : 'border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed',
                  ].join(' ')}
                >
                  {s.index}
                </button>
                <div className={`flex-1 h-px ${idx === steps.length - 1 ? 'invisible' : 'bg-neutral-200'}`} />
              </div>

              <span className={[
                'text-xs text-center leading-tight transition-colors truncate max-w-full px-1 tracking-wide font-medium',
                isActive ? 'text-black' : isLocked ? 'text-neutral-200' : 'text-neutral-400',
              ].join(' ')}>
                {s.label}
              </span>

              {s.badge && (
                <span className={['text-[9px] px-1.5 py-0.5 border rounded-sm font-bold whitespace-nowrap', badgeClasses(s.badgeOk)].join(' ')}>
                  {s.badge}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* Vertical — mobile */}
      <ol className="md:hidden flex flex-col gap-1.5">
        {steps.map((s) => {
          const isActive = s.index === activeStep
          const isLocked = s.index === 6 && !hasDeadlock && resultsReady
          const clickable = resultsReady && !isLocked

          return (
            <li key={s.index}>
              <button
                onClick={() => clickable && onSelect(s.index)}
                disabled={!clickable}
                className={[
                  'w-full flex items-center gap-3 px-4 py-3 rounded-sm transition-colors text-left border',
                  isActive ? 'bg-neutral-100 border-neutral-300' : 'border-transparent hover:bg-neutral-50',
                  !clickable && 'opacity-30 cursor-not-allowed',
                ].join(' ')}
              >
                <span className={[
                  'w-7 h-7 rounded-sm border-2 flex items-center justify-center text-sm font-bold shrink-0',
                  isActive ? 'border-black bg-black text-white' : 'border-neutral-300 text-neutral-400',
                ].join(' ')}>
                  {s.index}
                </span>
                <span className={`text-base flex-1 font-medium ${isActive ? 'text-black' : 'text-neutral-500'}`}>{s.label}</span>
                {s.badge && (
                  <span className={['text-[9px] px-1.5 py-0.5 border rounded-sm font-bold', badgeClasses(s.badgeOk)].join(' ')}>
                    {s.badge}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
