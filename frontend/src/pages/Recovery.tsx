import { useEffect, useState } from 'react'
import { postDeadlockDetect, postRecoveryPreempt, postRecoveryTerminate } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import SectionCard from '../components/SectionCard'
import type { DetectionResponse, Matrix, RecoveryResponse } from '../types'

function zeroMatrix(r: number, c: number): Matrix { return Array.from({ length: r }, () => Array(c).fill(0)) }
function resizeMatrix(m: Matrix, r: number, c: number): Matrix {
  return Array.from({ length: r }, (_, ri) => Array.from({ length: c }, (_, ci) => m[ri]?.[ci] ?? 0))
}

const TERMINATE_STRATEGIES = [
  { value: 'all',           label: 'Terminate all deadlocked at once' },
  { value: 'min_resources', label: 'One by one — fewest resources held first' },
  { value: 'lowest_pid',    label: 'One by one — lowest PID first' },
]
const PREEMPT_STRATEGIES = [
  { value: 'min_resources', label: 'Victim selection — fewest resources held' },
  { value: 'lowest_pid',    label: 'Victim selection — lowest PID first' },
]

function TerminationResult({ result, resourceIds }: { result: RecoveryResponse; resourceIds: string[] }) {
  return (
    <div className="space-y-4 pt-2">
      <div
        className={`card p-5 transition-all ${
          result.success ? 'border-neutral-200' : 'border-rose-200 bg-rose-50/20'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${result.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <h4 className="font-bold text-base text-neutral-900">
            {result.success ? 'Deadlock Successfully Resolved' : 'Recovery Incomplete'}
          </h4>
        </div>
        <p className="text-xs sm:text-sm text-neutral-600 mt-1">{result.message}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500 flex-wrap">
          <span>Strategy: <span className="font-mono font-medium text-neutral-800">{result.strategy}</span></span>
          <span>&bull;</span>
          <span>Cost Impact: <span className="font-mono font-medium text-neutral-800">{result.cost_estimate} process(es) terminated</span></span>
        </div>
      </div>

      {result.termination_steps.length > 0 && (
        <div className="space-y-2.5">
          <p className="section-label">Step-by-Step Abort Sequence</p>
          {result.termination_steps.map((step) => (
            <div
              key={step.step}
              className="card p-4 space-y-2.5 border-neutral-200/90"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-mono font-bold">Step #{step.step + 1}</span>
                  <span className="font-mono font-bold text-sm text-neutral-900">
                    Abort: {step.terminated_process}
                  </span>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                    step.deadlock_resolved
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                  }`}
                >
                  {step.deadlock_resolved ? 'CYCLE BROKEN' : 'CYCLE PERSISTS'}
                </span>
              </div>

              <p className="text-xs text-neutral-600">{step.reason}</p>

              {step.resources_freed.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-xs text-neutral-400 font-medium">Reclaimed:</span>
                  {step.resources_freed.map(([rIdx, amt], i) => (
                    <span
                      key={i}
                      className="text-xs bg-neutral-50 border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded font-mono"
                    >
                      {resourceIds[rIdx] ?? `R${rIdx}`}: +{amt}
                    </span>
                  ))}
                </div>
              )}

              {step.remaining_deadlocked.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-neutral-400">Still in cycle:</span>
                  {step.remaining_deadlocked.map((pid) => (
                    <span
                      key={pid}
                      className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-mono font-semibold"
                    >
                      {pid}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.available_after.length > 0 && (
        <div className="card p-4">
          <p className="section-label mb-2">Available Vector After Abort Actions</p>
          <div className="flex flex-wrap gap-2">
            {result.available_after.map((v, j) => (
              <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-md text-xs font-mono">
                <span className="text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                <span className="w-px h-3 bg-neutral-200" />
                <span className="font-bold text-neutral-900">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PreemptionResult({ result, resourceIds }: { result: RecoveryResponse; resourceIds: string[] }) {
  return (
    <div className="space-y-4 pt-2">
      <div
        className={`card p-5 transition-all ${
          result.success ? 'border-neutral-200' : 'border-rose-200 bg-rose-50/20'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${result.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <h4 className="font-bold text-base text-neutral-900">
            {result.success ? 'Preemption Resolved Deadlock' : 'Preemption Incomplete'}
          </h4>
        </div>
        <p className="text-xs sm:text-sm text-neutral-600 mt-1">{result.message}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500 flex-wrap">
          <span>Strategy: <span className="font-mono font-medium text-neutral-800">{result.strategy}</span></span>
          <span>&bull;</span>
          <span>Victims: <span className="font-mono font-medium text-neutral-800">{result.cost_estimate}</span></span>
        </div>
      </div>

      {result.preemption_steps.length > 0 && (
        <div className="space-y-2.5">
          <p className="section-label">Preemption Execution</p>
          {result.preemption_steps.map((step, i) => (
            <div key={i} className="card p-4 space-y-2.5 border-neutral-200/90">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono font-bold text-sm text-neutral-900">
                  Victim Process: {step.victim_process}
                </span>
                {step.requires_rollback && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded border bg-neutral-100 text-neutral-700 border-neutral-200">
                    Rollback Checkpoint Required
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-600">{step.reason}</p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-neutral-400">Process State:</span>
                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-mono font-medium">
                  {step.victim_state_before}
                </span>
                <span className="text-neutral-400">&rarr;</span>
                <span className="bg-neutral-100 text-neutral-800 border border-neutral-200 px-2 py-0.5 rounded font-mono font-medium">
                  {step.victim_state_after}
                </span>
              </div>
              {step.preempted_resources.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-xs text-neutral-400">Preempted:</span>
                  {step.preempted_resources.map(([rIdx, amt], j) => (
                    <span
                      key={j}
                      className="text-xs bg-neutral-50 border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded font-mono"
                    >
                      {resourceIds[rIdx] ?? `R${rIdx}`}: &minus;{amt}
                    </span>
                  ))}
                </div>
              )}
              {step.rollback_checkpoint && (
                <div className="bg-neutral-50 border border-neutral-200 rounded p-2.5 text-xs text-neutral-600">
                  <span className="font-semibold text-neutral-800">Checkpoint: </span>
                  {step.rollback_checkpoint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.available_after.length > 0 && (
        <div className="card p-4">
          <p className="section-label mb-2">Available Vector After Preemption</p>
          <div className="flex flex-wrap gap-2">
            {result.available_after.map((v, j) => (
              <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-md text-xs font-mono">
                <span className="text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                <span className="w-px h-3 bg-neutral-200" />
                <span className="font-bold text-neutral-900">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Recovery() {
  const { scenario } = useScenario()
  const np = scenario.processes.length, nr = scenario.resources.length
  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  const [request, setRequest] = useState<Matrix>(() => zeroMatrix(np, nr))
  useEffect(() => { setRequest((prev) => resizeMatrix(prev, np, nr)) }, [np, nr])

  const [detection, setDetection] = useState<DetectionResponse | null>(null)
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  const [termStrategy, setTermStrategy] = useState('min_resources')
  const [termResult, setTermResult] = useState<RecoveryResponse | null>(null)
  const [termLoading, setTermLoading] = useState(false)
  const [termError, setTermError] = useState<string | null>(null)

  const [preemptStrategy, setPreemptStrategy] = useState('min_resources')
  const [preemptResult, setPreemptResult] = useState<RecoveryResponse | null>(null)
  const [preemptLoading, setPreemptLoading] = useState(false)
  const [preemptError, setPreemptError] = useState<string | null>(null)

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
    setTermResult(null)
    setPreemptResult(null)
    try {
      setDetection(
        await postDeadlockDetect({
          allocation: scenario.allocation,
          request,
          available: scenario.available,
        }),
      )
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetectLoading(false)
    }
  }

  const deadlockedPids: string[] = detection?.deadlock_detected
    ? detection.deadlocked_processes.map((idx) => processIds[idx] ?? `P${idx}`)
    : []
  const isDeadlocked = detection?.deadlock_detected === true
  const isClean      = detection?.deadlock_detected === false

  async function runTermination() {
    setTermLoading(true)
    setTermError(null)
    setTermResult(null)
    try {
      setTermResult(
        await postRecoveryTerminate({
          processes: scenario.processes,
          resources: scenario.resources,
          allocation: scenario.allocation,
          need: scenario.need,
          available: scenario.available,
          deadlocked_pids: deadlockedPids,
          strategy: termStrategy,
        }),
      )
    } catch (err) {
      setTermError(err instanceof Error ? err.message : String(err))
    } finally {
      setTermLoading(false)
    }
  }

  async function runPreemption() {
    setPreemptLoading(true)
    setPreemptError(null)
    setPreemptResult(null)
    try {
      setPreemptResult(
        await postRecoveryPreempt({
          processes: scenario.processes,
          resources: scenario.resources,
          allocation: scenario.allocation,
          need: scenario.need,
          available: scenario.available,
          deadlocked_pids: deadlockedPids,
          strategy: preemptStrategy,
        }),
      )
    } catch (err) {
      setPreemptError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreemptLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="pb-1 border-b border-neutral-200/60">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
          Deadlock Recovery Engine
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Scenario: <span className="font-semibold text-neutral-900">{scenario.name}</span>
          {' · '}{np} processes · {nr} resource types
        </p>
      </div>

      {/* Info card */}
      <div className="card p-4 bg-neutral-50/70 border-neutral-200/80 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 mt-2 shrink-0" />
        <div className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
          <span className="font-semibold text-neutral-900">Recovery Workflow: </span>
          Recovery algorithms only operate on confirmed deadlocked processes. Confirm deadlock in Step 1 to unlock termination and preemption recovery strategies.
        </div>
      </div>

      {/* Step 1 */}
      <SectionCard
        title="Step 1: Confirm Deadlock via Detection"
        subtitle="Validate the existence of a circular wait before triggering recovery actions"
        action={
          <button
            onClick={runDetection}
            disabled={detectLoading}
            className="btn-primary"
          >
            {detectLoading ? 'Evaluating…' : 'Run Detection'}
          </button>
        }
      >
        <div className="space-y-4">
          <MatrixEditor matrix={request} onChange={setRequest} rowLabels={processIds} colLabels={resourceIds} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRequest(zeroMatrix(np, nr))}
              className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 transition-colors"
            >
              Reset to zero matrix
            </button>
          </div>

          {detectError && <ErrorBanner message={detectError} onDismiss={() => setDetectError(null)} />}

          {detection && (
            <div
              className={`card p-5 transition-all ${
                isDeadlocked ? 'border-rose-200 bg-rose-50/20' : 'border-neutral-200'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                    isDeadlocked ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-neutral-900">
                      {isDeadlocked ? 'Deadlock Confirmed' : 'No Deadlock Found'}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                        isDeadlocked
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : 'bg-neutral-900 text-white border-neutral-900'
                      }`}
                    >
                      {isDeadlocked ? 'READY FOR RECOVERY' : 'RECOVERY UNNECESSARY'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1">{detection.message}</p>

                  {isDeadlocked && (
                    <div className="pt-3 mt-3 border-t border-rose-200/80">
                      <span className="section-label block mb-2 text-rose-800">
                        Target Deadlocked Processes
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {deadlockedPids.map((pid) => (
                          <span
                            key={pid}
                            className="text-xs font-mono font-bold bg-white text-rose-700 border border-rose-300 px-2.5 py-1 rounded shadow-2xs"
                          >
                            {pid}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {isClean && (
                    <p className="text-xs text-neutral-500 mt-2 italic">
                      All processes can complete with available resources. Recovery strategies are locked.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Step 2: Recovery Options */}
      {isDeadlocked && (
        <div className="space-y-6 animate-fade-in">
          {/* Option A: Process Termination */}
          <SectionCard
            title="Recovery Option A: Process Termination"
            subtitle="Abort deadlocked processes to break the circular wait cycle and reclaim resources"
          >
            <div className="space-y-4">
              <div>
                <label className="section-label block mb-2">Termination Heuristic</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {TERMINATE_STRATEGIES.map((s) => (
                    <label
                      key={s.value}
                      className={`flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-all ${
                        termStrategy === s.value
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                          : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="termStrategy"
                        value={s.value}
                        checked={termStrategy === s.value}
                        onChange={() => setTermStrategy(s.value)}
                        className="sr-only"
                      />
                      <span className="text-xs font-medium leading-snug">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={runTermination}
                  disabled={termLoading}
                  className="btn-primary"
                >
                  {termLoading ? 'Executing Abort Sequence…' : 'Execute Process Termination'}
                </button>
              </div>

              {termError && <ErrorBanner message={termError} onDismiss={() => setTermError(null)} />}
              {termResult && <TerminationResult result={termResult} resourceIds={resourceIds} />}
            </div>
          </SectionCard>

          {/* Option B: Resource Preemption */}
          <SectionCard
            title="Recovery Option B: Resource Preemption"
            subtitle="Preempt resources from a victim process and roll it back to a safe checkpoint"
          >
            <div className="space-y-4">
              <div>
                <label className="section-label block mb-2">Victim Selection Policy</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PREEMPT_STRATEGIES.map((s) => (
                    <label
                      key={s.value}
                      className={`flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-all ${
                        preemptStrategy === s.value
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                          : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="preemptStrategy"
                        value={s.value}
                        checked={preemptStrategy === s.value}
                        onChange={() => setPreemptStrategy(s.value)}
                        className="sr-only"
                      />
                      <span className="text-xs font-medium leading-snug">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={runPreemption}
                  disabled={preemptLoading}
                  className="btn-primary"
                >
                  {preemptLoading ? 'Executing Preemption…' : 'Execute Resource Preemption'}
                </button>
              </div>

              {preemptError && <ErrorBanner message={preemptError} onDismiss={() => setPreemptError(null)} />}
              {preemptResult && <PreemptionResult result={preemptResult} resourceIds={resourceIds} />}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
