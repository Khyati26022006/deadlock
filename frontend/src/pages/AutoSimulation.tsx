/**
 * Auto Simulation page (/auto-simulation)
 *
 * Completely isolated from ScenarioContext — all state is local.
 *
 * Phase-2 enhancements:
 *  • All 4 API calls fire once on generate; results cached in state.
 *  • Clickable step navigator (SimStepper) — jump to any step freely.
 *  • Recovery step greyed-out + tooltip when no deadlock.
 *  • 3-part explanation panel per step (concept / result / interpretation).
 *  • Play All / Pause auto-advance every 3 s.
 *  • Previous / Next buttons + ← → keyboard navigation.
 *  • Summary strip showing all 4 outcomes once results are ready.
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

// ─── Explanation generators (use real data — no hardcoded verdicts) ───────────

function explainAvoidance(r: SafetyResponse, processLabels: string[]): string {
  if (r.is_safe) {
    const seq = r.safe_sequence.map((i) => processLabels[i] ?? `P${i}`)
    if (seq.length === 0) return 'The system is in a safe state.'
    const first = seq[0]
    const rest = seq.slice(1)
    let text = `${first} can finish first because its remaining need fits within the currently available resources.`
    if (rest.length > 0) {
      text += ` After it releases its allocation, ${rest.join(' → ')} can each proceed in turn, confirming the safe sequence ${seq.join(' → ')}.`
    }
    text += ' No deadlock can occur as long as the system stays in this state.'
    return text
  } else {
    return (
      'No safe execution sequence exists for this state. ' +
      'At least one process cannot obtain all the resources it may still need, ' +
      'which means the system is at risk — a future resource request could lead directly into deadlock. ' +
      'This is an unsafe state, not a confirmed deadlock: if no further requests are made the system may still finish, ' +
      'but the Banker\'s Algorithm would deny any new request that keeps the state unsafe.'
    )
  }
}

function explainDetection(r: DetectionResponse, processLabels: string[]): string {
  if (!r.deadlock_detected) {
    const completed = r.completed_processes.map((i) => processLabels[i] ?? `P${i}`)
    let text = 'No circular-wait cycle was found in the current request graph. '
    if (completed.length > 0) {
      text += `All processes — ${completed.join(', ')} — can complete using the resources they are actively waiting for right now. `
    }
    text += 'The system is not deadlocked at this moment.'
    return text
  } else {
    const stuck = r.deadlocked_processes.map((i) => processLabels[i] ?? `P${i}`)
    return (
      `${stuck.join(', ')} ${stuck.length === 1 ? 'is' : 'are'} confirmed deadlocked — ` +
      `${stuck.length === 1 ? 'it holds' : 'they hold'} resources that other deadlocked ` +
      `${stuck.length === 1 ? 'processes need' : 'processes need'}, while simultaneously ` +
      `waiting for resources held by those same processes, forming an unresolvable circular wait. ` +
      `Unlike an unsafe state, this is not a risk — the system is already stuck and cannot ` +
      `progress without external intervention.`
    )
  }
}

function explainPrevention(r: PreventionResponse): string {
  const present = (
    ['mutual_exclusion', 'hold_and_wait', 'no_preemption', 'circular_wait'] as const
  )
    .filter((k) => r[k].present)
    .map((k) =>
      k === 'mutual_exclusion'
        ? 'Mutual Exclusion'
        : k === 'hold_and_wait'
        ? 'Hold-and-Wait'
        : k === 'no_preemption'
        ? 'No Preemption'
        : 'Circular Wait',
    )

  if (present.length === 0) {
    return (
      'None of the four Coffman conditions are present in this scenario, ' +
      'which means deadlock is structurally impossible here. ' +
      'This is the strongest possible prevention outcome.'
    )
  }

  const last = present[present.length - 1]
  const others = present.slice(0, -1)
  const list = others.length > 0 ? `${others.join(', ')} and ${last}` : last

  let text = `${list} ${present.length === 1 ? 'is' : 'are'} present in this scenario. `

  if (present.includes('Circular Wait')) {
    text +=
      'Circular Wait is the most critical condition — eliminating it alone (e.g. by imposing a total ordering on resource types) is sufficient to prevent deadlock regardless of the other conditions. '
  } else if (present.includes('Hold-and-Wait')) {
    text +=
      'Breaking Hold-and-Wait (e.g. requiring processes to request all resources upfront) would eliminate the risk, since a process that holds nothing cannot be part of a cycle. '
  }

  text +=
    `Removing any single one of the ${present.length} present condition${present.length > 1 ? 's' : ''} ` +
    'by design or policy would make deadlock impossible in this configuration.'

  return text
}

function explainRecovery(
  r: RecoveryResponse,
  detectionResult: DetectionResponse,
  processLabels: string[],
): string {
  const terminated = r.processes_terminated
  const wasstuck = detectionResult.deadlocked_processes.map((i) => processLabels[i] ?? `P${i}`)

  if (r.success) {
    const steps = r.termination_steps.length
    let text = `The deadlock involving ${wasstuck.join(', ')} was resolved by terminating `
    if (terminated.length === 1) {
      text += `${terminated[0]}`
    } else {
      text += `${terminated.slice(0, -1).join(', ')} and ${terminated[terminated.length - 1]}`
    }
    text += ` in ${steps} step${steps !== 1 ? 's' : ''}. `
    text +=
      `Each terminated process released its allocated resources back to the available pool, ` +
      `allowing the remaining processes to proceed. `
    text += `The system can now make progress.`
    return text
  } else {
    return (
      `Recovery was attempted for the deadlocked processes (${wasstuck.join(', ')}) ` +
      `but could not fully resolve the situation. ` +
      `This may indicate insufficient resources even after termination, ` +
      `or a scenario where all processes must be terminated.`
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
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex gap-3 flex-wrap">
        {values.map((v, j) => (
          <div key={j} className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold text-white font-mono">{v}</span>
            <span className="text-xs text-gray-600">{colLabels[j]}</span>
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
      className={[
        'inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm',
        ok
          ? 'bg-green-900 border border-green-500 text-green-300'
          : isWarn
          ? 'bg-yellow-900 border border-yellow-500 text-yellow-300'
          : 'bg-red-900 border border-red-500 text-red-300',
      ].join(' ')}
    >
      <span>{ok ? '✅' : isWarn ? '⚠️' : '❌'}</span>
      <span>{ok ? okLabel : isWarn ? (warnLabel ?? badLabel) : badLabel}</span>
    </div>
  )
}

/** 3-part explanation panel wrapper */
function ExplainPanel({
  what,
  meaning,
}: {
  what: string
  meaning: string
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 divide-y divide-gray-700 text-sm">
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">What this step does</p>
        <p className="text-gray-300 leading-relaxed">{what}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">What this means</p>
        <p className="text-gray-300 leading-relaxed">{meaning}</p>
      </div>
    </div>
  )
}

