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
function resizeMatrix(m: Matrix, r: number, c: number): Matrix {
  return Array.from({ length: r }, (_, ri) => Array.from({ length: c }, (_, ci) => m[ri]?.[ci] ?? 0))
}

export default function Detection() {
  const { scenario } = useScenario()
  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds  = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))
  useEffect(() => { setRequest((prev) => resizeMatrix(prev, np, nr)) }, [np, nr])

  const [result, setResult]   = useState<DetectionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function runDetection() {
    setLoading(true); setError(null); setResult(null)
    try {
      setResult(await postDeadlockDetect({ allocation: scenario.allocation, request, available: scenario.available }))
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setLoading(false) }
  }

  const isDeadlocked = result?.deadlock_detected === true
  const isClean      = result?.deadlock_detected === false

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-neutral-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Deadlock Detection
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Scenario: <span className="font-semibold text-neutral-900">{scenario.name}</span>
            {' · '}{np} processes · {nr} resource types
          </p>
        </div>
        <div>
          <button
            onClick={runDetection}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Evaluating State…' : 'Run Detection Algorithm'}
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="card p-4 bg-neutral-50/70 border-neutral-200/80 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 mt-2 shrink-0" />
        <div className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
          <span className="font-semibold text-neutral-900">Request Matrix (Active Wait States): </span>
          Enter how many instances each process is currently waiting for. A row of zeros indicates the process is active or idle (not blocked).
          Unlike the Need matrix which represents worst-case claims, the Request matrix checks the system's exact current pending requests.
        </div>
      </div>

      {/* Request Matrix Editor */}
      <SectionCard
        title="Pending Request Matrix"
        subtitle="Current outstanding resource requests per process"
        action={
          <button
            onClick={() => setRequest(zeroMatrix(np, nr))}
            className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors font-medium underline underline-offset-2"
          >
            Reset to all zeros
          </button>
        }
      >
        <MatrixEditor matrix={request} onChange={setRequest} rowLabels={processIds} colLabels={resourceIds} />
      </SectionCard>

      {/* Context Matrices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Allocated Resources" subtitle="Current holding state (read only)">
          <MatrixEditor matrix={scenario.allocation} rowLabels={processIds} colLabels={resourceIds} readOnly />
        </SectionCard>

        <SectionCard title="Available Instances" subtitle="Current free unallocated units">
          <div className="flex flex-wrap gap-3 pt-2">
            {scenario.available.map((v, j) => (
              <div
                key={j}
                className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/90 rounded-md px-3 py-2 shadow-2xs"
              >
                <span className="text-xs font-mono font-bold text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                <span className="w-px h-3.5 bg-neutral-200" />
                <span className="text-base font-mono font-bold text-neutral-900">{v}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Result Card */}
      {result && (
        <div
          className={`card p-5 sm:p-6 transition-all ${
            isDeadlocked ? 'border-rose-200 bg-rose-50/20' : 'border-neutral-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <span
                className={`w-3.5 h-3.5 rounded-full inline-block ${
                  isDeadlocked ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900">
                  {isDeadlocked ? 'Deadlock Detected' : 'No Deadlock Found'}
                </h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                    isDeadlocked
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-neutral-900 text-white border-neutral-900'
                  }`}
                >
                  {isDeadlocked ? 'CIRCULAR WAIT' : 'SYSTEM CLEAR'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 max-w-2xl leading-relaxed">
                {result.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resource Allocation Graph */}
      <SectionCard
        title="Resource Allocation Graph (RAG)"
        subtitle="Visual representation of allocations and pending requests"
      >
        <p className="text-xs text-neutral-500 mb-4">
          Circles = processes &bull; Squares = resource classes &bull; Solid lines = held allocations &bull; Dashed lines = requested waits.
          {result?.deadlock_detected ? ' Red highlighted nodes and edges form the circular wait.' : ''}
        </p>
        <div className="rounded-lg border border-neutral-200 overflow-hidden bg-white shadow-2xs">
          <ResourceGraph scenario={scenario} request={request} detectionResult={result} />
        </div>
      </SectionCard>

      {/* Process Outcomes */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {isDeadlocked && (
            <SectionCard title="Deadlocked Processes" subtitle="Processes caught in circular dependency">
              <div className="flex flex-wrap gap-2 pt-1">
                {result.deadlocked_processes.map((idx) => (
                  <span
                    key={idx}
                    className="bg-white text-rose-700 border border-rose-300 rounded-md px-3 py-1 text-xs font-mono font-bold shadow-2xs"
                  >
                    {processIds[idx] ?? `P${idx}`}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          {result.completed_processes.length > 0 && (
            <SectionCard title="Completed Processes" subtitle="Processes able to finish execution">
              <div className="flex flex-wrap gap-2 pt-1">
                {result.completed_processes.map((idx) => (
                  <span
                    key={idx}
                    className="bg-neutral-900 text-white rounded-md px-3 py-1 text-xs font-mono font-bold shadow-2xs"
                  >
                    {processIds[idx] ?? `P${idx}`}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Final Vectors */}
      {result && (
        <SectionCard title="Final Algorithm State" subtitle="Work and Finish vectors after algorithm termination">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="section-label mb-2.5">Final Work Vector</p>
              <div className="flex gap-2.5 flex-wrap">
                {result.work_final.map((v, j) => (
                  <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/90 rounded-md px-3 py-1.5 shadow-2xs">
                    <span className="text-xs font-mono font-bold text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                    <span className="w-px h-3 bg-neutral-200" />
                    <span className="text-sm font-mono font-bold text-neutral-900">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="section-label mb-2.5">Final Finish Vector</p>
              <div className="flex gap-2 flex-wrap">
                {result.finish_final.map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 border rounded-md px-3 py-1.5 shadow-2xs ${
                      f
                        ? 'bg-neutral-50 border-neutral-200/90 text-neutral-900'
                        : 'bg-rose-50/50 border-rose-200 text-rose-700'
                    }`}
                  >
                    <span className="text-xs font-mono font-semibold">{processIds[i] ?? `P${i}`}</span>
                    <span className="w-px h-3 bg-neutral-200" />
                    <span className="text-xs font-mono font-bold">{f ? 'TRUE' : 'FALSE'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Algorithm Step Trace */}
      {result && <StepTrace steps={result.steps} processIds={processIds} />}

      {isClean && (
        <div className="card p-4 bg-neutral-50/60 text-xs text-neutral-500 leading-relaxed">
          <span className="font-semibold text-neutral-900">Note: </span>
          A state without deadlock does not imply safety under maximum demand. If processes can request up to their declared limits, check the Avoidance tab to verify safety guarantees.
        </div>
      )}
    </div>
  )
}
