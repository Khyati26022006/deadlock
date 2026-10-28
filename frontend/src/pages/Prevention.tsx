import { useEffect, useState } from 'react'
import { postPreventionAnalyze } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import SectionCard from '../components/SectionCard'
import type { ConditionResult, Matrix, PreventionResponse } from '../types'

function zeroMatrix(r: number, c: number): Matrix {
  return Array.from({ length: r }, () => Array(c).fill(0))
}
function resizeMatrix(m: Matrix, r: number, c: number): Matrix {
  return Array.from({ length: r }, (_, ri) => Array.from({ length: c }, (_, ci) => m[ri]?.[ci] ?? 0))
}

function ConditionCard({ result }: { result: ConditionResult }) {
  const present = result.present
  return (
    <div
      className={`card p-5 space-y-3.5 transition-all ${
        present ? 'border-neutral-900/40 bg-neutral-50/30' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${present ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
          <h3 className="font-bold text-neutral-900 text-sm sm:text-base">{result.condition_name}</h3>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
            present
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-neutral-100 text-neutral-500 border-neutral-200'
          }`}
        >
          {present ? 'Present' : 'Broken / Absent'}
        </span>
      </div>

      {(result.affected_processes.length > 0 || result.affected_resources.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {result.affected_processes.map((pid) => (
            <span
              key={pid}
              className="text-xs bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded border border-neutral-200 font-mono font-medium"
            >
              {pid}
            </span>
          ))}
          {result.affected_resources.map((rid) => (
            <span
              key={rid}
              className="text-xs bg-neutral-50 text-neutral-600 px-2 py-0.5 rounded border border-neutral-200 font-mono"
            >
              {rid}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <p className="section-label">Analysis Findings</p>
        <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">{result.explanation}</p>
      </div>

      <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200/80 space-y-1">
        <p className="section-label text-[10px]">OS Prevention Strategy</p>
        <p className="text-xs text-neutral-700 leading-relaxed font-medium">{result.prevention_strategy}</p>
      </div>
    </div>
  )
}

export default function Prevention() {
  const { scenario } = useScenario()
  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds  = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))
  useEffect(() => { setRequest((prev) => resizeMatrix(prev, np, nr)) }, [np, nr])

  const [result, setResult]   = useState<PreventionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  useEffect(() => { setResult(null); setError(null) }, [scenario])

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(
        await postPreventionAnalyze({
          processes: scenario.processes,
          resources: scenario.resources,
          allocation: scenario.allocation,
          need: scenario.need,
          available: scenario.available,
          request_matrix: request,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const conditions: ConditionResult[] = result
    ? [result.mutual_exclusion, result.hold_and_wait, result.no_preemption, result.circular_wait]
    : []

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-neutral-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Deadlock Prevention (Coffman Conditions)
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Scenario: <span className="font-semibold text-neutral-900">{scenario.name}</span>
            {' · '}{np} processes · {nr} resource types
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Evaluating…' : 'Analyze All 4 Conditions'}
        </button>
      </div>

      {/* Info card */}
      <div className="card p-4 bg-neutral-50/70 border-neutral-200/80 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 mt-2 shrink-0" />
        <div className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
          <span className="font-semibold text-neutral-900">Coffman’s Principle: </span>
          Deadlock is structurally impossible unless all four conditions hold simultaneously. By designing protocols that eliminate even a single condition (such as enforcing total ordering to prevent circular wait), deadlocks are prevented by system design.
        </div>
      </div>

      {/* Request Matrix */}
      <SectionCard
        title="Pending Request Matrix (for Circular Wait Analysis)"
        subtitle="Used to construct the wait-for graph cycle check"
        action={
          <button
            onClick={() => setRequest(zeroMatrix(np, nr))}
            className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 transition-colors"
          >
            Reset to zero
          </button>
        }
      >
        <MatrixEditor matrix={request} onChange={setRequest} rowLabels={processIds} colLabels={resourceIds} />
      </SectionCard>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Summary */}
      {result && (
        <div className="card p-5 sm:p-6 border-neutral-900/30">
          <div className="flex items-center gap-3">
            <span className="text-xl font-mono font-bold text-neutral-900">
              {result.conditions_present} / 4
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-neutral-600">
              Conditions Present
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-600 mt-2 leading-relaxed">
            {result.summary}
          </p>
        </div>
      )}

      {/* Conditions Grid */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {conditions.map((c) => (
            <ConditionCard key={c.condition_name} result={c} />
          ))}
        </div>
      )}
    </div>
  )
}
