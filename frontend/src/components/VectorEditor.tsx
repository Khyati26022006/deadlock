/** Single-row vector editor (Available / Request for one process). */

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
    <div className="flex flex-wrap gap-2 items-end">
      {vector.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          {colLabels && (
            <span className="text-xs text-gray-500">{colLabels[i] ?? `R${i}`}</span>
          )}
          <input
            type="number"
            min={0}
            value={v}
            readOnly={readOnly || !onChange}
            onChange={(e) => handleChange(i, e.target.value)}
            className={[
              'w-14 text-center rounded-md border py-1 text-sm font-mono',
              'focus:outline-none focus:ring-1 focus:ring-blue-500',
              readOnly || !onChange
                ? 'bg-gray-900 border-gray-700 text-gray-400 cursor-default'
                : 'bg-gray-800 border-gray-600 text-white',
            ].join(' ')}
          />
        </div>
      ))}
    </div>
  )
}
