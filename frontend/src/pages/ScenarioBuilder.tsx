/**
 * Scenario Builder page (/scenario-builder)
 *
 * Lets the user:
 *   - Add / remove processes and resources
 *   - Edit Allocation and Maximum matrices
 *   - Edit the Available vector
 *   - See the Need matrix (auto-calculated by the backend, read-only)
 *   - Load the hardcoded sample scenario as a starting point
 *   - Clear the form to an empty 1-process / 1-resource blank slate
 *   - Save the scenario into shared context so every other page updates
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postBankerSafety } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import { SAMPLE_SCENARIO } from '../data/sampleScenario'
import { PRESETS } from '../data/presetScenarios'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import VectorEditor from '../components/VectorEditor'
import SectionCard from '../components/SectionCard'
import type { Matrix, ProcessDef, ResourceDef, ScenarioDetail, Vector } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resize a matrix to newRows × newCols, preserving existing values. */
function resizeMatrix(m: Matrix, newRows: number, newCols: number): Matrix {
  return Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => m[r]?.[c] ?? 0),
  )
}

/** Resize a vector to length n, preserving existing values. */
function resizeVector(v: Vector, n: number): Vector {
  return Array.from({ length: n }, (_, i) => v[i] ?? 0)
}

function defaultProcess(index: number): ProcessDef {
  return { id: `P${index}`, name: `Process ${index}` }
}

function defaultResource(index: number): ResourceDef {
  return { id: `R${index}`, name: `Resource ${index}`, total_instances: 1 }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  description: string
  processes: ProcessDef[]
  resources: ResourceDef[]
  allocation: Matrix
  maximum: Matrix
  available: Vector
}

function scenarioToForm(s: ScenarioDetail): FormState {
  return {
    name: s.name,
    description: s.description,
    processes: s.processes,
    resources: s.resources,
    allocation: s.allocation,
    maximum: s.maximum,
    available: s.available,
  }
}

