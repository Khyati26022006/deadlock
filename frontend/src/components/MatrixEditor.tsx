/**
 * MatrixEditor – editable or read-only 2-D integer grid.
 *
 * Props:
 *   matrix      – current values
 *   onChange    – called with updated matrix (omit to make read-only)
 *   rowLabels   – labels for each row  (e.g. ["P0","P1"])
 *   colLabels   – labels for each col  (e.g. ["A","B","C"])
 *   readOnly    – disable all inputs
 *   highlight   – optional per-cell CSS class override fn(row, col) → string
 */

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
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          {colLabels && (
            <tr>
              {/* empty corner cell */}
              <th className="w-10" />
              {colLabels.map((lbl, c) => (
                <th
                  key={c}
                  className="px-3 pb-1 text-xs text-gray-500 font-medium text-center"
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
                <td className="pr-2 text-xs text-gray-500 text-right font-medium whitespace-nowrap">
                  {rowLabels[r] ?? `P${r}`}
                </td>
              )}
              {Array.from({ length: nCols }, (_, c) => {
                const extra = highlight ? highlight(r, c) : ''
                return (
                  <td key={c} className="p-0.5">
                    <input
                      type="number"
                      min={0}
                      value={row[c] ?? 0}
                      readOnly={readOnly || !onChange}
                      onChange={(e) => handleChange(r, c, e.target.value)}
                      className={[
                        'w-14 text-center rounded-md border py-1 text-sm font-mono',
                        'focus:outline-none focus:ring-1 focus:ring-blue-500',
                        readOnly || !onChange
                          ? 'bg-gray-900 border-gray-700 text-gray-400 cursor-default'
                          : 'bg-gray-800 border-gray-600 text-white',
                        extra,
                      ]
                        .filter(Boolean)
                        .join(' ')}
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
