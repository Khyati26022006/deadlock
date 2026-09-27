/**
 * Deadlock Avoidance page (/avoidance)
 *
 * Two independent sections, both using the active scenario from context:
 *
 * 1. Safety Check — calls POST /api/banker/safety
 *    Shows SAFE / UNSAFE, the safe execution sequence, and the step trace.
 *
 * 2. Resource Request — lets the user pick a process and enter a request
 *    vector, then calls POST /api/banker/request.
 *    Shows GRANTED / DENIED with reason, the updated state if granted,
 *    and the safety result of the hypothetical state.
 */

import { useEffect, useState } from 'react'
import { postBankerRequest, postBankerSafety } from '../api/client'
import { useScenario } from '../context/ScenarioContext'
import ErrorBanner from '../components/ErrorBanner'
import SectionCard from '../components/SectionCard'
import StepTrace from '../components/StepTrace'
import VectorEditor from '../components/VectorEditor'
import type { ResourceRequestResponse, SafetyResponse, Vector } from '../types'

export default function Avoidance() {
  const { scenario } = useScenario()

  const np = scenario.processes.length
  const nr = scenario.resources.length
  const processIds = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  // ── Section 1: Safety Check ────────────────────────────────────────────────

  const [safetyResult, setSafetyResult] = useState<SafetyResponse | null>(null)
  const [safetyLoading, setSafetyLoading] = useState(false)
  const [safetyError, setSafetyError] = useState<string | null>(null)

  // Re-clear results when the scenario changes
  useEffect(() => {
    setSafetyResult(null)
    setSafetyError(null)
    setRequestResult(null)
    setRequestError(null)
  }, [scenario])

  async function runSafetyCheck() {
    setSafetyLoading(true)
    setSafetyError(null)
    setSafetyResult(null)
    try {
      const res = await postBankerSafety({
        allocation: scenario.allocation,
        need: scenario.need,
        available: scenario.available,
      })
      setSafetyResult(res)
    } catch (err) {
      setSafetyError(err instanceof Error ? err.message : String(err))
    } finally {
      setSafetyLoading(false)
    }
  }

  // ── Section 2: Resource Request ────────────────────────────────────────────

  const [selectedProcess, setSelectedProcess] = useState(0)
  const [requestVec, setRequestVec] = useState<Vector>(() => Array(nr).fill(0))

  // Keep request vector sized to current resource count
  useEffect(() => {
    setRequestVec((prev) =>
      Array.from({ length: nr }, (_, i) => prev[i] ?? 0),
    )
  }, [nr])

  const [requestResult, setRequestResult] = useState<ResourceRequestResponse | null>(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  async function runRequest() {
    setRequestLoading(true)
    setRequestError(null)
    setRequestResult(null)
    try {
      const res = await postBankerRequest({
        process_index: selectedProcess,
        request: requestVec,
        allocation: scenario.allocation,
        need: scenario.need,
        available: scenario.available,
      })
      setRequestResult(res)
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err))
    } finally {
      setRequestLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Deadlock Avoidance</h1>
        <p className="text-gray-400 text-sm mt-1">
          Scenario: <span className="text-white font-medium">{scenario.name}</span>
          {' · '}
          {np} processes · {nr} resource types
        </p>
      </div>

      {/* ── Safety Check ─────────────────────────────────────────────────── */}
      <SectionCard title="Safety Check  (Banker's Algorithm)">
        <p className="text-xs text-gray-500 -mt-2 mb-2">
          Determines whether the current allocation state has a safe execution sequence —
          i.e. all processes can complete without deadlock.
        </p>

        <button
          onClick={runSafetyCheck}
          disabled={safetyLoading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
        >
          {safetyLoading ? 'Running…' : '🔒 Run Safety Check'}
        </button>

        {safetyError && (
          <ErrorBanner message={safetyError} onDismiss={() => setSafetyError(null)} />
        )}

        {safetyResult && (
          <div className="space-y-4 mt-2">
            {/* Status banner */}
            <div
              className={[
                'rounded-2xl border-2 p-5 flex items-center gap-4',
                safetyResult.is_safe
                  ? 'bg-green-950 border-green-500'
                  : 'bg-yellow-950 border-yellow-500',
              ].join(' ')}
            >
              <span className="text-4xl">{safetyResult.is_safe ? '✅' : '⚠️'}</span>
              <div>
                <h3
                  className={`text-xl font-bold ${safetyResult.is_safe ? 'text-green-300' : 'text-yellow-300'}`}
                >
                  {safetyResult.is_safe ? 'SAFE' : 'UNSAFE'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">{safetyResult.message}</p>
              </div>
            </div>

            {/* Safe sequence */}
            {safetyResult.is_safe && safetyResult.safe_sequence.length > 0 && (
              <SectionCard title="Safe Execution Sequence">
                <div className="flex flex-wrap items-center gap-2">
                  {safetyResult.safe_sequence.map((idx, pos) => (
                    <div key={pos} className="flex items-center gap-2">
                      <span className="bg-green-800 text-green-100 rounded-full px-4 py-1 text-sm font-medium">
                        {processIds[idx] ?? `P${idx}`}
                      </span>
                      {pos < safetyResult.safe_sequence.length - 1 && (
                        <span className="text-gray-500">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Work final */}
            <SectionCard title="Work Vector (final)">
              <div className="flex gap-4 flex-wrap">
                {safetyResult.work_final.map((v, j) => (
                  <div key={j} className="flex flex-col items-center gap-1">
                    <span className="text-base font-bold text-white">{v}</span>
                    <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Step trace */}
            <StepTrace steps={safetyResult.steps} processIds={processIds} />
          </div>
        )}
      </SectionCard>

      {/* ── Resource Request ──────────────────────────────────────────────── */}
      <SectionCard title="Request Resources">
        <p className="text-xs text-gray-500 -mt-2 mb-4">
          Attempt a resource request on behalf of a process. The Banker's Algorithm checks
          whether granting it keeps the system in a safe state.
        </p>

        {/* Process selector */}
        <div className="space-y-1 mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Select process</p>
          <div className="flex flex-wrap gap-2">
            {scenario.processes.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelectedProcess(i); setRequestResult(null); setRequestError(null) }}
                className={[
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  selectedProcess === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white',
                ].join(' ')}
              >
                {p.id} – {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Request vector */}
        <SectionCard title={`Request amounts for ${processIds[selectedProcess] ?? `P${selectedProcess}`}`}>
          <p className="text-xs text-gray-500 mb-3">
            How many additional instances of each resource this process is requesting right now.
            Must not exceed its remaining Need.
          </p>
          <VectorEditor
            vector={requestVec}
            onChange={setRequestVec}
            colLabels={resourceIds}
          />

          {/* Need reference for selected process */}
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">
              Need (max remaining) for {processIds[selectedProcess]}:
            </p>
            <div className="flex gap-4 flex-wrap">
              {scenario.need[selectedProcess]?.map((v, j) => (
                <div key={j} className="flex flex-col items-center gap-1">
                  <span className="text-sm font-bold text-gray-300">{v}</span>
                  <span className="text-xs text-gray-600">{resourceIds[j] ?? `R${j}`}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setRequestVec(Array(nr).fill(0))}
            className="text-xs text-gray-500 hover:text-gray-300 mt-2 transition-colors"
          >
            Reset to all zeros
          </button>
        </SectionCard>

        {/* Submit button */}
        <button
          onClick={runRequest}
          disabled={requestLoading}
          className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {requestLoading ? 'Checking…' : '📨 Submit Request'}
        </button>

        {requestError && (
          <ErrorBanner message={requestError} onDismiss={() => setRequestError(null)} />
        )}

        {/* Request result */}
        {requestResult && (
          <div className="space-y-4 mt-2">
            {/* GRANTED / DENIED banner */}
            <div
              className={[
                'rounded-2xl border-2 p-5 flex items-center gap-4',
                requestResult.granted
                  ? 'bg-green-950 border-green-500'
                  : 'bg-red-950 border-red-500',
              ].join(' ')}
            >
              <span className="text-4xl">{requestResult.granted ? '✅' : '❌'}</span>
              <div>
                <h3
                  className={`text-xl font-bold ${requestResult.granted ? 'text-green-300' : 'text-red-300'}`}
                >
                  {requestResult.granted ? 'GRANTED' : 'DENIED'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">{requestResult.reason}</p>
              </div>
            </div>

            {/* Updated state (if granted) */}
            {requestResult.granted && (
              <SectionCard title="Updated State After Grant">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">New Available</p>
                    <div className="flex gap-4 flex-wrap">
                      {requestResult.available.map((v, j) => (
                        <div key={j} className="flex flex-col items-center gap-1">
                          <span className="text-base font-bold text-white">{v}</span>
                          <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      New Allocation for {processIds[selectedProcess]}
                    </p>
                    <div className="flex gap-4 flex-wrap">
                      {requestResult.allocation[selectedProcess]?.map((v, j) => (
                        <div key={j} className="flex flex-col items-center gap-1">
                          <span className="text-base font-bold text-white">{v}</span>
                          <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      New Need for {processIds[selectedProcess]}
                    </p>
                    <div className="flex gap-4 flex-wrap">
                      {requestResult.need[selectedProcess]?.map((v, j) => (
                        <div key={j} className="flex flex-col items-center gap-1">
                          <span className="text-base font-bold text-white">{v}</span>
                          <span className="text-xs text-gray-500">{resourceIds[j] ?? `R${j}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Safety result of the hypothetical state */}
            {requestResult.safety && (
              <>
                <SectionCard
                  title={`Hypothetical State — ${requestResult.safety.is_safe ? 'SAFE ✅' : 'UNSAFE ⚠️'}`}
                >
                  <p className="text-sm text-gray-400">{requestResult.safety.message}</p>
                  {requestResult.safety.is_safe && requestResult.safety.safe_sequence.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {requestResult.safety.safe_sequence.map((idx, pos) => (
                        <div key={pos} className="flex items-center gap-2">
                          <span className="bg-green-800 text-green-100 rounded-full px-3 py-0.5 text-sm font-medium">
                            {processIds[idx] ?? `P${idx}`}
                          </span>
                          {pos < requestResult.safety!.safe_sequence.length - 1 && (
                            <span className="text-gray-500">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
                <StepTrace steps={requestResult.safety.steps} processIds={processIds} />
              </>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