// ─── Step content panels ─────────────────────────────────────────────────────

function StepScenario({
  scenario,
}: {
  scenario: RandomScenario
}) {
  const { allocation, maximum, available, processLabels, resourceLabels } = scenario
  return (
    <div className="space-y-5">
      <ExplainPanel
        what="This is the randomly generated resource-allocation state — the starting point for every analysis that follows. Each process has a maximum demand it will ever make, plus the resources it currently holds (allocation). The system also has some resources that are not currently held by any process (available)."
        meaning="These numbers are the raw inputs to all subsequent algorithms. The allocation and maximum matrices together let us derive what each process still needs, which the Banker's Algorithm uses to judge safety. The available vector is what the OS could hand out right now without asking any process to release anything."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Allocation</p>
          <MatrixEditor matrix={allocation} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Maximum</p>
          <MatrixEditor matrix={maximum} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
      </div>
      <VectorRow label="Available" values={available} colLabels={resourceLabels} />
    </div>
  )
}

function StepNeed({ scenario }: { scenario: RandomScenario }) {
  const { need, allocation, maximum, processLabels, resourceLabels } = scenario
  return (
    <div className="space-y-5">
      <ExplainPanel
        what="The Need matrix tells us how many more resources each process might still request before it finishes. It is computed as Need = Maximum − Allocation. This is the information the Banker's Algorithm uses to decide whether a state is safe."
        meaning="A high Need value means a process could still demand a lot more — it is a bigger risk to the system's safety. A Need of zero in every column means the process is effectively done and will release its allocation back shortly. The Banker's Algorithm checks whether there is an order in which every process can satisfy its full Need using only the current Available resources plus whatever earlier processes release."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Need = Maximum − Allocation</p>
          <MatrixEditor matrix={need} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Verification (Allocation + Need = Maximum)</p>
          <MatrixEditor matrix={allocation} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
          <p className="text-xs text-gray-600 mt-1">+ Allocation above = Maximum →</p>
          <MatrixEditor matrix={maximum} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
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
  const { processLabels, resourceLabels } = scenario
  const meaning = explainAvoidance(result, processLabels)

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="The Banker's Safety Algorithm checks whether there exists at least one safe execution sequence — an ordering in which every process can eventually obtain all the resources it needs and finish. It simulates granting resources to each process in turn, using a working copy of the available pool. If no such sequence exists the state is unsafe."
        meaning={meaning}
      />

      {/* Result */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">Result</p>
        <StatusBadge ok={result.is_safe} okLabel="SAFE" badLabel="UNSAFE" warn warnLabel="UNSAFE" />
        <p className="text-sm text-gray-400">{result.message}</p>
        {result.is_safe && result.safe_sequence.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Safe execution sequence</p>
            <div className="flex flex-wrap items-center gap-2">
              {result.safe_sequence.map((idx, pos) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="bg-green-800 text-green-100 rounded-full px-3 py-0.5 text-sm font-medium">
                    {processLabels[idx] ?? `P${idx}`}
                  </span>
                  {pos < result.safe_sequence.length - 1 && (
                    <span className="text-gray-500">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Trace summary */}
        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Show algorithm trace ({result.steps.length} iterations)
          </summary>
          <div className="mt-2 space-y-1 pl-4 border-l border-gray-700">
            {result.steps.map((s, i) => (
              <div key={i} className="flex gap-2 items-start text-xs">
                <span className={s.process_qualified ? 'text-green-400' : 'text-gray-600'}>●</span>
                <span className="text-gray-500">#{s.iteration}</span>
                <span className={s.process_qualified ? 'text-gray-300' : 'text-gray-600'}>
                  {processLabels[s.process_index] ?? `P${s.process_index}`}
                </span>
                <span className={s.process_qualified ? 'text-green-500' : 'text-gray-600'}>
                  {s.process_qualified ? 'qualified' : 'skipped'}
                </span>
                <span className="text-gray-600 flex-1">{s.note}</span>
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
        what="Deadlock detection uses the current Request matrix — what each process is actively waiting for right now — together with the Available resources to find any circular-wait cycle. Unlike the Banker's Algorithm, it does not assume a worst-case maximum demand; it checks the actual present state of the system."
        meaning={meaning}
      />

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">Result</p>
        <StatusBadge
          ok={!result.deadlock_detected}
          okLabel="NO DEADLOCK"
          badLabel="DEADLOCKED"
        />
        <p className="text-sm text-gray-400">{result.message}</p>

        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Request matrix (input)</p>
          <MatrixEditor matrix={request} rowLabels={processLabels} colLabels={resourceLabels} readOnly />
        </div>

        {result.deadlock_detected && result.deadlocked_processes.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Deadlocked processes</p>
            <div className="flex flex-wrap gap-2">
              {result.deadlocked_processes.map((idx) => (
                <span key={idx} className="bg-red-900 text-red-200 border border-red-700 rounded-full px-3 py-0.5 text-sm font-medium">
                  {processLabels[idx] ?? `P${idx}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {!result.deadlock_detected && result.completed_processes.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">All processes can complete in order</p>
            <div className="flex flex-wrap items-center gap-2">
              {result.completed_processes.map((idx, pos) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="bg-green-800 text-green-100 rounded-full px-3 py-0.5 text-sm font-medium">
                    {processLabels[idx] ?? `P${idx}`}
                  </span>
                  {pos < result.completed_processes.length - 1 && (
                    <span className="text-gray-500">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Show detection trace ({result.steps.length} iterations)
          </summary>
          <div className="mt-2 space-y-1 pl-4 border-l border-gray-700">
            {result.steps.map((s, i) => (
              <div key={i} className="flex gap-2 items-start text-xs">
                <span className={s.process_qualified ? 'text-green-400' : 'text-gray-600'}>●</span>
                <span className="text-gray-500">#{s.iteration}</span>
                <span className={s.process_qualified ? 'text-gray-300' : 'text-gray-600'}>
                  {processLabels[s.process_index] ?? `P${s.process_index}`}
                </span>
                <span className={s.process_qualified ? 'text-green-500' : 'text-gray-600'}>
                  {s.process_qualified ? 'can complete' : 'skipped'}
                </span>
                <span className="text-gray-600 flex-1">{s.note}</span>
              </div>
            ))}
          </div>
        </details>
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
        what="Prevention analyzes the four Coffman conditions — the necessary conditions for deadlock to occur. All four must be present simultaneously for deadlock to be possible. If any single one can be eliminated by policy or system design, deadlock becomes structurally impossible regardless of future resource requests."
        meaning={meaning}
      />

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">Result</p>
        <div className="text-sm text-gray-300">
          <span className="font-semibold text-white">{result.conditions_present}</span> of 4 conditions present.{' '}
          <span className="text-gray-400">{result.summary}</span>
        </div>

        <div className="space-y-3">
          {conditions.map(([key, title]) => {
            const c = result[key]
            return (
              <div
                key={key}
                className={[
                  'rounded-lg border p-4 space-y-1.5',
                  c.present
                    ? 'border-red-700 bg-red-950/50'
                    : 'border-green-800 bg-green-950/30',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{c.present ? '🔴' : '🟢'}</span>
                  <span className="font-semibold text-sm text-white">{title}</span>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      c.present ? 'bg-red-800 text-red-200' : 'bg-green-800 text-green-200'
                    }`}
                  >
                    {c.present ? 'PRESENT' : 'NOT PRESENT'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{c.explanation}</p>
                <p className="text-xs text-blue-400">Prevention: {c.prevention_strategy}</p>
                {c.affected_processes.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Affected: {c.affected_processes.join(', ')}
                  </p>
                )}
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
          what="When a deadlock is confirmed, recovery breaks the cycle by terminating processes one at a time using the lowest_pid strategy — always picking the process with the smallest ID first. Each terminated process releases its resources back to the available pool, and the algorithm checks whether the deadlock has been resolved after each step."
          meaning="Since detection found no deadlock in this scenario, recovery is not needed. All processes can already complete using the resources they are currently waiting for, so no intervention is required. Recovery would only be triggered if the detection algorithm confirmed a circular-wait cycle."
        />
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <span>✅</span>
          <span>No deadlock was detected in Step 4 — recovery is not needed.</span>
        </div>
      </div>
    )
  }

  if (!result) {
    return <p className="text-xs text-gray-600 italic">Awaiting recovery result…</p>
  }

  const meaning = explainRecovery(result, detectionResult, processLabels)

  return (
    <div className="space-y-5">
      <ExplainPanel
        what="When a deadlock is confirmed, recovery breaks the cycle by terminating processes one at a time using the lowest_pid strategy — always picking the process with the smallest ID first. Each terminated process releases its resources back to the available pool, and the algorithm checks whether the deadlock has been resolved after each step."
        meaning={meaning}
      />

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">Result</p>
        <StatusBadge ok={result.success} okLabel="DEADLOCK RESOLVED" badLabel="RECOVERY FAILED" />
        <p className="text-sm text-gray-400">{result.message}</p>

        {result.termination_steps.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Termination steps</p>
            <div className="space-y-2">
              {result.termination_steps.map((ts) => (
                <div
                  key={ts.step}
                  className={[
                    'rounded-lg border px-4 py-3 text-sm space-y-1',
                    ts.deadlock_resolved
                      ? 'border-green-700 bg-green-950/40'
                      : 'border-yellow-700 bg-yellow-950/20',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-gray-500 text-xs">#{ts.step}</span>
                    <span className="font-semibold text-white">Terminate {ts.terminated_process}</span>
                    {ts.deadlock_resolved && (
                      <span className="text-xs bg-green-800 text-green-200 rounded-full px-2 py-0.5">
                        Deadlock resolved ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{ts.reason}</p>
                  {ts.resources_freed.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Resources freed:{' '}
                      {ts.resources_freed
                        .map(([rIdx, amt]) => `${resourceLabels[rIdx] ?? `R${rIdx}`}×${amt}`)
                        .join(', ')}
                    </p>
                  )}
                  {ts.remaining_deadlocked.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Still deadlocked: {ts.remaining_deadlocked.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <VectorRow
          label="Available after recovery"
          values={result.available_after}
          colLabels={resourceLabels}
        />
        <p className="text-xs text-gray-500">
          Recovery cost estimate:{' '}
          <span className="text-white font-bold">{result.cost_estimate}</span>
        </p>
      </div>
    </div>
  )
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_TITLES = [
  'Step 1 — Generated Scenario',
  'Step 2 — Need Matrix',
  'Step 3 — Deadlock Avoidance (Banker\'s Algorithm)',
  'Step 4 — Deadlock Detection',
  'Step 5 — Deadlock Prevention (Coffman Conditions)',
  'Step 6 — Deadlock Recovery',
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

  // Active step is independent of loading — once results exist, navigate freely
  const [activeStep, setActiveStep] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

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

  // ── Generate — fires all API calls, caches results ────────────────────────

  const generate = useCallback(async () => {
    const sc = generateRandomScenario(forceDeadlock)
    setScenario(sc)
    setResults(null)
    setActiveStep(1)
    setIsPlaying(false)
    setError(null)
    setPhase('loading')

    const { allocation, maximum: _max, need, available, request, processLabels, resourceLabels, total } = sc
    const processDefs = makeProcessDefs(processLabels)
    const resourceDefs = makeResourceDefs(resourceLabels, total)

    try {
      // Fire safety + detection in parallel (no dependency between them)
      const [safetyResult, detectionResult] = await Promise.all([
        postBankerSafety({ allocation, need, available }),
        postDeadlockDetect({ allocation, request, available }),
      ])

      // Prevention can run in parallel too; recovery depends on detection
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

  // ── Navigation ─────────────────────────────────────────────────────────────

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

  const goNext = useCallback(() => {
    const next = activeStep + 1
    if (canGoTo(next)) setActiveStep(next)
    else if (next > maxStep) {
      // wrap-around when playing
      setActiveStep(1)
    }
  }, [activeStep, canGoTo, maxStep])

  const goPrev = useCallback(() => {
    const prev = activeStep - 1
    if (canGoTo(prev)) setActiveStep(prev)
  }, [activeStep, canGoTo])

  // ── Play All ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isPlaying && resultsReady) {
      playTimerRef.current = setInterval(() => {
        setActiveStep((cur) => {
          const next = cur + 1
          // stop at maxStep
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

  // Stop play when regenerating
  useEffect(() => {
    if (phase !== 'ready') setIsPlaying(false)
  }, [phase])

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!resultsReady) return
      // Don't steal keys while user is typing in an input
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

  // ── Render current step content ────────────────────────────────────────────

  function renderStepContent() {
    if (phase === 'idle') return null
    if (phase === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Running all analyses…</p>
          <p className="text-gray-600 text-xs">Banker's safety · Deadlock detection · Prevention · Recovery</p>
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

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">🤖 Auto Simulation</h1>
        <p className="text-gray-400 text-sm mt-1">
          Generates a random resource-allocation scenario and runs every deadlock
          analysis algorithm at once. Click any step to jump directly to it.
        </p>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <SectionCard title="Controls">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          {/* Force deadlock toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={forceDeadlock}
                onChange={(e) => setForceDeadlock(e.target.checked)}
              />
              <div className="w-10 h-5 rounded-full bg-gray-700 peer-checked:bg-red-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              Force a deadlock scenario
            </span>
            {forceDeadlock && (
              <span className="text-xs bg-red-900 text-red-300 border border-red-700 rounded-full px-2 py-0.5 font-medium">
                ON
              </span>
            )}
          </label>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={phase === 'loading'}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            🎲 Generate Random Scenario
          </button>

          {/* Start Over */}
          {phase !== 'idle' && (
            <button
              onClick={generate}
              disabled={phase === 'loading'}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
            >
              ↩ Start Over
            </button>
          )}
        </div>

        {forceDeadlock && (
          <p className="text-xs text-red-400 mt-2">
            ⚠️ The next generated scenario will contain a deliberate circular-wait between two
            processes — Detection will always find a deadlock.
          </p>
        )}
      </SectionCard>

      {/* ── Scenario summary bar ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-3 flex flex-wrap gap-6 text-sm">
        <span className="text-gray-400">
          Processes: <span className="text-white font-bold">{scenario.numProcesses}</span>
        </span>
        <span className="text-gray-400">
          Resource types: <span className="text-white font-bold">{scenario.numResources}</span>
        </span>
        <span className="text-gray-400">
          Total instances:{' '}
          <span className="text-white font-bold font-mono">[{scenario.total.join(', ')}]</span>
        </span>
        <span className="text-gray-400">
          Mode:{' '}
          <span className={forceDeadlock ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
            {forceDeadlock ? 'Forced Deadlock' : 'Random'}
          </span>
        </span>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────────────────── */}
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      {/* ── Summary strip (once results ready) ────────────────────────────── */}
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

      {/* ── Step navigator ──────────────────────────────────────────────────── */}
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

      {/* ── Step content panel ──────────────────────────────────────────────── */}
      {phase !== 'idle' && (
        <div
          /* Smooth fade between steps */
          key={`step-${activeStep}-${phase}`}
          style={{ animation: 'fadeSlideIn 0.25s ease' }}
        >
          <SectionCard title={resultsReady ? STEP_TITLES[activeStep - 1] : 'Loading…'}>
            {renderStepContent()}
          </SectionCard>
        </div>
      )}

      {/* ── Navigation controls ─────────────────────────────────────────────── */}
      {resultsReady && (
        <div className="flex flex-wrap items-center gap-3 pb-10">
          {/* Previous */}
          <button
            onClick={goPrev}
            disabled={activeStep <= 1}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            ← Previous
          </button>

          {/* Next */}
          <button
            onClick={goNext}
            disabled={activeStep >= maxStep}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            Next →
          </button>

          {/* Play All / Pause */}
          {!isPlaying ? (
            <button
              onClick={() => {
                if (activeStep >= maxStep) setActiveStep(1)
                setIsPlaying(true)
              }}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              ▶ Play All
            </button>
          ) : (
            <button
              onClick={() => setIsPlaying(false)}
              className="bg-gray-800 hover:bg-gray-700 border border-indigo-500 text-indigo-300 font-semibold px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              ⏸ Pause
            </button>
          )}

          <span className="text-xs text-gray-600 ml-1">
            Step {activeStep} of {maxStep} · ← → keys also work
          </span>

          {/* Start Over on the right */}
          <button
            onClick={generate}
            className="ml-auto bg-gray-700 hover:bg-gray-600 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            ↩ Start Over
          </button>
        </div>
      )}

      {/* ── Fade animation ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
