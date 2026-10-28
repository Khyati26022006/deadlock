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
  const processIds  = scenario.processes.map((p) => p.id)
  const resourceIds = scenario.resources.map((r) => r.id)

  const [safetyResult, setSafetyResult]   = useState<SafetyResponse | null>(null)
  const [safetyLoading, setSafetyLoading] = useState(false)
  const [safetyError, setSafetyError]     = useState<string | null>(null)

  const [selectedProcess, setSelectedProcess] = useState(0)
  const [requestVec, setRequestVec] = useState<Vector>(() => Array(nr).fill(0))

  const [requestResult, setRequestResult]   = useState<ResourceRequestResponse | null>(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError]     = useState<string | null>(null)

  useEffect(() => {
    setSafetyResult(null)
    setSafetyError(null)
    setRequestResult(null)
    setRequestError(null)
  }, [scenario])

  useEffect(() => {
    setRequestVec((prev) => Array.from({ length: nr }, (_, i) => prev[i] ?? 0))
  }, [nr])

  async function runSafetyCheck() {
    setSafetyLoading(true)
    setSafetyError(null)
    setSafetyResult(null)
    try {
      setSafetyResult(
        await postBankerSafety({
          allocation: scenario.allocation,
          need: scenario.need,
          available: scenario.available,
        }),
      )
    } catch (err) {
      setSafetyError(err instanceof Error ? err.message : String(err))
    } finally {
      setSafetyLoading(false)
    }
  }

  async function runRequest() {
    setRequestLoading(true)
    setRequestError(null)
    setRequestResult(null)
    try {
      setRequestResult(
        await postBankerRequest({
          process_index: selectedProcess,
          request: requestVec,
          allocation: scenario.allocation,
          need: scenario.need,
          available: scenario.available,
        }),
      )
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err))
    } finally {
      setRequestLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="pb-1 border-b border-neutral-200/60">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
          Deadlock Avoidance (Banker's Algorithm)
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Scenario: <span className="font-semibold text-neutral-900">{scenario.name}</span>
          {' · '}{np} processes · {nr} resource types
        </p>
      </div>

      {/* Part 1: Safety Check */}
      <SectionCard
        title="Part 1: Safety Check"
        subtitle="Evaluates whether current resource claims guarantee safe termination without deadlock"
        action={
          <button
            onClick={runSafetyCheck}
            disabled={safetyLoading}
            className="btn-primary"
          >
            {safetyLoading ? 'Evaluating…' : 'Run Safety Algorithm'}
          </button>
        }
      >
        {safetyError && <ErrorBanner message={safetyError} onDismiss={() => setSafetyError(null)} />}

        {safetyResult && (
          <div className="space-y-4 pt-2">
            <div
              className={`card p-5 transition-all ${
                safetyResult.is_safe ? 'border-neutral-200' : 'border-amber-200 bg-amber-50/20'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                    safetyResult.is_safe ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-neutral-900">
                      {safetyResult.is_safe ? 'Safe State Confirmed' : 'Unsafe State Warning'}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                        safetyResult.is_safe
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {safetyResult.is_safe ? 'SAFE' : 'UNSAFE'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed">
                    {safetyResult.message}
                  </p>
                </div>
              </div>
            </div>

            {safetyResult.is_safe && safetyResult.safe_sequence.length > 0 && (
              <div className="card p-5">
                <span className="section-label block mb-3">Safe Execution Sequence</span>
                <div className="flex flex-wrap items-center gap-2">
                  {safetyResult.safe_sequence.map((idx, pos) => (
                    <div key={pos} className="flex items-center gap-2">
                      <span className="bg-neutral-900 text-white rounded-md px-3 py-1.5 text-xs font-mono font-medium shadow-2xs">
                        #{pos + 1} {processIds[idx] ?? `P${idx}`}
                      </span>
                      {pos < safetyResult.safe_sequence.length - 1 && (
                        <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-5">
              <span className="section-label block mb-3">Final Work Vector</span>
              <div className="flex gap-2.5 flex-wrap">
                {safetyResult.work_final.map((v, j) => (
                  <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/90 rounded-md px-3 py-1.5 shadow-2xs">
                    <span className="text-xs font-mono font-bold text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                    <span className="w-px h-3 bg-neutral-200" />
                    <span className="text-sm font-mono font-bold text-neutral-900">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <StepTrace steps={safetyResult.steps} processIds={processIds} />
          </div>
        )}
      </SectionCard>

      {/* Part 2: Resource Request Simulation */}
      <SectionCard
        title="Part 2: Resource Request Simulation"
        subtitle="Simulate an immediate resource request and determine if the OS should grant or postpone it"
      >
        <div className="space-y-4">
          <div>
            <label className="section-label block mb-2">Requesting Process</label>
            <div className="flex flex-wrap gap-2">
              {scenario.processes.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedProcess(i)
                    setRequestResult(null)
                    setRequestError(null)
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                    selectedProcess === i
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  <span className="font-mono font-bold mr-1">{p.id}</span>
                  <span className="text-neutral-400">({p.name})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-lg border border-neutral-200/90 bg-neutral-50/40 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-neutral-700">
                Request Vector for <span className="font-mono font-bold text-neutral-900">{processIds[selectedProcess] ?? `P${selectedProcess}`}</span>
              </span>
              <button
                onClick={() => setRequestVec(Array(nr).fill(0))}
                className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2 transition-colors"
              >
                Reset to zero
              </button>
            </div>
            <VectorEditor vector={requestVec} onChange={setRequestVec} colLabels={resourceIds} />

            <div className="pt-3 border-t border-neutral-200/70">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 block mb-2">
                Remaining Need Limit for {processIds[selectedProcess]}
              </span>
              <div className="flex gap-2 flex-wrap">
                {scenario.need[selectedProcess]?.map((v, j) => (
                  <div key={j} className="flex items-center gap-1.5 bg-white border border-neutral-200 px-2.5 py-1 rounded text-xs font-mono">
                    <span className="text-neutral-400 font-bold">{resourceIds[j] ?? `R${j}`}:</span>
                    <span className="text-neutral-900 font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={runRequest}
              disabled={requestLoading}
              className="btn-primary"
            >
              {requestLoading ? 'Validating Request…' : 'Submit & Test Request'}
            </button>
          </div>

          {requestError && <ErrorBanner message={requestError} onDismiss={() => setRequestError(null)} />}

          {requestResult && (
            <div className="space-y-4 pt-2">
              <div
                className={`card p-5 transition-all ${
                  requestResult.granted ? 'border-neutral-200' : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                      requestResult.granted ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-neutral-900">
                        {requestResult.granted ? 'Request Granted' : 'Request Denied'}
                      </h3>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          requestResult.granted
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-rose-50 text-rose-700 border-rose-300'
                        }`}
                      >
                        {requestResult.granted ? 'SAFE TO ALLOCATE' : 'UNSAFE / BLOCKED'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed">
                      {requestResult.reason}
                    </p>
                  </div>
                </div>
              </div>

              {requestResult.granted && (
                <div className="card p-5 space-y-4">
                  <span className="section-label block">Hypothetical State After Grant</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 mb-2">New Available Vector</p>
                      <div className="flex gap-2 flex-wrap">
                        {requestResult.available.map((v, j) => (
                          <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-md text-xs font-mono">
                            <span className="text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                            <span className="w-px h-3 bg-neutral-200" />
                            <span className="font-bold text-neutral-900">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 mb-2">
                        Updated Allocation ({processIds[selectedProcess]})
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {requestResult.allocation[selectedProcess]?.map((v, j) => (
                          <div key={j} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-md text-xs font-mono">
                            <span className="text-neutral-500">{resourceIds[j] ?? `R${j}`}</span>
                            <span className="w-px h-3 bg-neutral-200" />
                            <span className="font-bold text-neutral-900">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {requestResult.safety && (
                <>
                  <div className="card p-5">
                    <span className="section-label block mb-2">Hypothetical Safety Verification</span>
                    <p className="text-xs sm:text-sm text-neutral-600">{requestResult.safety.message}</p>
                    {requestResult.safety.is_safe && requestResult.safety.safe_sequence.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {requestResult.safety.safe_sequence.map((idx, pos) => (
                          <div key={pos} className="flex items-center gap-2">
                            <span className="bg-neutral-900 text-white rounded-md px-2.5 py-1 text-xs font-mono font-medium shadow-2xs">
                              #{pos + 1} {processIds[idx] ?? `P${idx}`}
                            </span>
                            {pos < requestResult.safety!.safe_sequence.length - 1 && (
                              <span className="text-neutral-400">&rarr;</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <StepTrace steps={requestResult.safety.steps} processIds={processIds} />
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
