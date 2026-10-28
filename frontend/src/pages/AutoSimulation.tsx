/**
 * Auto Simulation page (/auto-simulation)
 *
 * Clean, advanced light-theme OS simulator interface with monochromatic black/gray styling.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  postBankerSafety,
  postDeadlockDetect,
  postPreventionAnalyze,
  postRecoveryTerminate,
} from '../api/client'
import { generateRandomScenario, type RandomScenario } from '../utils/randomScenario'
import ErrorBanner from '../components/ErrorBanner'
import MatrixEditor from '../components/MatrixEditor'
import SectionCard from '../components/SectionCard'
import SimStepper from '../components/sim/SimStepper'
import SimSummaryStrip from '../components/sim/SimSummaryStrip'
import type {
  DetectionResponse,
  PreventionResponse,
  RecoveryResponse,
  SafetyResponse,
} from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimResults {
  safetyResult: SafetyResponse
  detectionResult: DetectionResponse
  preventionResult: PreventionResponse
  recoveryResult: RecoveryResponse | null   // null when no deadlock
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProcessDefs(labels: string[]) {
  return labels.map((id, i) => ({ id, name: `Process ${i}` }))
}

function makeResourceDefs(labels: string[], total: number[]) {
  return labels.map((id, j) => ({ id, name: `Resource ${j}`, total_instances: total[j] }))
}

// ─── Explanation generators ───────────────────────────────────────────────────

function explainAvoidance(r: SafetyResponse, processLabels: string[]): string {
  if (r.is_safe) {
    const seq = r.safe_sequence.map((i) => processLabels[i] ?? `P${i}`).join(' → ')
    return (
      `The Banker's Algorithm verified that the system is in a SAFE state. ` +
      `Even if every process suddenly requests its declared maximum demand simultaneously, ` +
      `the OS can satisfy them in the order ${seq} without entering deadlock.`
    )
  } else {
    return (
      `The system is in an UNSAFE state. ` +
      `No ordering of processes guarantees all can finish under worst-case demands. ` +
      `While not yet deadlocked, granting additional resources without caution could trigger an unrecoverable freeze.`
    )
  }
}

function explainDetection(r: DetectionResponse, processLabels: string[]): string {
  if (r.deadlock_detected) {
    const dead = r.deadlocked_processes.map((i) => processLabels[i] ?? `P${i}`).join(', ')
    return (
      `Deadlock confirmed. Process(es) ${dead} are caught in a circular wait. ` +
      `Each is waiting for a resource held by another in the set, and none can proceed without intervention.`
    )
  } else {
    return (
      `No deadlock detected in the current state. ` +
      `Every process can eventually obtain the resources it is actively waiting for using currently available units and subsequent releases.`
    )
  }
}

function explainPrevention(r: PreventionResponse): string {
  const count = r.conditions_present
  if (count === 4) {
    return (
      `All 4 Coffman conditions are present. Mutual exclusion, hold-and-wait, no-preemption, and circular wait are all satisfied. ` +
      `The system architecture is fully vulnerable to deadlock.`
    )
  } else if (count === 0) {
    return (
      `Zero Coffman conditions are present. The system is structurally immune to deadlock under this configuration.`
    )
  } else {
    return (
      `${count} of 4 Coffman conditions are active. Deadlock requires all 4 conditions simultaneously. ` +
      `Breaking the remaining condition(s) prevents deadlocks entirely.`
    )
  }
}

function explainRecovery(
  r: RecoveryResponse,
  det: DetectionResponse,
  processLabels: string[],
): string {
  const wasstuck = det.deadlocked_processes.map((i) => processLabels[i] ?? `P${i}`)
  if (r.success) {
    const steps = r.termination_steps.map((s) => s.terminated_process).join(', ')
    return (
      `Deadlock successfully resolved. The recovery engine aborted ${steps} using lowest PID priority, ` +
      `reclaiming their allocated resources and breaking the circular dependency.`
    )
  } else {
    return (
      `Recovery was attempted for ${wasstuck.join(', ')} but could not fully resolve the deadlock with the selected strategy.`
    )
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VectorRow({
  label,
  values,
  colLabels,
}: {
  label: string
  values: number[]
  colLabels: string[]
}) {
  return (
    <div className="card p-4">
      <span className="section-label block mb-2">{label}</span>
      <div className="flex gap-2.5 flex-wrap">
        {values.map((v, j) => (
          <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/90 rounded-md px-3 py-1.5 shadow-2xs">
            <span className="text-xs font-mono font-bold text-neutral-500">{colLabels[j]}</span>
            <span className="w-px h-3 bg-neutral-200" />
            <span className="text-sm font-mono font-bold text-neutral-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  ok,
  okLabel,
  badLabel,
  warnLabel,
  warn,
}: {
  ok: boolean
  okLabel: string
  badLabel: string
  warnLabel?: string
  warn?: boolean
}) {
  const isWarn = warn && !ok
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-semibold text-xs border ${
        ok
          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
          : isWarn
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : 'bg-rose-50 text-rose-700 border-rose-300'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          ok ? 'bg-emerald-400' : isWarn ? 'bg-amber-500' : 'bg-rose-500'
        }`}
      />
      <span>{ok ? okLabel : isWarn ? (warnLabel ?? badLabel) : badLabel}</span>
    </div>
  )
}

/** 2-part explanation panel wrapper */
function ExplainPanel({
  what,
  meaning,
}: {
  what: string
  meaning: string
}) {
  return (
    <div className="card divide-y divide-neutral-100 overflow-hidden text-xs sm:text-sm">
      <div className="p-4 bg-neutral-50/50">
        <span className="section-label block mb-1 text-[10px]">Algorithm Mechanism</span>
        <p className="text-neutral-600 leading-relaxed">{what}</p>
      </div>
      <div className="p-4 bg-white">
        <span className="section-label block mb-1 text-[10px]">Simulation Interpretation</span>
        <p className="text-neutral-800 leading-relaxed font-medium">{meaning}</p>
      </div>
    </div>
  )
}

