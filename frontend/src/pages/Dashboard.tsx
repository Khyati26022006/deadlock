import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { postBankerSafety, postDeadlockDetect } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import type { DetectionResponse, SafetyResponse } from '../types'

// ─── Status types ─────────────────────────────────────────────────────────────

type SystemStatus = 'loading' | 'safe' | 'unsafe' | 'deadlocked' | 'error'

interface StatusConfig {
  label: string
  badgeText: string
  dotClass: string
  titleColor: string
  borderClass: string
  description: string
}

const STATUS_CONFIG: Record<SystemStatus, StatusConfig> = {
  loading: {
    label: 'Analysing System State…',
    badgeText: 'Running Check',
    dotClass: 'bg-neutral-400 animate-pulse',
    titleColor: 'text-neutral-900',
    borderClass: 'border-neutral-200',
    description: 'Running Banker’s safety and multi-instance deadlock detection algorithms…',
  },
  safe: {
    label: 'Safe State Confirmed',
    badgeText: 'Guaranteed Safe',
    dotClass: 'bg-emerald-500',
    titleColor: 'text-neutral-900',
    borderClass: 'border-neutral-200',
    description: 'All processes can run to completion. A verified safe execution order exists with no circular wait.',
  },
  unsafe: {
    label: 'Unsafe State Detected',
    badgeText: 'Potential Risk',
    dotClass: 'bg-amber-500',
    titleColor: 'text-neutral-900',
    borderClass: 'border-neutral-200',
    description:
      'The OS cannot guarantee completion if worst-case claims arrive. Deadlock has not occurred yet, but avoidance rules must block risky requests.',
  },
  deadlocked: {
    label: 'Deadlock Detected',
    badgeText: 'Active Deadlock',
    dotClass: 'bg-rose-500',
    titleColor: 'text-neutral-900',
    borderClass: 'border-rose-200 bg-rose-50/20',
    description:
      'Confirmed circular wait. One or more processes are permanently waiting for resources held by each other.',
  },
  error: {
    label: 'Analysis Error',
    badgeText: 'API Unavailable',
    dotClass: 'bg-red-500',
    titleColor: 'text-red-900',
    borderClass: 'border-red-200 bg-red-50/20',
    description: 'Could not contact the backend algorithm server. Please verify the API is running.',
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string
  value: string | number
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className={`card p-4 sm:p-5 flex flex-col justify-between ${highlight ? 'border-neutral-900/40 shadow-xs' : ''}`}>
      <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500">{label}</span>
      <div className="my-1.5">
        <span className="text-2xl sm:text-3xl font-bold font-mono text-neutral-900 tracking-tight">{value}</span>
      </div>
      {sub && <span className="text-xs text-neutral-500 font-medium truncate">{sub}</span>}
    </div>
  )
}

