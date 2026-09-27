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
  icon: string
  bg: string
  border: string
  text: string
  badge: string
  description: string
}

const STATUS_CONFIG: Record<SystemStatus, StatusConfig> = {
  loading: {
    label: 'Analysing…',
    icon: '⏳',
    bg: 'bg-gray-800',
    border: 'border-gray-600',
    text: 'text-gray-300',
    badge: 'bg-gray-700 text-gray-300',
    description: 'Calling backend algorithms…',
  },
  safe: {
    label: 'SAFE',
    icon: '✅',
    bg: 'bg-green-950',
    border: 'border-green-500',
    text: 'text-green-300',
    badge: 'bg-green-700 text-green-100',
    description: 'All processes can complete. A safe execution sequence exists.',
  },
  unsafe: {
    label: 'UNSAFE',
    icon: '⚠️',
    bg: 'bg-yellow-950',
    border: 'border-yellow-500',
    text: 'text-yellow-300',
    badge: 'bg-yellow-700 text-yellow-100',
    description:
      'The system cannot guarantee all processes will complete — deadlock is possible if worst-case requests arrive. No deadlock has occurred yet.',
  },
  deadlocked: {
    label: 'DEADLOCKED',
    icon: '🔴',
    bg: 'bg-red-950',
    border: 'border-red-500',
    text: 'text-red-300',
    badge: 'bg-red-700 text-red-100',
    description:
      'Confirmed deadlock. One or more processes are permanently blocked in a circular wait.',
  },
  error: {
    label: 'Error',
    icon: '❌',
    bg: 'bg-gray-900',
    border: 'border-red-700',
    text: 'text-red-400',
    badge: 'bg-red-900 text-red-300',
    description: 'An error occurred while contacting the backend.',
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 flex flex-col gap-1 border border-gray-700">
      <span className="text-xs uppercase tracking-widest text-gray-500">{label}</span>
      <span className="text-3xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function VectorDisplay({ label, vector, resourceIds }: {
  label: string; vector: number[]; resourceIds: string[]
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <span className="text-xs uppercase tracking-widest text-gray-500 block mb-3">{label}</span>
      <div className="flex flex-wrap gap-4">
        {vector.map((v, j) => (
          <div key={j} className="flex flex-col items-center gap-1">
            <span className="text-lg font-bold text-white">{v}</span>
            <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SafeSequenceDisplay({ sequence, processIds }: {
  sequence: number[]; processIds: string[]
}) {
  if (sequence.length === 0) return null
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <span className="text-xs uppercase tracking-widest text-gray-500 block mb-3">
        Safe Execution Sequence
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {sequence.map((idx, pos) => (
          <div key={pos} className="flex items-center gap-2">
            <span className="bg-green-800 text-green-100 rounded-full px-3 py-1 text-sm font-medium">
              {processIds[idx] ?? `P${idx}`}
            </span>
            {pos < sequence.length - 1 && <span className="text-gray-500">→</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function DeadlockedProcessList({ indices, processIds }: {
  indices: number[]; processIds: string[]
}) {
  if (indices.length === 0) return null
  return (
    <div className="bg-red-950 rounded-xl p-5 border border-red-700">
      <span className="text-xs uppercase tracking-widest text-red-400 block mb-3">
        Deadlocked Processes
      </span>
      <div className="flex flex-wrap gap-2">
        {indices.map((idx) => (
          <span key={idx} className="bg-red-800 text-red-100 rounded-full px-3 py-1 text-sm font-medium">
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
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Scenario: <span className="text-white font-medium">{scenario.name}</span>
          </p>
        </div>
        <Link
          to="/scenario-builder"
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-gray-300 hover:text-white transition-colors"
        >
          Edit Scenario →
        </Link>
      </div>

      {/* Status indicator */}
      <div className={`rounded-2xl border-2 p-6 ${cfg.bg} ${cfg.border} transition-all`}>
        <div className="flex items-center gap-4">
          <span className="text-4xl" role="img" aria-label={cfg.label}>
            {status === 'loading' ? <span className="inline-block animate-spin">⏳</span> : cfg.icon}
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h2 className={`text-2xl font-bold ${cfg.text}`}>{cfg.label}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                System State
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1 max-w-xl">{cfg.description}</p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Processes"
          value={scenario.processes.length}
          sub={processIds.slice(0, 3).join(', ') + (processIds.length > 3 ? '…' : '')}
        />
        <StatCard
          label="Resource Types"
          value={scenario.resources.length}
          sub={resourceIds.slice(0, 3).join(', ') + (resourceIds.length > 3 ? '…' : '')}
        />
        <StatCard
          label="Deadlocked"
          value={status === 'loading' ? '…' : deadlockedCount}
          sub={deadlockedCount === 0 ? 'None' : `${deadlockedCount} process${deadlockedCount > 1 ? 'es' : ''}`}
        />
        <StatCard
          label="Safe Sequence"
          value={status === 'loading' ? '…' : (safetyResult?.safe_sequence.length ? safetyResult.safe_sequence.length + ' steps' : 'None')}
          sub={safetyResult?.is_safe ? 'Banker\u2019s guarantee' : 'Not available'}
        />
      </div>

      <VectorDisplay label="Available Resources" vector={scenario.available} resourceIds={resourceIds} />

      {safetyResult?.is_safe && (
        <SafeSequenceDisplay sequence={safetyResult.safe_sequence} processIds={processIds} />
      )}

      {detectionResult?.deadlock_detected && (
        <DeadlockedProcessList indices={detectionResult.deadlocked_processes} processIds={processIds} />
      )}

      {(safetyResult || detectionResult) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safetyResult && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <span className="text-xs uppercase tracking-widest text-gray-500 block mb-2">Banker's Algorithm</span>
              <p className="text-sm text-gray-300">{safetyResult.message}</p>
            </div>
          )}
          {detectionResult && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <span className="text-xs uppercase tracking-widest text-gray-500 block mb-2">Deadlock Detection</span>
              <p className="text-sm text-gray-300">{detectionResult.message}</p>
            </div>
          )}
        </div>
      )}

      {scenario.description && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-sm text-gray-400">
          <span className="text-xs uppercase tracking-widest text-gray-500 block mb-1">Scenario Notes</span>
          {scenario.description}
        </div>
      )}
    </div>
  )
}