// ─── Step content panels ─────────────────────────────────────────────────────

function StepScenario({ scenario }: { scenario: RandomScenario }) {
  const { allocation, maximum, available, processLabels, resourceLabels } = scenario
  return (
    <div className="space-y-5">
      <ExplainPanel
        what="This is the synthesized resource-allocation state. Each process defines its maximum resource claim and its currently allocated units. Available vector holds free units remaining in the system."
        meaning="These matrices serve as baseline inputs for safety analysis, detection of pending waits, and condition checks."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <span className="section-label block mb-2">Allocation Matrix (Held)</span>
          <MatrixEditor matrix={allocation} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
        <div>
          <span className="section-label block mb-2">Maximum Demand Matrix (Declared Peak)</span>
          <MatrixEditor matrix={maximum} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
      </div>
      <VectorRow label="System Available Vector" values={available} colLabels={resourceLabels} />
    </div>
  )
}

function StepNeed({ scenario }: { scenario: RandomScenario }) {
  const { need, allocation, maximum, processLabels, resourceLabels } = scenario
  return (
    <div className="space-y-5">
      <ExplainPanel
        what="The Need matrix quantifies remaining potential demand: Need[i][j] = Maximum[i][j] - Allocation[i][j]. This defines the maximum additional units process i could request before termination."
        meaning="Banker's Algorithm uses Need to simulate whether free units can satisfy any process's worst-case claims to completion."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <span className="section-label block mb-2">Need Matrix (Calculated)</span>
          <MatrixEditor matrix={need} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
        <div className="space-y-4">
          <div>
            <span className="section-label block mb-2">Allocation Component</span>
            <MatrixEditor matrix={allocation} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
          </div>
          <div>
            <span className="section-label block mb-2">Maximum Component</span>
            <MatrixEditor matrix={maximum} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
          </div>
        </div>
      </div>
    </div>
  )
}

