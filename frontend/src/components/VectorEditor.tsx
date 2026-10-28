interface Props {
  vector: number[]
  onChange?: (v: number[]) => void
  colLabels?: string[]
  readOnly?: boolean
}

export default function VectorEditor({ vector, onChange, colLabels, readOnly = false }: Props) {
  function handleChange(i: number, raw: string) {
    if (!onChange) return
    const val = parseInt(raw, 10)
    const n = isNaN(val) ? 0 : Math.max(0, val)
    onChange(vector.map((v, idx) => (idx === i ? n : v)))
  }

  return (
    <div className="flex flex-wrap gap-2.5 items-end rounded-lg border border-neutral-200/80 bg-neutral-50/50 p-3">
      {vector.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          {colLabels && (
            <span className="text-xs text-neutral-500 font-mono font-semibold uppercase tracking-wider">
              {colLabels[i] ?? `R${i}`}
            </span>
          )}
          <input
            type="number"
            min={0}
            value={v}
            readOnly={readOnly || !onChange}
            onChange={(e) => handleChange(i, e.target.value)}
            className={[
              'mono-input shadow-2xs',
              readOnly || !onChange
                ? 'text-neutral-500 bg-neutral-100/70 border-neutral-200 cursor-default'
                : 'text-neutral-900 hover:border-neutral-400 focus:border-neutral-900',
            ].join(' ')}
          />
        </div>
      ))}
    </div>
  )
}
