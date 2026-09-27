/**
 * Deadlock Prevention page (/prevention)
 *
 * Analyzes which of the four Coffman conditions are present in the
 * active scenario.  The user can optionally edit the Request matrix
 * (same concept as Detection page — what each process is currently
 * waiting for) to influence the circular-wait check.
 *
 * Displays:
 *   - Overall summary banner
 *   - Four condition cards (Mutual Exclusion, Hold & Wait,
 *     No Preemption, Circular Wait)
 *   - Each card: present/absent badge, explanation, prevention strategy
 */

import { useEffect, useState } from 'react'
import { postPreventionAnalyze } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import SectionCard from '../components/SectionCard'
import type { ConditionResult, Matrix, PreventionResponse } from '../types'

function zeroMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(0))
}

function resizeMatrix(m: Matrix, newRows: number, newCols: number): Matrix {
  return Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => m[r]?.[c] ?? 0),
  )
}

// ─── Condition card ───────────────────────────────────────────────────────────

interface ConditionCardProps {
  result: ConditionResult
  resourceIds: string[]
  icon: string
}

function ConditionCard({ result, resourceIds, icon }: ConditionCardProps) {
  const present = result.present

  return (
    <div
      className={[
        'rounded-xl border p-5 space-y-3 transition-colors',
        present
          ? 'border-red-600 bg-red-950/40'
          : 'border-green-700 bg-green-950/30',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="font-semibold text-white text-sm">{result.condition_name}</h3>
        </div>
        <span
          className={[
            'text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide',
            present
              ? 'bg-red-700 text-red-100'
              : 'bg-green-800 text-green-100',
          ].join(' ')}
        >
          {present ? 'Present ⚠' : 'Absent ✓'}
        </span>
      </div>

      {/* Affected items (if any) */}
      {(result.affected_processes.length > 0 || result.affected_resources.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {result.affected_processes.map((pid) => (
            <span key={pid} className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded-full">
              {pid}
            </span>
          ))}
          {result.affected_resources.map((rid) => (
            <span key={rid} className="text-xs bg-gray-600 text-gray-300 px-2 py-0.5 rounded-full">
              {rid}
            </span>
          ))}
        </div>
      )}

      {/* Explanation */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">What was found</p>
        <p className="text-sm text-gray-200 leading-relaxed">{result.explanation}</p>
      </div>

      {/* Prevention strategy */}
      <div className={[
        'rounded-lg p-3',
        present ? 'bg-gray-800/60' : 'bg-gray-800/30',
      ].join(' ')}>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
          Prevention strategy
        </p>
        <p className={[
          'text-sm leading-relaxed',
          present ? 'text-yellow-200' : 'text-gray-400',
        ].join(' ')}>
          {result.prevention_strategy}
        </p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CONDITION_META: Record<string, { icon: string }> = {
  'Mutual Exclusion': { icon: '🔐' },
  'Hold and Wait':    { icon: '✋' },
  'No Preemption':    { icon: '🚫' },
  'Circular Wait':    { icon: '🔄' },
}

function iconFor(name: string): string {
  return CONDITION_META[name]?.icon ?? '❓'
}

export default function Prevention() {
  const { scenario } = useScenario()

  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  // Request matrix — same concept as Detection page.
  // Defaults to all-zero; user can edit to influence circular-wait analysis.
  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))

  useEffect(() => {
    setRequest((prev) => resizeMatrix(prev, np, nr))
  }, [np, nr])

  // Clear results when scenario changes
  const [result, setResult] = useState<PreventionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
  }, [scenario])

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await postPreventionAnalyze({
        processes: scenario.processes,
        resources: scenario.resources,
        allocation: scenario.allocation,
        need: scenario.need,
        available: scenario.available,
        request_matrix: request,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Ordered condition list ─────────────────────────────────────────────────
  const conditions: ConditionResult[] = result
    ? [
        result.mutual_exclusion,
        result.hold_and_wait,
        result.no_preemption,
        result.circular_wait,
      ]
    : []

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Deadlock Prevention</h1>
        <p className="text-gray-400 text-sm mt-1">
          Scenario: <span className="text-white font-medium">{scenario.name}</span>
          {' · '}
          {np} processes · {nr} resource types
        </p>
      </div>

      {/* Concept explainer */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-400 space-y-1">
        <p>
          <span className="text-white font-medium">Prevention</span> checks whether the four
          Coffman conditions — all of which must hold <em>simultaneously</em> for deadlock to be
          possible — are present in this scenario's structure.
        </p>
        <p className="text-xs text-gray-500">
          Eliminating any single condition is sufficient to prevent deadlock entirely.
        </p>
      </div>

      {/* Request matrix (for circular-wait analysis) */}
      <SectionCard title="Request Matrix  (for circular-wait detection)">
        <p className="text-xs text-gray-500 -mt-1 mb-3">
          Enter what each process is <em>currently waiting for</em>. This is used to build the
          wait-for graph for the Circular Wait check. Leave all zeros if no process is blocked.
        </p>
        <MatrixEditor
          matrix={request}
          onChange={setRequest}
          rowLabels={processIds}
          colLabels={resourceIds}
        />
        <button
          onClick={() => setRequest(zeroMatrix(np, nr))}
          className="text-xs text-gray-500 hover:text-gray-300 mt-1 transition-colors"
        >
          Reset to all zeros
        </button>
      </SectionCard>

      {/* Analyze button */}
      <button
        onClick={runAnalysis}
        disabled={loading}
        className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
      >
        {loading ? 'Analyzing…' : '🔎 Analyze Conditions'}
      </button>

      {/* Error */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Summary banner */}
      {result && (
        <div
          className={[
            'rounded-2xl border-2 p-5',
            result.conditions_present === 4
              ? 'border-red-500 bg-red-950'
              : result.conditions_present === 0
              ? 'border-green-500 bg-green-950'
              : 'border-yellow-500 bg-yellow-950/40',
          ].join(' ')}
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">
              {result.conditions_present === 4 ? '🔴' : result.conditions_present === 0 ? '✅' : '⚠️'}
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">
                {result.conditions_present} / 4 conditions present
              </h2>
              <p className="text-sm text-gray-300 mt-1 leading-relaxed">{result.summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Four condition cards */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {conditions.map((c) => (
            <ConditionCard
              key={c.condition_name}
              result={c}
              resourceIds={resourceIds}
              icon={iconFor(c.condition_name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