function StepAvoidance({
  scenario,
  result,
}: {
  scenario: RandomScenario
  result: SafetyResponse
}) {
  const { processLabels } = scenario
  const meaning = explainAvoidance(result, processLabels)

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="Banker's Algorithm iterates across all processes to verify whether there exists at least one schedule where every process can complete under maximum claim assumptions."
        meaning={meaning}
      />

      <div className="space-y-3">
        <span className="section-label block">Safety Result</span>
        <div>
          <StatusBadge ok={result.is_safe} okLabel="SAFE STATE" badLabel="UNSAFE STATE" warn warnLabel="UNSAFE STATE" />
        </div>
        <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">{result.message}</p>

        {result.is_safe && result.safe_sequence.length > 0 && (
          <div className="card p-4 space-y-2 mt-3">
            <span className="section-label block">Safe Execution Schedule</span>
            <div className="flex flex-wrap items-center gap-2">
              {result.safe_sequence.map((idx, pos) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="bg-neutral-900 text-white rounded-md px-3 py-1 text-xs font-mono font-medium shadow-2xs">
                    #{pos + 1} {processLabels[idx] ?? `P${idx}`}
                  </span>
                  {pos < result.safe_sequence.length - 1 && (
                    <span className="text-neutral-400">&rarr;</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="card p-3 group">
          <summary className="text-xs font-medium text-neutral-600 cursor-pointer hover:text-neutral-900 list-none flex items-center justify-between">
            <span>View Step-by-Step Algorithm Iterations ({result.steps.length} checks)</span>
            <span className="text-neutral-400 group-open:rotate-180 transition-transform">&darr;</span>
          </summary>
          <div className="mt-3 space-y-1.5 pt-3 border-t border-neutral-100">
            {result.steps.map((s, i) => (
              <div key={i} className="flex gap-2 items-center text-xs font-mono">
                <span className={s.process_qualified ? 'text-neutral-900 font-bold' : 'text-neutral-400'}>&bull;</span>
                <span className="text-neutral-400">#{s.iteration}</span>
                <span className="font-semibold text-neutral-800">
                  {processLabels[s.process_index] ?? `P${s.process_index}`}
                </span>
                <span className={s.process_qualified ? 'text-neutral-900' : 'text-neutral-400'}>
                  {s.process_qualified ? 'qualified' : 'skipped'}
                </span>
                <span className="text-neutral-500 flex-1 truncate">{s.note}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}

function StepDetection({
  scenario,
  result,
}: {
  scenario: RandomScenario
  result: DetectionResponse
}) {
  const { processLabels, resourceLabels, request } = scenario
  const meaning = explainDetection(result, processLabels)

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="Deadlock detection evaluates actual outstanding requests rather than worst-case limits. It builds a dependency graph and detects if any processes are halted in a circular wait."
        meaning={meaning}
      />

      <div className="space-y-3">
        <span className="section-label block">Detection Outcome</span>
        <div>
          <StatusBadge
            ok={!result.deadlock_detected}
            okLabel="NO DEADLOCK DETECTED"
            badLabel="CIRCULAR DEADLOCK DETECTED"
          />
        </div>
        <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">{result.message}</p>

        <div className="pt-2">
          <span className="section-label block mb-2">Simulated Active Request Matrix</span>
          <MatrixEditor matrix={request} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>

        {result.deadlock_detected && result.deadlocked_processes.length > 0 && (
          <div className="card p-4 border-rose-200 bg-rose-50/20 space-y-2">
            <span className="section-label block text-rose-800">Deadlocked Processes</span>
            <div className="flex flex-wrap gap-2">
              {result.deadlocked_processes.map((idx) => (
                <span
                  key={idx}
                  className="bg-white text-rose-700 border border-rose-300 rounded px-2.5 py-1 text-xs font-mono font-bold shadow-2xs"
                >
                  {processLabels[idx] ?? `P${idx}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {!result.deadlock_detected && result.completed_processes.length > 0 && (
          <div className="card p-4 space-y-2">
            <span className="section-label block">Completion Order</span>
            <div className="flex flex-wrap items-center gap-2">
              {result.completed_processes.map((idx, pos) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="bg-neutral-900 text-white rounded px-2.5 py-1 text-xs font-mono font-medium shadow-2xs">
                    {processLabels[idx] ?? `P${idx}`}
                  </span>
                  {pos < result.completed_processes.length - 1 && (
                    <span className="text-neutral-400">&rarr;</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepPrevention({
  result,
}: {
  result: PreventionResponse
}) {
  const meaning = explainPrevention(result)

  const conditions = [
    ['mutual_exclusion', 'Mutual Exclusion'],
    ['hold_and_wait', 'Hold and Wait'],
    ['no_preemption', 'No Preemption'],
    ['circular_wait', 'Circular Wait'],
  ] as const

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="Prevention inspects the four Coffman conditions necessary for deadlock to manifest. Eliminating any single condition by design prevents deadlocks entirely."
        meaning={meaning}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-mono font-bold text-neutral-900">
            {result.conditions_present} / 4
          </span>
          <span className="section-label">Conditions Active</span>
        </div>
        <p className="text-xs text-neutral-500">{result.summary}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {conditions.map(([key, title]) => {
            const c = result[key]
            return (
              <div
                key={key}
                className={`card p-4 space-y-2 ${
                  c.present ? 'border-neutral-900/40 bg-neutral-50/30' : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs sm:text-sm text-neutral-900">{title}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      c.present
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                    }`}
                  >
                    {c.present ? 'Present' : 'Absent'}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">{c.explanation}</p>
                <p className="text-xs text-neutral-800 font-medium pt-1">Strategy: {c.prevention_strategy}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StepRecovery({
  scenario,
  detectionResult,
  result,
}: {
  scenario: RandomScenario
  detectionResult: DetectionResponse
  result: RecoveryResponse | null
}) {
  const { processLabels, resourceLabels } = scenario

  if (!detectionResult.deadlock_detected) {
    return (
      <div className="space-y-5">
        <ExplainPanel
          what="Recovery terminates or preempts deadlocked processes to break the circular dependency chain and release locked resources."
          meaning="Because Step 4 detected no deadlock, recovery is unnecessary. All processes can proceed naturally."
        />
        <div className="card p-4 border-neutral-200 text-xs sm:text-sm text-neutral-700">
          ✓ No deadlock detected. Recovery mechanisms are safely disengaged.
        </div>
      </div>
    )
  }

  if (!result) {
    return <p className="text-xs text-neutral-500 italic">Awaiting recovery algorithm output…</p>
  }

  const meaning = explainRecovery(result, detectionResult, processLabels)

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="Recovery terminates or preempts deadlocked processes to break the circular dependency chain and release locked resources."
        meaning={meaning}
      />

      <div className="space-y-3">
        <span className="section-label block">Recovery Outcome</span>
        <div>
          <StatusBadge ok={result.success} okLabel="DEADLOCK RESOLVED" badLabel="RECOVERY FAILED" />
        </div>
        <p className="text-xs sm:text-sm text-neutral-600">{result.message}</p>

        {result.termination_steps.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="section-label block">Termination Actions Executed</span>
            {result.termination_steps.map((ts) => (
              <div key={ts.step} className="card p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold font-mono text-neutral-900">
                    Abort {ts.terminated_process}
                  </span>
                  <span className="font-medium text-neutral-600">
                    {ts.deadlock_resolved ? '✓ Deadlock Resolved' : 'Cycle Continues'}
                  </span>
                </div>
                <p className="text-neutral-500">{ts.reason}</p>
                {ts.resources_freed.length > 0 && (
                  <p className="text-neutral-700 font-mono">
                    Reclaimed:{' '}
                    {ts.resources_freed
                      .map(([rIdx, amt]) => `${resourceLabels[rIdx] ?? `R${rIdx}`}: +${amt}`)
                      .join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <VectorRow
          label="Available Vector After Abort Actions"
          values={result.available_after}
          colLabels={resourceLabels}
        />
      </div>
    </div>
  )
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_TITLES = [
  'Step 1: Synthesized System State',
  'Step 2: Calculated Need Matrix',
  'Step 3: Avoidance Verification (Banker\'s Algorithm)',
  'Step 4: Multi-Instance Deadlock Detection',
  'Step 5: Coffman Conditions Prevention Analysis',
  'Step 6: Deadlock Recovery Execution',
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function AutoSimulation() {
  const [forceDeadlock, setForceDeadlock] = useState(false)
  const [scenario, setScenario] = useState<RandomScenario>(() =>
    generateRandomScenario(false),
  )
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SimResults | null>(null)

  const [activeStep, setActiveStep] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const resultsReady = phase === 'ready' && results !== null
  const hasDeadlock = results?.detectionResult.deadlock_detected ?? false

  const safetyLabel: string | null = results
    ? results.safetyResult.is_safe
      ? 'SAFE'
      : 'UNSAFE'
    : null

  const detectionLabel: string | null = results
    ? results.detectionResult.deadlock_detected
      ? 'DEADLOCKED'
      : 'NO DEADLOCK'
    : null

  const preventionLabel: string | null = results
    ? `${results.preventionResult.conditions_present}/4 conditions`
    : null

  const recoveryLabel: string | null =
    results && results.recoveryResult
      ? results.recoveryResult.success
        ? 'RESOLVED'
        : 'FAILED'
      : null

  const maxStep = hasDeadlock ? 6 : 5

  const generate = useCallback(async () => {
    const sc = generateRandomScenario(forceDeadlock)
    setScenario(sc)
    setResults(null)
    setActiveStep(1)
    setIsPlaying(false)
    setError(null)
    setPhase('loading')

    const { allocation, need, available, request, processLabels, resourceLabels, total } = sc
    const processDefs = makeProcessDefs(processLabels)
    const resourceDefs = makeResourceDefs(resourceLabels, total)

    try {
      const [safetyResult, detectionResult] = await Promise.all([
        postBankerSafety({ allocation, need, available }),
        postDeadlockDetect({ allocation, request, available }),
      ])

      const preventionPromise = postPreventionAnalyze({
        processes: processDefs,
        resources: resourceDefs,
        allocation,
        need,
        available,
        request_matrix: request,
      })

      let recoveryPromise: Promise<RecoveryResponse | null> = Promise.resolve(null)
      if (detectionResult.deadlock_detected && detectionResult.deadlocked_processes.length > 0) {
        const deadlockedPids = detectionResult.deadlocked_processes.map(
          (i) => processLabels[i] ?? `P${i}`,
        )
        recoveryPromise = postRecoveryTerminate({
          processes: processDefs,
          resources: resourceDefs,
          allocation,
          need,
          available,
          deadlocked_pids: deadlockedPids,
          strategy: 'lowest_pid',
        })
      }

      const [preventionResult, recoveryResult] = await Promise.all([
        preventionPromise,
        recoveryPromise,
      ])

      setResults({ safetyResult, detectionResult, preventionResult, recoveryResult })
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [forceDeadlock])

  const canGoTo = useCallback(
    (step: number) => {
      if (!resultsReady) return false
      if (step < 1 || step > 6) return false
      if (step === 6 && !hasDeadlock) return false
      return true
    },
    [resultsReady, hasDeadlock],
  )

  const goTo = useCallback(
    (step: number) => {
      if (canGoTo(step)) setActiveStep(step)
    },
    [canGoTo],
  )

  const goPrev = useCallback(() => {
    goTo(activeStep - 1)
  }, [activeStep, goTo])

  const goNext = useCallback(() => {
    goTo(activeStep + 1)
  }, [activeStep, goTo])

  useEffect(() => {
    if (isPlaying && resultsReady) {
      playTimerRef.current = setInterval(() => {
        setActiveStep((cur) => {
          const next = cur + 1
          if (next > maxStep) {
            setIsPlaying(false)
            return cur
          }
          if (next === 6 && !hasDeadlock) {
            setIsPlaying(false)
            return cur
          }
          return next
        })
      }, 3000)
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [isPlaying, resultsReady, maxStep, hasDeadlock])

  useEffect(() => {
    if (phase !== 'ready') setIsPlaying(false)
  }, [phase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!resultsReady) return
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      )
        return
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resultsReady, goNext, goPrev])

  function renderStepContent() {
    if (phase === 'idle') {
      return (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-neutral-600 font-medium">
            Click "Synthesize Scenario &amp; Run Analysis" to generate an OS scenario and run all algorithms.
          </p>
        </div>
      )
    }
    if (phase === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-neutral-900 border-t-transparent animate-spin" />
          <p className="text-neutral-800 text-xs sm:text-sm font-medium">Running all 4 deadlock algorithms…</p>
          <p className="text-neutral-400 text-xs">Banker's Avoidance &bull; Matrix Detection &bull; Prevention &bull; Recovery</p>
        </div>
      )
    }
    if (phase === 'error' || !results) return null

    switch (activeStep) {
      case 1:
        return <StepScenario scenario={scenario} />
      case 2:
        return <StepNeed scenario={scenario} />
      case 3:
        return <StepAvoidance scenario={scenario} result={results.safetyResult} />
      case 4:
        return <StepDetection scenario={scenario} result={results.detectionResult} />
      case 5:
        return <StepPrevention result={results.preventionResult} />
      case 6:
        return (
          <StepRecovery
            scenario={scenario}
            detectionResult={results.detectionResult}
            result={results.recoveryResult}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="pb-1 border-b border-neutral-200/60">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
          Automated Scenario Simulation
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Synthesizes a randomized OS model and executes all four pillars of deadlock theory in parallel.
        </p>
      </div>

      {/* Controls Card */}
      <SectionCard title="Simulation Controls">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={generate}
              disabled={phase === 'loading'}
              className="btn-primary"
            >
              {phase === 'loading' ? 'Evaluating Models…' : 'Synthesize Scenario & Run Analysis'}
            </button>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceDeadlock}
                onChange={(e) => setForceDeadlock(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
              <span className="text-xs font-medium text-neutral-700">
                Force Deliberate Circular Wait
              </span>
            </label>
          </div>

          {phase !== 'idle' && (
            <button
              onClick={generate}
              disabled={phase === 'loading'}
              className="btn-secondary text-xs"
            >
              Regenerate
            </button>
          )}
        </div>

        {forceDeadlock && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-md mt-3 leading-relaxed">
            Note: Forced mode intentionally introduces a closed dependency cycle between two processes to trigger detection and recovery phases.
          </p>
        )}
      </SectionCard>

      {/* Scenario meta strip */}
      <div className="card px-5 py-3 flex flex-wrap gap-6 text-xs text-neutral-600 bg-neutral-50/70 border-neutral-200/80">
        <span>Processes: <strong className="text-neutral-900 font-mono">{scenario.numProcesses}</strong></span>
        <span>Resource Classes: <strong className="text-neutral-900 font-mono">{scenario.numResources}</strong></span>
        <span>Total Units: <strong className="text-neutral-900 font-mono">[{scenario.total.join(', ')}]</strong></span>
        <span>Mode: <strong className="text-neutral-900">{forceDeadlock ? 'Deliberate Deadlock' : 'Stochastic'}</strong></span>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Summary strip */}
      {resultsReady && results && (
        <SimSummaryStrip
          safetyLabel={safetyLabel!}
          isSafe={results.safetyResult.is_safe}
          detectionLabel={detectionLabel!}
          isDeadlocked={hasDeadlock}
          conditionsPresent={results.preventionResult.conditions_present}
          recoveryLabel={recoveryLabel}
        />
      )}

      {/* Step navigator */}
      {phase !== 'idle' && (
        <SimStepper
          activeStep={activeStep}
          resultsReady={resultsReady}
          hasDeadlock={hasDeadlock}
          safetyLabel={safetyLabel}
          detectionLabel={detectionLabel}
          preventionLabel={preventionLabel}
          recoveryLabel={recoveryLabel}
          onSelect={goTo}
        />
      )}

      {/* Step content panel */}
      {phase !== 'idle' && (
        <SectionCard title={resultsReady ? STEP_TITLES[activeStep - 1] : 'Loading…'}>
          {renderStepContent()}
        </SectionCard>
      )}

      {/* Navigation controls */}
      {resultsReady && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-10">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={activeStep <= 1}
              className="btn-secondary"
            >
              &larr; Previous Step
            </button>
            <button
              onClick={goNext}
              disabled={activeStep >= maxStep}
              className="btn-primary"
            >
              Next Step &rarr;
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!isPlaying ? (
              <button
                onClick={() => {
                  if (activeStep >= maxStep) setActiveStep(1)
                  setIsPlaying(true)
                }}
                className="btn-secondary text-xs"
              >
                &bull; Auto-Advance (3s)
              </button>
            ) : (
              <button
                onClick={() => setIsPlaying(false)}
                className="btn-secondary text-xs text-neutral-900 border-neutral-900"
              >
                Pause Auto-Advance
              </button>
            )}
            <span className="text-xs text-neutral-400 font-mono">
              Step {activeStep} of {maxStep}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