function VectorDisplay({
  label,
  vector,
  resourceIds,
}: {
  label: string
  vector: number[]
  resourceIds: string[]
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3.5">
        <span className="section-label">{label}</span>
        <span className="text-xs text-neutral-400 font-mono">Unallocated system units</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {vector.map((v, j) => (
          <div
            key={j}
            className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/90 rounded-md px-3 py-1.5 shadow-2xs"
          >
            <span className="text-xs font-mono font-bold text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
            <span className="w-px h-3.5 bg-neutral-200" />
            <span className="text-sm font-mono font-bold text-neutral-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SafeSequenceDisplay({
  sequence,
  processIds,
}: {
  sequence: number[]
  processIds: string[]
}) {
  if (sequence.length === 0) return null
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3.5">
        <span className="section-label">Safe Execution Order (Banker's Algorithm)</span>
        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          Guaranteed completion
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {sequence.map((idx, pos) => (
          <div key={pos} className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-neutral-900 text-white rounded-md px-3 py-1.5 text-xs font-mono font-medium shadow-2xs">
              <span className="text-neutral-400 text-[10px]">#{pos + 1}</span>
              <span>{processIds[idx] ?? `P${idx}`}</span>
            </div>
            {pos < sequence.length - 1 && (
              <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DeadlockedProcessList({
  indices,
  processIds,
}: {
  indices: number[]
  processIds: string[]
}) {
  if (indices.length === 0) return null
  return (
    <div className="card border-rose-200 bg-rose-50/20 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
            Confirmed Deadlocked Processes
          </span>
        </div>
        <Link
          to="/recovery"
          className="text-xs font-medium text-rose-700 hover:text-rose-900 underline underline-offset-2"
        >
          Open Recovery Tool &rarr;
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {indices.map((idx) => (
          <span
            key={idx}
            className="bg-white text-rose-800 border border-rose-300 rounded-md px-2.5 py-1 text-xs font-mono font-bold shadow-2xs"
          >
            {processIds[idx] ?? `P${idx}`}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { scenario } = useScenario()

  const [status, setStatus] = useState<SystemStatus>('loading')
  const [safetyResult, setSafetyResult] = useState<SafetyResponse | null>(null)
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage(null)
    setSafetyResult(null)
    setDetectionResult(null)

    async function analyse() {
      try {
        const [safety, detection] = await Promise.all([
          postBankerSafety({
            allocation: scenario.allocation,
            need: scenario.need,
            available: scenario.available,
          }),
          postDeadlockDetect({
            allocation: scenario.allocation,
            request: scenario.need,
            available: scenario.available,
          }),
        ])
        if (cancelled) return
        setSafetyResult(safety)
        setDetectionResult(detection)
        if (detection.deadlock_detected) setStatus('deadlocked')
        else if (safety.is_safe) setStatus('safe')
        else setStatus('unsafe')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : String(err))
      }
    }

    void analyse()
    return () => { cancelled = true }
  }, [scenario])

  const cfg = STATUS_CONFIG[status]
  const deadlockedCount = detectionResult?.deadlocked_processes.length ?? 0

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-neutral-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            System Overview & State Analysis
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Active scenario: <span className="font-semibold text-neutral-900">{scenario.name}</span>
            {' · '}{processIds.length} processes · {resourceIds.length} resource classes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/scenario-builder" className="btn-secondary">
            Configure Matrices
          </Link>
          <Link to="/auto-simulation" className="btn-primary">
            Run Auto Simulation
          </Link>
        </div>
      </div>

      {errorMessage && (
        <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      )}

      {/* System Status Hero Card */}
      <div className={`card p-5 sm:p-6 transition-all ${cfg.borderClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <span className={`w-3.5 h-3.5 rounded-full inline-block ${cfg.dotClass}`} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${cfg.titleColor}`}>
                  {cfg.label}
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                  {cfg.badgeText}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 max-w-2xl leading-relaxed">
                {cfg.description}
              </p>
            </div>
          </div>

          <div className="sm:self-center shrink-0">
            <span className="text-xs font-mono font-medium text-neutral-400 uppercase tracking-wider">
              {status === 'safe' ? 'Pillars Verified' : status === 'deadlocked' ? 'Action Required' : 'Monitored'}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Processes"
          value={scenario.processes.length}
          sub={processIds.slice(0, 4).join(', ') + (processIds.length > 4 ? '…' : '')}
        />
        <StatCard
          label="Resource Types"
          value={scenario.resources.length}
          sub={resourceIds.slice(0, 4).join(', ') + (resourceIds.length > 4 ? '…' : '')}
        />
        <StatCard
          label="Deadlocked"
          value={status === 'loading' ? '—' : deadlockedCount}
          sub={deadlockedCount === 0 ? 'None detected' : `${deadlockedCount} blocked permanently`}
          highlight={deadlockedCount > 0}
        />
        <StatCard
          label="Safe Sequence"
          value={
            status === 'loading'
              ? '—'
              : safetyResult?.is_safe
              ? `${safetyResult.safe_sequence.length} steps`
              : 'None'
          }
          sub={safetyResult?.is_safe ? 'Banker’s sequence valid' : 'Unsafe under max demand'}
        />
      </div>

      {/* Available Resources Vector */}
      <VectorDisplay label="Available Vector" vector={scenario.available} resourceIds={resourceIds} />

      {/* Safe Execution Sequence */}
      {safetyResult?.is_safe && (
        <SafeSequenceDisplay sequence={safetyResult.safe_sequence} processIds={processIds} />
      )}

      {/* Deadlocked Processes */}
      {detectionResult?.deadlock_detected && (
        <DeadlockedProcessList indices={detectionResult.deadlocked_processes} processIds={processIds} />
      )}

      {/* Algorithm Analysis Cards */}
      {(safetyResult || detectionResult) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {safetyResult && (
            <div className="card p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="section-label">Banker's Avoidance Engine</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-md border ${
                    safetyResult.is_safe
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 border-neutral-300'
                  }`}
                >
                  {safetyResult.is_safe ? 'SAFE' : 'UNSAFE'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed pt-1">
                {safetyResult.message}
              </p>
            </div>
          )}

          {detectionResult && (
            <div className="card p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="section-label">Deadlock Detection Engine</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-md border ${
                    detectionResult.deadlock_detected
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-neutral-900 text-white border-neutral-900'
                  }`}
                >
                  {detectionResult.deadlock_detected ? 'CYCLE DETECTED' : 'CLEAR'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed pt-1">
                {detectionResult.message}
              </p>
            </div>
          )}
        </div>
      )}

      {scenario.description && (
        <div className="card p-4 sm:p-5 bg-neutral-50/50">
          <span className="section-label block mb-1">Scenario Documentation</span>
          <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">{scenario.description}</p>
        </div>
      )}
    </div>
  )
}
