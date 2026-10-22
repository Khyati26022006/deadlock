/**
 * SimStepper — horizontal (desktop) / vertical (mobile) step navigator
 * for the Auto Simulation page.
 *
 * Behaviour:
 *  • Every step is clickable once results are loaded.
 *  • Recovery (step 6) is greyed-out with a tooltip when there is no deadlock.
 *  • The active step is highlighted.
 *  • Status badges reflect real result data.
 */

interface StepMeta {
  index: number        // 1-based
  label: string
  badge?: string
  badgeColor?: 'green' | 'amber' | 'red' | 'blue' | 'gray'
}

interface Props {
  activeStep: number                 // 1-based
  resultsReady: boolean
  hasDeadlock: boolean
  safetyLabel: string | null         // "SAFE" | "UNSAFE" | null
  detectionLabel: string | null      // "NO DEADLOCK" | "DEADLOCKED" | null
  preventionLabel: string | null     // "N/4 conditions"
  recoveryLabel: string | null       // "RESOLVED" | "FAILED" | null
  onSelect: (step: number) => void
}

const STEP_NAMES = [
  'Scenario',
  'Need Matrix',
  'Avoidance',
  'Detection',
  'Prevention',
  'Recovery',
]

function badgeClasses(color: StepMeta['badgeColor']) {
  switch (color) {
    case 'green': return 'bg-green-900 border border-green-600 text-green-300'
    case 'amber': return 'bg-yellow-900 border border-yellow-600 text-yellow-300'
    case 'red':   return 'bg-red-900 border border-red-600 text-red-300'
    case 'blue':  return 'bg-blue-900 border border-blue-600 text-blue-300'
    default:      return 'bg-gray-800 border border-gray-600 text-gray-400'
  }
}

export default function SimStepper({
  activeStep,
  resultsReady,
  hasDeadlock,
  safetyLabel,
  detectionLabel,
  preventionLabel,
  recoveryLabel,
  onSelect,
}: Props) {
  function buildMeta(): StepMeta[] {
    const steps: StepMeta[] = [
      { index: 1, label: 'Scenario' },
      { index: 2, label: 'Need Matrix' },
      {
        index: 3,
        label: 'Avoidance',
        badge: safetyLabel ?? undefined,
        badgeColor: safetyLabel === 'SAFE' ? 'green' : safetyLabel ? 'amber' : undefined,
      },
      {
        index: 4,
        label: 'Detection',
        badge: detectionLabel ?? undefined,
        badgeColor:
          detectionLabel === 'NO DEADLOCK'
            ? 'green'
            : detectionLabel === 'DEADLOCKED'
            ? 'red'
            : undefined,
      },
      {
        index: 5,
        label: 'Prevention',
        badge: preventionLabel ?? undefined,
        badgeColor: preventionLabel ? 'blue' : undefined,
      },
      {
        index: 6,
        label: 'Recovery',
        badge: recoveryLabel ?? undefined,
        badgeColor: recoveryLabel === 'RESOLVED' ? 'green' : recoveryLabel ? 'red' : undefined,
      },
    ]
    return steps
  }

  const steps = buildMeta()

  return (
    /* Horizontal on md+, vertical on sm */
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      {/* horizontal row */}
      <ol className="hidden md:flex items-start justify-between gap-1">
        {steps.map((s, idx) => {
          const isActive = s.index === activeStep
          const isRecoveryLocked = s.index === 6 && !hasDeadlock && resultsReady
          const clickable = resultsReady && !isRecoveryLocked

          return (
            <li key={s.index} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              {/* connector line (not on first) */}
              <div className="flex w-full items-center">
                <div className={`flex-1 h-px ${idx === 0 ? 'invisible' : 'bg-gray-700'}`} />

                {/* circle */}
                <button
                  onClick={() => clickable && onSelect(s.index)}
                  disabled={!clickable}
                  title={isRecoveryLocked ? 'Only available when Detection finds a deadlock' : undefined}
                  className={[
                    'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all',
                    isActive
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : clickable
                      ? 'border-gray-600 bg-gray-800 text-gray-300 hover:border-indigo-400 hover:bg-gray-700 cursor-pointer'
                      : 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed opacity-50',
                  ].join(' ')}
                >
                  {s.index}
                </button>

                <div className={`flex-1 h-px ${idx === steps.length - 1 ? 'invisible' : 'bg-gray-700'}`} />
              </div>

              {/* label */}
              <span
                className={[
                  'text-xs text-center leading-tight transition-colors truncate max-w-full px-1',
                  isActive ? 'text-indigo-300 font-semibold' : isRecoveryLocked ? 'text-gray-600' : 'text-gray-400',
                ].join(' ')}
              >
                {s.label}
              </span>

              {/* badge */}
              {s.badge && (
                <span
                  className={[
                    'text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap',
                    badgeClasses(s.badgeColor),
                  ].join(' ')}
                >
                  {s.badge}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* vertical list on mobile */}
      <ol className="md:hidden flex flex-col gap-2">
        {steps.map((s) => {
          const isActive = s.index === activeStep
          const isRecoveryLocked = s.index === 6 && !hasDeadlock && resultsReady
          const clickable = resultsReady && !isRecoveryLocked

          return (
            <li key={s.index}>
              <button
                onClick={() => clickable && onSelect(s.index)}
                disabled={!clickable}
                title={isRecoveryLocked ? 'Only available when Detection finds a deadlock' : undefined}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                  isActive
                    ? 'bg-indigo-600/30 border border-indigo-500'
                    : clickable
                    ? 'hover:bg-gray-800 border border-transparent cursor-pointer'
                    : 'opacity-40 cursor-not-allowed border border-transparent',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0',
                    isActive ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-gray-600 bg-gray-800 text-gray-400',
                  ].join(' ')}
                >
                  {s.index}
                </span>
                <span className={`text-sm flex-1 ${isActive ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {s.label}
                </span>
                {s.badge && (
                  <span className={['text-[10px] px-1.5 py-0.5 rounded-full font-semibold', badgeClasses(s.badgeColor)].join(' ')}>
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
