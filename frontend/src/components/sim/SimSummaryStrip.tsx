/**
 * SimSummaryStrip — compact 4-outcome summary bar shown at the top of
 * Auto Simulation once all API results are available.
 */

interface Props {
  safetyLabel: string       // "SAFE" | "UNSAFE"
  isSafe: boolean
  detectionLabel: string    // "NO DEADLOCK" | "DEADLOCKED"
  isDeadlocked: boolean
  conditionsPresent: number // 0-4
  recoveryLabel: string | null  // "RESOLVED" | "FAILED" | null
}

interface Pill {
  label: string
  value: string
  ok: boolean | null  // null = neutral
}

export default function SimSummaryStrip({
  safetyLabel,
  isSafe,
  detectionLabel,
  isDeadlocked,
  conditionsPresent,
  recoveryLabel,
}: Props) {
  const pills: Pill[] = [
    { label: 'Avoidance', value: safetyLabel, ok: isSafe },
    { label: 'Detection', value: detectionLabel, ok: !isDeadlocked },
    { label: 'Conditions', value: `${conditionsPresent}/4 present`, ok: conditionsPresent === 0 },
    {
      label: 'Recovery',
      value: recoveryLabel ?? (isDeadlocked ? 'Pending' : 'N/A'),
      ok: recoveryLabel === 'RESOLVED' ? true : recoveryLabel === 'FAILED' ? false : null,
    },
  ]

  function pillClasses(ok: boolean | null) {
    if (ok === true)  return 'bg-green-900/60 border border-green-700 text-green-300'
    if (ok === false) return 'bg-red-900/60 border border-red-700 text-red-300'
    return 'bg-gray-800 border border-gray-700 text-gray-400'
  }

  return (
    <div className="bg-gray-900/80 rounded-xl border border-gray-700 px-4 py-3 flex flex-wrap gap-3 items-center">
      <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0 mr-1">
        Summary
      </span>
      {pills.map((p) => (
        <div key={p.label} className={['rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[80px]', pillClasses(p.ok)].join(' ')}>
          <span className="text-[10px] uppercase tracking-wide opacity-70">{p.label}</span>
          <span className="text-xs font-bold mt-0.5 whitespace-nowrap">{p.value}</span>
        </div>
      ))}
    </div>
  )
}
