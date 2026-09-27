/**
 * Deadlock Recovery page (/recovery)
 *
 * Recovery is only valid after a confirmed deadlock. This page therefore
 * runs the detection algorithm inline first (Step 1), using an editable
 * Request matrix identical to the Detection page pattern. The real API
 * result drives everything downstream:
 *
 *   - If the result is NO_DEADLOCK: the recovery sections are hidden and
 *     the user is told there is nothing to recover from.
 *   - If the result is DEADLOCKED: the deadlocked process IDs are
 *     auto-populated from `detection.deadlocked_processes` (mapped to
 *     string IDs via the scenario process list). The user cannot override
 *     this — they cannot add or remove processes from the set.
 *
 * Recovery sections (only shown when deadlock is confirmed):
 *   A. Process Termination — POST /api/recovery/terminate
 *   B. Resource Preemption — POST /api/recovery/preempt
 */

import { useEffect, useState } from 'react'
import { postDeadlockDetect, postRecoveryPreempt, postRecoveryTerminate } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import SectionCard from '../components/SectionCard'
import type { DetectionResponse, Matrix, RecoveryResponse } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function zeroMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(0))
}

function resizeMatrix(m: Matrix, newRows: number, newCols: number): Matrix {
  return Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => m[r]?.[c] ?? 0),
  )
}

