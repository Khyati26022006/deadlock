interface Props {
  safetyLabel: string
  isSafe: boolean
  detectionLabel: string
  isDeadlocked: boolean
  conditionsPresent: number
  recoveryLabel: string | null
}

interface Pill { label: string; value: string; ok: boolean | null }

export default function SimSummaryStrip({ safetyLabel, isSafe, detectionLabel, isDeadlocked, conditionsPresent, recoveryLabel }: Props) {
  const pills: Pill[] = [
    { label: 'Avoidance',  value: safetyLabel,   ok: isSafe },
    { label: 'Detection',  value: detectionLabel, ok: !isDeadlocked },
    { label: 'Conditions', value: `${conditionsPresent}/4`, ok: conditionsPresent === 0 },
    { label: 'Recovery',   value: recoveryLabel ?? (isDeadlocked ? 'Pending' : 'N/A'), ok: recoveryLabel === 'RESOLVED' ? true : recoveryLabel === 'FAILED' ? false : null },
  ]

  function pillClasses(ok: boolean | null) {
    if (ok === true)  return 'border-neutral-300 text-neutral-700 bg-neutral-50'
    if (ok === false) return 'border-red-300 text-red-600 bg-red-50'
    return 'border-neutral-200 text-neutral-500 bg-white'
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-sm px-5 py-4 flex flex-wrap gap-3 items-center">
      <span className="section-label shrink-0 mr-2">Results</span>
      {pills.map((p) => (
        <div key={p.label} className={['border rounded-sm px-4 py-2 flex flex-col items-center min-w-[80px]', pillClasses(p.ok)].join(' ')}>
          <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">{p.label}</span>
          <span className="text-sm font-bold mt-0.5 whitespace-nowrap font-mono">{p.value}</span>
        </div>
      ))}
    </div>
  )
}
