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

function resizeMatrix(m: Matrix, r: number, c: number): Matrix {
  return Array.from({ length: r }, (_, ri) => Array.from({ length: c }, (_, ci) => m[ri]?.[ci] ?? 0))
}
function resizeVector(v: Vector, n: number): Vector {
  return Array.from({ length: n }, (_, i) => v[i] ?? 0)
}
function defaultProcess(i: number): ProcessDef { return { id: `P${i}`, name: `Process ${i}` } }
function defaultResource(i: number): ResourceDef { return { id: `R${i}`, name: `Resource ${i}`, total_instances: 1 } }

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

export default function ScenarioBuilder() {
  const { scenario: activeScenario, setScenario } = useScenario()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(() => scenarioToForm(activeScenario))
  const [need, setNeed] = useState<Matrix | null>(null)
  const [needLoading, setNeedLoading] = useState(false)
  const [needError, setNeedError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const np = form.processes.length
  const nr = form.resources.length
  const processIds = form.processes.map((p) => p.id)
  const resourceIds = form.resources.map((r) => r.id)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNeed = useCallback((allocation: Matrix, maximum: Matrix) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setNeedLoading(true)
      setNeedError(null)
      try {
        const computed: Matrix = maximum.map((row, i) =>
          row.map((m, j) => m - (allocation[i]?.[j] ?? 0)),
        )
        const invalid: string[] = []
        computed.forEach((row, i) =>
          row.forEach((v, j) => {
            if (v < 0) {
              invalid.push(`Allocation[${processIds[i]}][${resourceIds[j]}] exceeds Maximum`)
            }
          }),
        )
        if (invalid.length > 0) {
          setNeedError(invalid.join('; '))
          setNeed(null)
        } else {
          await postBankerSafety({ allocation, need: computed, available: form.available })
          setNeed(computed)
        }
      } catch (err) {
        setNeedError(err instanceof Error ? err.message : String(err))
        setNeed(null)
      } finally {
        setNeedLoading(false)
      }
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.available, processIds.join(','), resourceIds.join(',')])

  useEffect(() => {
    fetchNeed(form.allocation, form.maximum)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.allocation, form.maximum, fetchNeed])

  function addProcess() {
    setForm((f) => ({
      ...f,
      processes: [...f.processes, defaultProcess(np)],
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

  function addResource() {
    setForm((f) => ({
      ...f,
      resources: [...f.resources, defaultResource(nr)],
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

  function loadPreset(id: string) {
    const e = PRESETS.find((p) => p.id === id)
    if (!e) return
    setForm(scenarioToForm(e.scenario))
    setNeed(e.scenario.need)
    setNeedError(null)
    setSaved(false)
  }

  function loadSample() {
    setForm(scenarioToForm(SAMPLE_SCENARIO))
    setNeed(SAMPLE_SCENARIO.need)
    setNeedError(null)
    setSaved(false)
  }

  function clearForm() {
    setForm(blankForm())
    setNeed(null)
    setNeedError(null)
    setSaved(false)
  }

  function save() {
    if (!need) {
      setSaveError('Need matrix is not valid. Please fix allocation or maximum values first.')
      return
    }
    setSaveError(null)
    setScenario({
      id: activeScenario.id === 'sample' ? 'custom' : activeScenario.id,
      name: form.name || 'Custom Scenario',
      description: form.description,
      processes: form.processes,
      resources: form.resources,
      allocation: form.allocation,
      maximum: form.maximum,
      need,
      available: form.available,
    })
    setSaved(true)
  }

  function saveAndGo() {
    save()
    if (!need) return
    navigate('/')
  }

  const inputClass =
    'w-full bg-white border border-neutral-300 rounded-md px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition-colors shadow-2xs'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-neutral-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Scenario Configuration
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Define processes, resources, claims, and limits. The Need matrix is computed automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium">Preset:</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  loadPreset(e.target.value)
                  e.target.value = ''
                }
              }}
              className="text-xs bg-white border border-neutral-300 px-3 py-1.5 rounded-md text-neutral-800 focus:outline-none focus:border-neutral-900 cursor-pointer shadow-2xs"
            >
              <option value="" disabled>Select scenario preset...</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <button onClick={loadSample} className="btn-secondary text-xs">
            Classic Benchmark
          </button>
          <button onClick={clearForm} className="btn-ghost text-xs">
            Reset
          </button>
        </div>
      </div>

      {/* Basic Scenario Info */}
      <SectionCard title="General Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="section-label block mb-1.5">Scenario Label</label>
            <input
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                setSaved(false)
              }}
              placeholder="e.g., Safe State Benchmark"
              className={inputClass}
            />
          </div>
          <div>
            <label className="section-label block mb-1.5">Description &amp; Notes</label>
            <input
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value }))
                setSaved(false)
              }}
              placeholder="Optional notes regarding processes or conditions"
              className={inputClass}
            />
          </div>
        </div>
      </SectionCard>

      {/* Processes & Resources in two columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Processes Section */}
        <SectionCard
          title="Processes Definition"
          subtitle={`${np} total processes`}
          action={
            <button onClick={addProcess} className="btn-secondary text-xs py-1 px-2.5">
              + Add Process
            </button>
          }
        >
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {form.processes.map((p, i) => (
              <div key={i} className="flex items-center gap-2 bg-neutral-50/70 p-2 rounded-md border border-neutral-200/60">
                <span className="text-xs font-mono text-neutral-400 w-6 text-center">#{i}</span>
                <input
                  value={p.id}
                  onChange={(e) => updateProcessField(i, 'id', e.target.value)}
                  className="w-16 bg-white border border-neutral-300 rounded px-2 py-1 text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:border-neutral-900"
                  placeholder="ID"
                />
                <input
                  value={p.name}
                  onChange={(e) => updateProcessField(i, 'name', e.target.value)}
                  className="flex-1 bg-white border border-neutral-300 rounded px-2.5 py-1 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                  placeholder="Process descriptive name"
                />
                <button
                  onClick={() => removeProcess(i)}
                  disabled={np <= 1}
                  className="text-neutral-400 hover:text-red-600 disabled:opacity-20 px-1 text-base leading-none transition-colors"
                  aria-label="Remove process"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Resources Section */}
        <SectionCard
          title="Resources Definition"
          subtitle={`${nr} total resource types`}
          action={
            <button onClick={addResource} className="btn-secondary text-xs py-1 px-2.5">
              + Add Resource
            </button>
          }
        >
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {form.resources.map((r, i) => (
              <div key={i} className="flex items-center gap-2 bg-neutral-50/70 p-2 rounded-md border border-neutral-200/60">
                <span className="text-xs font-mono text-neutral-400 w-6 text-center">#{i}</span>
                <input
                  value={r.id}
                  onChange={(e) => updateResourceField(i, 'id', e.target.value)}
                  className="w-16 bg-white border border-neutral-300 rounded px-2 py-1 text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:border-neutral-900"
                  placeholder="ID"
                />
                <input
                  value={r.name}
                  onChange={(e) => updateResourceField(i, 'name', e.target.value)}
                  className="flex-1 bg-white border border-neutral-300 rounded px-2.5 py-1 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                  placeholder="Resource name"
                />
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-neutral-400 font-mono">Total</span>
                  <input
                    type="number"
                    min={1}
                    value={r.total_instances}
                    onChange={(e) =>
                      updateResourceField(
                        i,
                        'total_instances',
                        Math.max(1, parseInt(e.target.value, 10) || 1),
                      )
                    }
                    className="w-12 bg-white border border-neutral-300 rounded px-1.5 py-1 text-xs text-center font-mono text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                </div>
                <button
                  onClick={() => removeResource(i)}
                  disabled={nr <= 1}
                  className="text-neutral-400 hover:text-red-600 disabled:opacity-20 px-1 text-base leading-none transition-colors"
                  aria-label="Remove resource"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Matrices Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Allocation Matrix"
          subtitle="Instances currently allocated to each process"
        >
          <MatrixEditor
            matrix={form.allocation}
            onChange={(m) => {
              setForm((f) => ({ ...f, allocation: m }))
              setSaved(false)
            }}
            rowLabels={processIds}
            colLabels={resourceIds}
          />
        </SectionCard>

        <SectionCard
          title="Maximum Demand Matrix"
          subtitle="Upper bound of instances each process can claim"
        >
          <MatrixEditor
            matrix={form.maximum}
            onChange={(m) => {
              setForm((f) => ({ ...f, maximum: m }))
              setSaved(false)
            }}
            rowLabels={processIds}
            colLabels={resourceIds}
          />
        </SectionCard>
      </div>

      {/* Available & Computed Need */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Available Vector"
          subtitle="Current unallocated instances available to the system"
        >
          <VectorEditor
            vector={form.available}
            onChange={(v) => {
              setForm((f) => ({ ...f, available: v }))
              setSaved(false)
            }}
            colLabels={resourceIds}
          />
        </SectionCard>

        <SectionCard
          title="Need Matrix"
          subtitle="Automatically computed: Need[i][j] = Maximum[i][j] - Allocation[i][j]"
        >
          {needError && <ErrorBanner message={needError} />}
          {need && !needError ? (
            <MatrixEditor
              matrix={need}
              rowLabels={processIds}
              colLabels={resourceIds}
              readOnly
            />
          ) : !needError ? (
            <p className="text-neutral-400 text-xs italic py-4 text-center">
              {needLoading ? 'Computing matrix...' : 'Enter valid Allocation and Maximum values to view Need.'}
            </p>
          ) : null}
        </SectionCard>
      </div>

      {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />}

      {saved && (
        <div className="bg-neutral-900 text-white rounded-md p-4 text-xs sm:text-sm font-medium flex items-center justify-between shadow-xs animate-fade-in">
          <span>✓ Scenario saved successfully. All analyses are now updated with this configuration.</span>
          <button onClick={() => navigate('/')} className="underline font-semibold ml-4">
            Go to Dashboard &rarr;
          </button>
        </div>
      )}

      {/* Save Action Footer */}
      <div className="flex items-center gap-3 pt-2 pb-8">
        <button
          onClick={save}
          disabled={!!needError || needLoading}
          className="btn-primary"
        >
          Save Scenario
        </button>
        <button
          onClick={saveAndGo}
          disabled={!!needError || needLoading}
          className="btn-secondary"
        >
          Save &amp; View Dashboard &rarr;
        </button>
      </div>
    </div>
  )
}
