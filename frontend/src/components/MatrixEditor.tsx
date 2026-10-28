interface Props {
  matrix: number[][]
  onChange?: (updated: number[][]) => void
  rowLabels?: string[]
  colLabels?: string[]
  readOnly?: boolean
  highlight?: (row: number, col: number) => string
}

export default function MatrixEditor({
  matrix,
  onChange,
  rowLabels,
  colLabels,
  readOnly = false,
  highlight,
}: Props) {
  if (matrix.length === 0) return null

  function handleChange(r: number, c: number, raw: string) {
    if (!onChange) return
    const val = parseInt(raw, 10)
    const n = isNaN(val) ? 0 : Math.max(0, val)
    const next = matrix.map((row, ri) =>
      ri === r ? row.map((v, ci) => (ci === c ? n : v)) : [...row],
    )
    onChange(next)
  }

  const nCols = matrix[0]?.length ?? 0

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200/80 bg-neutral-50/50 p-3">
      <table className="border-collapse text-sm mx-auto">
        <thead>
          {colLabels && (
            <tr>
              <th className="w-14" />
              {colLabels.map((lbl, c) => (
                <th
                  key={c}
                  className="px-2.5 pb-2.5 text-xs text-neutral-500 font-mono font-semibold text-center tracking-wider uppercase"
                >
                  {lbl}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              {rowLabels && (
                <td className="pr-3 text-xs text-neutral-500 text-right font-mono font-semibold whitespace-nowrap py-1">
                  {rowLabels[r] ?? `P${r}`}
                </td>
              )}
              {Array.from({ length: nCols }, (_, c) => {
                const extra = highlight ? highlight(r, c) : ''
                return (
                  <td key={c} className="p-1">
                    <input
                      type="number"
                      min={0}
                      value={row[c] ?? 0}
                      readOnly={readOnly || !onChange}
                      onChange={(e) => handleChange(r, c, e.target.value)}
                      className={[
                        'mono-input shadow-2xs',
                        readOnly || !onChange
                          ? 'text-neutral-500 bg-neutral-100/70 border-neutral-200 cursor-default'
                          : 'text-neutral-900 hover:border-neutral-400 focus:border-neutral-900',
                        extra,
                      ].filter(Boolean).join(' ')}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
