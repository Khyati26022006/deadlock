/**
 * Deadlock Detection page (/detection)
 *
 * Uses the active scenario from ScenarioContext.
 * The user edits the Request matrix (what each process is currently
 * waiting for), then clicks "Run Detection".
 *
 * Displays:
 *   - NO_DEADLOCK / DEADLOCKED status badge
 *   - List of deadlocked processes (if any)
 *   - List of processes that can complete
 *   - Full step-by-step trace (collapsible)
 */

import { useEffect, useState } from 'react'
import { postDeadlockDetect } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import ResourceGraph from '../components/ResourceGraph'
import SectionCard from '../components/SectionCard'
import StepTrace from '../components/StepTrace'
import type { DetectionResponse, Matrix } from '../types'

function zeroMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(0))
}

function resizeMatrix(m: Matrix, newRows: number, newCols: number): Matrix {
  return Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => m[r]?.[c] ?? 0),
  )
}

export default function Detection() {
  const { scenario } = useScenario()

  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  // Request matrix: what each process is currently waiting for.
  // Defaults to all-zero (nobody waiting) — the user can edit it.
  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))

  // Keep request matrix sized to the current scenario dimensions
  useEffect(() => {
    setRequest((prev) => resizeMatrix(prev, np, nr))
  }, [np, nr])

  const [result, setResult] = useState<DetectionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runDetection() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await postDeadlockDetect({
        allocation: scenario.allocation,
        request,
        available: scenario.available,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Result rendering helpers ─────────────────────────────────────────────

  const isDeadlocked = result?.deadlock_detected === true
  const isClean = result?.deadlock_detected === false

  function statusBanner() {
    if (!result) return null
    if (isDeadlocked) {
      return (
        <div className="rounded-2xl border-2 border-red-500 bg-red-950 p-5 flex items-center gap-4">
          <span className="text-4xl">🔴</span>
          <div>
            <h2 className="text-xl font-bold text-red-300">DEADLOCKED</h2>
            <p className="text-sm text-gray-400 mt-1">{result.message}</p>
          </div>
        </div>
      )
    }
    return (
      <div className="rounded-2xl border-2 border-green-500 bg-green-950 p-5 flex items-center gap-4">
        <span className="text-4xl">✅</span>
        <div>
          <h2 className="text-xl font-bold text-green-300">NO DEADLOCK</h2>
          <p className="text-sm text-gray-400 mt-1">{result.message}</p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Deadlock Detection</h1>
        <p className="text-gray-400 text-sm mt-1">
          Scenario: <span className="text-white font-medium">{scenario.name}</span>
          {' · '}
          {np} processes · {nr} resource types
        </p>
      </div>

      {/* Explanation */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-400 space-y-1">
        <p>
          <span className="text-white font-medium">Request matrix</span> — enter how many instances
          of each resource each process is <em>currently waiting for</em>.
          A row of zeros means that process is not waiting for anything right now.
        </p>
        <p className="text-xs text-gray-500">
          This is different from the Need matrix (worst-case future demand) used by the Banker's Algorithm.
        </p>
      </div>

      {/* Request matrix */}
      <SectionCard title="Request Matrix  (current pending waits)">
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

      {/* Reference: current allocation + available */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard title="Allocation  (reference, read-only)">
          <MatrixEditor
            matrix={scenario.allocation}
            rowLabels={processIds}
            colLabels={resourceIds}
            readOnly
          />
        </SectionCard>
        <SectionCard title="Available  (reference, read-only)">
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

      {/* Run button */}
      <button
        onClick={runDetection}
        disabled={loading}
        className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
      >
        {loading ? 'Running…' : '🔍 Run Deadlock Detection'}
      </button>

      {/* Error */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Result banner */}
      {statusBanner()}

      {/* Resource Allocation Graph — always visible, highlights on deadlock */}
      <SectionCard title="Resource Allocation Graph">
        <p className="text-xs text-gray-500 -mt-2 mb-2">
          Circles = processes · Squares = resources · Solid arrows = allocation (resource→process) ·
          Dashed arrows = request (process→resource).
          {result?.deadlock_detected
            ? ' Red nodes and edges are confirmed deadlocked.'
            : ' Run detection to highlight any deadlocked nodes.'}
        </p>
        <ResourceGraph
          scenario={scenario}
          request={request}
          detectionResult={result}
        />
      </SectionCard>

      {/* Deadlocked processes */}
      {isDeadlocked && result && (
        <SectionCard title="Deadlocked Processes">
          <div className="flex flex-wrap gap-2">
            {result.deadlocked_processes.map((idx) => (
              <span key={idx} className="bg-red-800 text-red-100 rounded-full px-4 py-1 text-sm font-medium">
                {processIds[idx] ?? `P${idx}`}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Completed processes */}
      {result && result.completed_processes.length > 0 && (
        <SectionCard title="Processes That Can Complete">
          <div className="flex flex-wrap gap-2">
            {result.completed_processes.map((idx) => (
              <span key={idx} className="bg-green-800 text-green-100 rounded-full px-4 py-1 text-sm font-medium">
                {processIds[idx] ?? `P${idx}`}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Work & Finish vectors */}
      {result && (
        <SectionCard title="Final State">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Work vector (final)</p>
              <div className="flex gap-3 flex-wrap">
                {result.work_final.map((v, j) => (
                  <div key={j} className="flex flex-col items-center gap-1">
                    <span className="text-base font-bold text-white">{v}</span>
                    <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Finish vector</p>
              <div className="flex gap-3 flex-wrap">
                {result.finish_final.map((f, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className={`text-base font-bold ${f ? 'text-green-400' : 'text-red-400'}`}>
                      {f ? '✓' : '✗'}
                    </span>
                    <span className="text-xs text-gray-500">{processIds[i] ?? `P${i}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step trace */}
      {result && (
        <StepTrace steps={result.steps} processIds={processIds} />
      )}

      {/* Distinction note */}
      {isClean && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-xs text-gray-500">
          <strong className="text-gray-300">Note:</strong> NO_DEADLOCK means no process is currently
          confirmed blocked in a circular wait. The system may still be UNSAFE (Banker's Algorithm) if
          future resource requests could lead to deadlock — check the Avoidance page for that analysis.
        </div>
      )}
    </div>
  )
}