function badge(label: string, style: string) {
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${style}`}>
      {label}
    </span>
  )
}

// ─── Termination result display ───────────────────────────────────────────────

interface TerminationResultProps {
  result: RecoveryResponse
  resourceIds: string[]
}

function TerminationResult({ result, resourceIds }: TerminationResultProps) {
  return (
    <div className="space-y-4">
      <div className={[
        'rounded-xl border p-4',
        result.success ? 'border-green-600 bg-green-950/50' : 'border-red-600 bg-red-950/50',
      ].join(' ')}>
        <p className="font-semibold text-sm text-white">
          {result.success ? '✅ Deadlock resolved' : '❌ Deadlock not resolved'}
        </p>
        <p className="text-xs text-gray-400 mt-1">{result.message}</p>
        <p className="text-xs text-gray-500 mt-1">
          Strategy: <span className="text-gray-300">{result.strategy}</span>
          {' · '}Cost: <span className="text-gray-300">{result.cost_estimate} process(es) terminated</span>
        </p>
      </div>

      {result.termination_steps.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Termination sequence</p>
          {result.termination_steps.map((step) => (
            <div
              key={step.step}
              className={[
                'rounded-lg border p-4 space-y-2',
                step.deadlock_resolved
                  ? 'border-green-700 bg-gray-800/60'
                  : 'border-gray-700 bg-gray-800/40',
              ].join(' ')}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Step {step.step + 1}</span>
                  <span className="font-semibold text-red-300">
                    ✂ Terminated: {step.terminated_process}
                  </span>
                </div>
                {step.deadlock_resolved
                  ? badge('Deadlock resolved', 'bg-green-800 text-green-100')
                  : badge('Deadlock persists', 'bg-gray-700 text-gray-300')}
              </div>

              <p className="text-xs text-gray-400">{step.reason}</p>

              {step.resources_freed.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Resources freed:</p>
                  <div className="flex flex-wrap gap-2">
                    {step.resources_freed.map(([resIdx, amt], i) => (
                      <span key={i} className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded-full">
                        {resourceIds[resIdx] ?? `R${resIdx}`}: +{amt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {step.remaining_deadlocked.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Still deadlocked:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {step.remaining_deadlocked.map((pid) => (
                      <span key={pid} className="text-xs bg-red-900/60 text-red-200 px-2 py-0.5 rounded-full">
                        {pid}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.available_after.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Available after recovery</p>
          <div className="flex flex-wrap gap-4">
            {result.available_after.map((v, j) => (
              <div key={j} className="flex flex-col items-center gap-1">
                <span className="text-base font-bold text-green-300">{v}</span>
                <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preemption result display ────────────────────────────────────────────────

interface PreemptionResultProps {
  result: RecoveryResponse
  resourceIds: string[]
}

function PreemptionResult({ result, resourceIds }: PreemptionResultProps) {
  return (
    <div className="space-y-4">
      <div className={[
        'rounded-xl border p-4',
        result.success ? 'border-green-600 bg-green-950/50' : 'border-red-600 bg-red-950/50',
      ].join(' ')}>
        <p className="font-semibold text-sm text-white">
          {result.success ? '✅ Deadlock resolved' : '❌ Deadlock not resolved'}
        </p>
        <p className="text-xs text-gray-400 mt-1">{result.message}</p>
        <p className="text-xs text-gray-500 mt-1">
          Strategy: <span className="text-gray-300">{result.strategy}</span>
          {' · '}Cost: <span className="text-gray-300">{result.cost_estimate} process(es) preempted</span>
        </p>
      </div>

      {result.preemption_steps.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Preemption actions</p>
          {result.preemption_steps.map((step, i) => (
            <div key={i} className="rounded-lg border border-yellow-700/50 bg-yellow-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-yellow-300">
                  ⚡ Victim: {step.victim_process}
                </span>
                {step.requires_rollback && badge('Rollback required', 'bg-yellow-800 text-yellow-100')}
              </div>

              <p className="text-xs text-gray-400">{step.reason}</p>

              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-gray-500">Process state:</p>
                <span className="text-xs bg-red-900/50 text-red-200 px-2 py-0.5 rounded-full">
                  {step.victim_state_before}
                </span>
                <span className="text-xs text-gray-500">→</span>
                <span className="text-xs bg-yellow-800/60 text-yellow-200 px-2 py-0.5 rounded-full">
                  {step.victim_state_after}
                </span>
              </div>

              {step.preempted_resources.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Resources preempted:</p>
                  <div className="flex flex-wrap gap-2">
                    {step.preempted_resources.map(([resIdx, amt], j) => (
                      <span key={j} className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded-full">
                        {resourceIds[resIdx] ?? `R${resIdx}`}: −{amt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {step.rollback_checkpoint && (
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Rollback checkpoint</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{step.rollback_checkpoint}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.available_after.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Available after recovery</p>
          <div className="flex flex-wrap gap-4">
            {result.available_after.map((v, j) => (
              <div key={j} className="flex flex-col items-center gap-1">
                <span className="text-base font-bold text-green-300">{v}</span>
                <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Strategy constants ───────────────────────────────────────────────────────

const TERMINATE_STRATEGIES = [
  { value: 'all',           label: 'Terminate all at once' },
  { value: 'min_resources', label: 'One at a time — fewest resources held' },
  { value: 'lowest_pid',    label: 'One at a time — lowest process ID first' },
]

const PREEMPT_STRATEGIES = [
  { value: 'min_resources', label: 'Victim — fewest resources held' },
  { value: 'lowest_pid',    label: 'Victim — lowest process ID first' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Recovery() {
  const { scenario } = useScenario()

  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  // ── Step 1: Detection (inline — gates everything below) ───────────────────
  // Same Request matrix pattern as Detection.tsx: editable, zero by default,
  // auto-resized when the scenario changes.
  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))

  useEffect(() => {
    setRequest((prev) => resizeMatrix(prev, np, nr))
  }, [np, nr])

  const [detection, setDetection] = useState<DetectionResponse | null>(null)
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  // Clear all results whenever the scenario changes
  useEffect(() => {
    setDetection(null)
    setDetectError(null)
    setTermResult(null)
    setPreemptResult(null)
    setTermError(null)
    setPreemptError(null)
  }, [scenario])

  async function runDetection() {
    setDetectLoading(true)
    setDetectError(null)
    setDetection(null)
    // Also clear any stale recovery results from a previous detection run
    setTermResult(null)
    setPreemptResult(null)
    try {
      const res = await postDeadlockDetect({
        allocation: scenario.allocation,
        request,
        available: scenario.available,
      })
      setDetection(res)
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetectLoading(false)
    }
  }

  // Derive the confirmed deadlocked PIDs directly from the detection result.
  // detection.deadlocked_processes contains numeric indices — map them to
  // string IDs using the scenario process list.
  // This is the ONLY source of truth for which processes are deadlocked.
  const deadlockedPids: string[] = detection?.deadlock_detected
    ? detection.deadlocked_processes.map((idx) => processIds[idx] ?? `P${idx}`)
    : []

  const isDeadlocked = detection?.deadlock_detected === true
  const isClean      = detection?.deadlock_detected === false

  // ── Step 2: Termination ───────────────────────────────────────────────────
  const [termStrategy, setTermStrategy] = useState('min_resources')
  const [termResult, setTermResult] = useState<RecoveryResponse | null>(null)
  const [termLoading, setTermLoading] = useState(false)
  const [termError, setTermError] = useState<string | null>(null)

  async function runTermination() {
    setTermLoading(true)
    setTermError(null)
    setTermResult(null)
    try {
      const res = await postRecoveryTerminate({
        processes: scenario.processes,
        resources: scenario.resources,
        allocation: scenario.allocation,
        need: scenario.need,
        available: scenario.available,
        deadlocked_pids: deadlockedPids,
        strategy: termStrategy,
      })
      setTermResult(res)
    } catch (err) {
      setTermError(err instanceof Error ? err.message : String(err))
    } finally {
      setTermLoading(false)
    }
  }

  // ── Step 2: Preemption ────────────────────────────────────────────────────
  const [preemptStrategy, setPreemptStrategy] = useState('min_resources')
  const [preemptResult, setPreemptResult] = useState<RecoveryResponse | null>(null)
  const [preemptLoading, setPreemptLoading] = useState(false)
  const [preemptError, setPreemptError] = useState<string | null>(null)

  async function runPreemption() {
    setPreemptLoading(true)
    setPreemptError(null)
    setPreemptResult(null)
    try {
      const res = await postRecoveryPreempt({
        processes: scenario.processes,
        resources: scenario.resources,
        allocation: scenario.allocation,
        need: scenario.need,
        available: scenario.available,
        deadlocked_pids: deadlockedPids,
        strategy: preemptStrategy,
      })
      setPreemptResult(res)
    } catch (err) {
      setPreemptError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreemptLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Deadlock Recovery</h1>
        <p className="text-gray-400 text-sm mt-1">
          Scenario: <span className="text-white font-medium">{scenario.name}</span>
          {' · '}
          {np} processes · {nr} resource types
        </p>
      </div>

      {/* Concept note */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-400 space-y-1">
        <p>
          <span className="text-white font-medium">Recovery</span> is only valid after a confirmed
          deadlock. Run detection below first — the deadlocked processes are determined by the real
          algorithm result and cannot be overridden manually.
        </p>
      </div>

      {/* ── Step 1: Confirm deadlock ─────────────────────────────────────── */}
      <SectionCard title="Step 1 — Confirm Deadlock via Detection">
        <p className="text-xs text-gray-500 -mt-1 mb-3">
          Enter the Request matrix (what each process is currently waiting for) and run detection.
          Recovery options unlock only when the result is DEADLOCKED.
        </p>

        <MatrixEditor
          matrix={request}
          onChange={setRequest}
          rowLabels={processIds}
          colLabels={resourceIds}
        />

        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <button
            onClick={() => setRequest(zeroMatrix(np, nr))}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Reset to zeros
          </button>

          <button
            onClick={runDetection}
            disabled={detectLoading}
            className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            {detectLoading ? 'Running…' : '🔍 Run Detection'}
          </button>
        </div>

        {detectError && (
          <div className="mt-3">
            <ErrorBanner message={detectError} onDismiss={() => setDetectError(null)} />
          </div>
        )}

        {/* Detection result badge */}
        {detection && (
          <div className={[
            'mt-4 rounded-xl border-2 p-4 flex items-start gap-3',
            isDeadlocked ? 'border-red-500 bg-red-950/60' : 'border-green-600 bg-green-950/50',
          ].join(' ')}>
            <span className="text-2xl mt-0.5">{isDeadlocked ? '🔴' : '✅'}</span>
            <div className="space-y-1.5 flex-1">
              <p className="font-bold text-sm text-white">
                {isDeadlocked ? 'DEADLOCKED' : 'NO DEADLOCK'}
              </p>
              <p className="text-xs text-gray-400">{detection.message}</p>

              {isDeadlocked && (
                <div className="pt-1">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Confirmed deadlocked processes (auto-populated from detection result):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {deadlockedPids.map((pid) => (
                      <span
                        key={pid}
                        className="text-xs font-semibold bg-red-800 text-red-100 px-3 py-1 rounded-full"
                      >
                        {pid}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {isClean && (
                <p className="text-xs text-green-400 pt-1">
                  No deadlock confirmed — there is nothing to recover from. Try editing the Request
                  matrix to represent a blocked state, or load a different scenario.
                </p>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Reference: Allocation + Available */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard title="Allocation  (reference)">
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 pr-3 pb-1">Process</th>
                  {resourceIds.map((r) => (
                    <th key={r} className="text-center text-gray-500 px-2 pb-1">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenario.processes.map((p, i) => (
                  <tr
                    key={p.id}
                    className={deadlockedPids.includes(p.id) ? 'text-red-300' : 'text-gray-300'}
                  >
                    <td className="pr-3 py-0.5 font-medium">{p.id}</td>
                    {scenario.allocation[i]?.map((v, j) => (
                      <td key={j} className="text-center px-2 py-0.5">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Available  (reference)">
          <div className="flex flex-wrap gap-4 pt-1">
            {scenario.available.map((v, j) => (
              <div key={j} className="flex flex-col items-center gap-1">
                <span className="text-lg font-bold text-white">{v}</span>
                <span className="text-xs text-gray-500">{resourceIds[j]}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── Recovery sections: only rendered when deadlock is confirmed ───── */}
      {isDeadlocked && (
        <>
          {/* ── Option A: Terminate ──────────────────────────────────────── */}
          <SectionCard title="Option A — Terminate Processes">
            <p className="text-xs text-gray-500 -mt-1 mb-4">
              Aborts one or more deadlocked processes. Their held resources are immediately
              released. Terminated processes cannot continue.
            </p>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block">Strategy</label>
                <select
                  value={termStrategy}
                  onChange={(e) => setTermStrategy(e.target.value)}
                  className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  {TERMINATE_STRATEGIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={runTermination}
                disabled={termLoading}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                {termLoading ? 'Running…' : '✂ Terminate Processes'}
              </button>
            </div>

            {termError && (
              <div className="mt-4">
                <ErrorBanner message={termError} onDismiss={() => setTermError(null)} />
              </div>
            )}

            {termResult && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <TerminationResult result={termResult} resourceIds={resourceIds} />
              </div>
            )}
          </SectionCard>

          {/* ── Option B: Preempt ────────────────────────────────────────── */}
          <SectionCard title="Option B — Preempt Resources">
            <p className="text-xs text-gray-500 -mt-1 mb-4">
              Forcibly takes resources from victim processes without terminating them. Victims must
              roll back to their last safe checkpoint and be rescheduled.
            </p>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block">Victim selection</label>
                <select
                  value={preemptStrategy}
                  onChange={(e) => setPreemptStrategy(e.target.value)}
                  className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  {PREEMPT_STRATEGIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={runPreemption}
                disabled={preemptLoading}
                className="bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                {preemptLoading ? 'Running…' : '⚡ Preempt Resources'}
              </button>
            </div>

            {preemptError && (
              <div className="mt-4">
                <ErrorBanner message={preemptError} onDismiss={() => setPreemptError(null)} />
              </div>
            )}

            {preemptResult && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <PreemptionResult result={preemptResult} resourceIds={resourceIds} />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
