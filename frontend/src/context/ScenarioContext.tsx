/**
 * ScenarioContext – single source of truth for the active scenario.
 *
 * Provided at the App root so Dashboard, ScenarioBuilder, Detection,
 * and Avoidance pages all read/write the same object without prop-drilling.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import { SAMPLE_SCENARIO } from '../data/sampleScenario'
import type { ScenarioDetail } from '../types'

interface ScenarioContextValue {
  scenario: ScenarioDetail
  setScenario: (s: ScenarioDetail) => void
  resetToSample: () => void
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<ScenarioDetail>(SAMPLE_SCENARIO)

  function resetToSample() {
    setScenario(SAMPLE_SCENARIO)
  }

  return (
    <ScenarioContext.Provider value={{ scenario, setScenario, resetToSample }}>
      {children}
    </ScenarioContext.Provider>
  )
}

/** Hook – throws if used outside <ScenarioProvider>. */
export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext)
  if (!ctx) throw new Error('useScenario must be used inside <ScenarioProvider>')
  return ctx
}