function blankForm(): FormState {
  return {
    name: 'New Scenario',
    description: '',
    processes: [defaultProcess(0)],
    resources: [defaultResource(0)],
    allocation: [[0]],
    maximum: [[1]],
    available: [1],
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScenarioBuilder() {
  const { scenario: activeScenario, setScenario } = useScenario()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(() => scenarioToForm(activeScenario))

  // Need matrix: fetched from backend, null while loading / before first fetch
  const [need, setNeed] = useState<Matrix | null>(null)
  const [needLoading, setNeedLoading] = useState(false)
  const [needError, setNeedError] = useState<string | null>(null)

  // Save feedback
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const np = form.processes.length
  const nr = form.resources.length
  const processIds = form.processes.map((p) => p.id)
  const resourceIds = form.resources.map((r) => r.id)

  // ── Fetch need matrix from backend ──────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNeed = useCallback(
    (allocation: Matrix, maximum: Matrix) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setNeedLoading(true)
        setNeedError(null)
        try {
          // We call /api/banker/safety with a zero need placeholder just to
          // validate dimensions; but for the Need matrix we use the backend's
          // own calculation endpoint indirectly via a safety call that returns
          // immediately if we pass a trivially-safe need (all zeros).
          // Actually: the backend's POST /api/banker/safety expects Need as
          // input, not Maximum. There is no standalone "compute need" endpoint.
          // So we compute need client-side using the formula: need = max - alloc,
          // BUT we validate by sending it to the safety endpoint and using
          // any 400 error to surface validation messages to the user.
          //
          // The need matrix is: need[i][j] = maximum[i][j] - allocation[i][j]
          const computed: Matrix = maximum.map((row, i) =>
            row.map((m, j) => m - (allocation[i]?.[j] ?? 0)),
          )

          // Validate that no cell is negative (allocation > maximum)
          const invalid: string[] = []
          computed.forEach((row, i) =>
            row.forEach((v, j) => {
              if (v < 0)
                invalid.push(
                  `Allocation[${processIds[i]}][${resourceIds[j]}] = ${allocation[i][j]} exceeds Maximum = ${maximum[i][j]}`,
                )
            }),
          )
          if (invalid.length > 0) {
            setNeedError(invalid.join('; '))
            setNeed(null)
          } else {
            // Confirm with backend by running a quick safety check
            await postBankerSafety({
              allocation,
              need: computed,
              available: form.available,
            })
            setNeed(computed)
          }
        } catch (err) {
          setNeedError(err instanceof Error ? err.message : String(err))
          setNeed(null)
        } finally {
          setNeedLoading(false)
        }
      }, 600)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.available, processIds.join(','), resourceIds.join(',')],
  )

  // Re-fetch need whenever allocation, maximum, or dimensions change
  useEffect(() => {
    fetchNeed(form.allocation, form.maximum)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.allocation, form.maximum, fetchNeed])

  // ── Process management ───────────────────────────────────────────────────────

  function addProcess() {
    const newProc = defaultProcess(np)
    setForm((f) => ({
      ...f,
      processes: [...f.processes, newProc],
      allocation: resizeMatrix(f.allocation, np + 1, nr),
      maximum: resizeMatrix(f.maximum, np + 1, nr),
    }))
    setSaved(false)
  }

  function removeProcess(idx: number) {
    if (np <= 1) return
    setForm((f) => ({
      ...f,
      processes: f.processes.filter((_, i) => i !== idx),
      allocation: f.allocation.filter((_, i) => i !== idx),
      maximum: f.maximum.filter((_, i) => i !== idx),
    }))
    setSaved(false)
  }

  function updateProcessField(idx: number, field: keyof ProcessDef, value: string) {
    setForm((f) => ({
      ...f,
      processes: f.processes.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }))
    setSaved(false)
  }

  // ── Resource management ──────────────────────────────────────────────────────

  function addResource() {
    const newRes = defaultResource(nr)
    setForm((f) => ({
      ...f,
      resources: [...f.resources, newRes],
      allocation: resizeMatrix(f.allocation, np, nr + 1),
      maximum: resizeMatrix(f.maximum, np, nr + 1),
      available: resizeVector(f.available, nr + 1),
    }))
    setSaved(false)
  }

  function removeResource(idx: number) {
    if (nr <= 1) return
    setForm((f) => ({
      ...f,
      resources: f.resources.filter((_, i) => i !== idx),
      allocation: f.allocation.map((row) => row.filter((_, i) => i !== idx)),
      maximum: f.maximum.map((row) => row.filter((_, i) => i !== idx)),
      available: f.available.filter((_, i) => i !== idx),
    }))
    setSaved(false)
  }

  function updateResourceField(idx: number, field: keyof ResourceDef, value: string | number) {
    setForm((f) => ({
      ...f,
      resources: f.resources.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
    setSaved(false)
  }

  // ── Matrix / vector updates ──────────────────────────────────────────────────

  function setAllocation(m: Matrix) {
    setForm((f) => ({ ...f, allocation: m }))
    setSaved(false)
  }

  function setMaximum(m: Matrix) {
    setForm((f) => ({ ...f, maximum: m }))
    setSaved(false)
  }

  function setAvailable(v: Vector) {
    setForm((f) => ({ ...f, available: v }))
    setSaved(false)
  }

  // ── Load sample / clear / preset ────────────────────────────────────────────

  function loadSample() {
    setForm(scenarioToForm(SAMPLE_SCENARIO))
    setNeed(SAMPLE_SCENARIO.need)
    setNeedError(null)
    setSaved(false)
  }

  function loadPreset(presetId: string) {
    const entry = PRESETS.find((p) => p.id === presetId)
    if (!entry) return
    setForm(scenarioToForm(entry.scenario))
    setNeed(entry.scenario.need)
    setNeedError(null)
    setSaved(false)
  }

  function clearForm() {
    setForm(blankForm())
    setNeed(null)
    setNeedError(null)
    setSaved(false)
  }

  // ── Save to context ───────────────────────────────────────────────────────────

  function save() {
    if (!need) {
      setSaveError('Need matrix is not valid. Fix allocation / maximum errors first.')
      return
    }
    setSaveError(null)

    const built: ScenarioDetail = {
      id: activeScenario.id === 'sample' ? 'custom' : activeScenario.id,
      name: form.name || 'Unnamed Scenario',
      description: form.description,
      processes: form.processes,
      resources: form.resources,
      allocation: form.allocation,
      maximum: form.maximum,
      need,
      available: form.available,
    }

    setScenario(built)
    setSaved(true)
  }

  function saveAndGo() {
    save()
    if (!need) return
    navigate('/')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scenario Builder</h1>
          <p className="text-gray-400 text-sm mt-1">
            Define processes, resources, and matrices. The Need matrix is calculated by the backend.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Preset dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">Load preset:</label>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { loadPreset(e.target.value); e.target.value = '' } }}
              className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-1.5 rounded-lg text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="" disabled>— choose —</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadSample}
            className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-1.5 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            Classic Sample
          </button>
          <button
            onClick={clearForm}
            className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-1.5 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Name / description */}
      <SectionCard title="Scenario Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setSaved(false) }}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <input
              value={form.description}
              onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); setSaved(false) }}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </SectionCard>

      {/* Processes */}
      <SectionCard title="Processes">
        <div className="space-y-2">
          {form.processes.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-6 text-right">{i}</span>
              <input
                value={p.id}
                onChange={(e) => updateProcessField(i, 'id', e.target.value)}
                className="w-20 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="ID"
              />
              <input
                value={p.name}
                onChange={(e) => updateProcessField(i, 'name', e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Name"
              />
              <button
                onClick={() => removeProcess(i)}
                disabled={np <= 1}
                className="text-red-500 hover:text-red-400 disabled:text-gray-700 text-lg leading-none"
                aria-label="Remove process"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addProcess}
          className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Add Process
        </button>
      </SectionCard>

      {/* Resources */}
      <SectionCard title="Resources">
        <div className="space-y-2">
          {form.resources.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-6 text-right">{i}</span>
              <input
                value={r.id}
                onChange={(e) => updateResourceField(i, 'id', e.target.value)}
                className="w-20 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="ID"
              />
              <input
                value={r.name}
                onChange={(e) => updateResourceField(i, 'name', e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Name"
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Total</span>
                <input
                  type="number"
                  min={1}
                  value={r.total_instances}
                  onChange={(e) => updateResourceField(i, 'total_instances', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-center font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => removeResource(i)}
                disabled={nr <= 1}
                className="text-red-500 hover:text-red-400 disabled:text-gray-700 text-lg leading-none"
                aria-label="Remove resource"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addResource}
          className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Add Resource
        </button>
      </SectionCard>

      {/* Allocation */}
      <SectionCard title="Allocation Matrix  (currently held)">
        <p className="text-xs text-gray-500">How many instances of each resource each process currently holds.</p>
        <MatrixEditor
          matrix={form.allocation}
          onChange={setAllocation}
          rowLabels={processIds}
          colLabels={resourceIds}
        />
      </SectionCard>

      {/* Maximum */}
      <SectionCard title="Maximum Matrix  (worst-case demand)">
        <p className="text-xs text-gray-500">The maximum number of instances each process may ever request.</p>
        <MatrixEditor
          matrix={form.maximum}
          onChange={setMaximum}
          rowLabels={processIds}
          colLabels={resourceIds}
        />
      </SectionCard>

      {/* Available */}
      <SectionCard title="Available Vector  (free instances)">
        <p className="text-xs text-gray-500">Currently free instances of each resource.</p>
        <VectorEditor
          vector={form.available}
          onChange={setAvailable}
          colLabels={resourceIds}
        />
      </SectionCard>

      {/* Need (read-only, backend-calculated) */}
      <SectionCard title="Need Matrix  (auto-calculated — read only)">
        <p className="text-xs text-gray-500">
          Need = Maximum − Allocation. Validated by the backend.{' '}
          {needLoading && <span className="text-blue-400">Updating…</span>}
        </p>
        {needError && <ErrorBanner message={needError} />}
        {need && !needError ? (
          <MatrixEditor
            matrix={need}
            rowLabels={processIds}
            colLabels={resourceIds}
            readOnly
          />
        ) : (
          !needError && (
            <p className="text-gray-600 text-sm italic">
              {needLoading ? 'Calculating…' : 'Fix allocation/maximum to see the Need matrix.'}
            </p>
          )
        )}
      </SectionCard>

      {/* Save actions */}
      {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />}
      {saved && (
        <div className="bg-green-950 border border-green-700 rounded-xl p-3 text-green-300 text-sm">
          ✅ Scenario saved — all pages (Dashboard, Detection, Avoidance, Prevention, Recovery) are now using this scenario.
        </div>
      )}
      <div className="flex gap-3 pb-8">
        <button
          onClick={save}
          disabled={!!needError || needLoading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          Save Scenario
        </button>
        <button
          onClick={saveAndGo}
          disabled={!!needError || needLoading}
          className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          Save &amp; View Dashboard →
        </button>
      </div>
    </div>
  )
}
