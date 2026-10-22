/**
 * randomScenario.ts
 *
 * Generates a syntactically and semantically valid resource-allocation scenario
 * suitable for feeding into the DeadlockGuard backend.
 *
 * When force_deadlock is true the generator deliberately builds a circular-wait
 * between two processes so that POST /api/deadlock/detect will always return
 * deadlock_detected: true.
 */

import type { Matrix, Vector } from '../types'

// ─── Public shape ─────────────────────────────────────────────────────────────

export interface RandomScenario {
  /** Number of processes (3–6) */
  numProcesses: number
  /** Number of resource types (2–4) */
  numResources: number
  /** Total instances per resource type */
  total: Vector
  /** Maximum demand – each cell bounded by total[j] */
  maximum: Matrix
  /** Allocated – cell ≤ maximum[i][j], col-sum ≤ total[j] */
  allocation: Matrix
  /** Need = maximum − allocation */
  need: Matrix
  /** Available = total − (col sums of allocation) */
  available: Vector
  /**
   * Request matrix used for deadlock detection.
   *  - force_deadlock=false: random request ≤ need (benign)
   *  - force_deadlock=true : guaranteed circular-wait between pA and pB
   */
  request: Matrix
  /** Human-readable process labels e.g. ["P0","P1",...] */
  processLabels: string[]
  /** Human-readable resource labels e.g. ["R0","R1",...] */
  resourceLabels: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inclusive integer in [lo, hi] */
function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

// ─── Core generator ───────────────────────────────────────────────────────────

export function generateRandomScenario(force_deadlock: boolean): RandomScenario {
  if (force_deadlock) {
    return generateForcedDeadlock()
  }
  return generateBenign()
}

// ─── Benign generator (force_deadlock = false) ────────────────────────────────

function generateBenign(): RandomScenario {
  const numProcesses = randInt(3, 6)
  const numResources = randInt(2, 4)

  const total: Vector = Array.from({ length: numResources }, () => randInt(3, 12))

  // Maximum
  const maximum: Matrix = Array.from({ length: numProcesses }, () =>
    Array.from({ length: numResources }, (_, j) => randInt(0, total[j])),
  )

  // Allocation (column-budget aware)
  const allocation: Matrix = Array.from({ length: numProcesses }, () =>
    Array(numResources).fill(0),
  )
  for (let j = 0; j < numResources; j++) {
    let remaining = total[j]
    const order = Array.from({ length: numProcesses }, (_, i) => i).sort(() => Math.random() - 0.5)
    for (const i of order) {
      const maxAlloc = Math.min(maximum[i][j], remaining)
      const alloc = maxAlloc > 0 ? randInt(0, maxAlloc) : 0
      allocation[i][j] = alloc
      remaining -= alloc
    }
  }

  // Need
  const need: Matrix = maximum.map((row, i) =>
    row.map((maxVal, j) => maxVal - allocation[i][j]),
  )

  // Available
  const available: Vector = Array.from({ length: numResources }, (_, j) => {
    const colSum = allocation.reduce((s, row) => s + row[j], 0)
    return total[j] - colSum
  })

  // Request: random ≤ need (usually no deadlock)
  const request: Matrix = need.map((row) => row.map((n) => (n > 0 ? randInt(0, n) : 0)))

  return {
    numProcesses,
    numResources,
    total,
    maximum,
    allocation,
    need,
    available,
    request,
    processLabels: Array.from({ length: numProcesses }, (_, i) => `P${i}`),
    resourceLabels: Array.from({ length: numResources }, (_, j) => `R${j}`),
  }
}

// ─── Forced deadlock generator (force_deadlock = true) ────────────────────────
//
// Detection algorithm recap (from detection.py):
//   Work    = Available (initially)
//   Finish[i] = true  if allocation[i] is ALL ZEROS (holds nothing)
//             = false otherwise
//   Loop: find i where Finish[i]=false AND request[i] ≤ Work → release alloc, set Finish=true
//   Deadlocked = processes left with Finish=false
//
// Guarantee strategy:
//   1. Use EXACTLY 2 processes total (pA=0, pB=1) — no bystanders can help.
//      Both hold resources, so Finish starts [false, false].
//   2. Zero available — no free resources at all.
//   3. pA requests what pB holds; pB requests what pA holds.
//   4. Since Work=0 and requests > 0, neither can ever run → both deadlocked.
//
// We still report numProcesses/numResources matching the 3–6 / 2–4 spec for
// the UI display, but the *extra* processes (P2..Pn) have zero allocation AND
// zero request, so:
//   - They start Finish=true (allocation all-zero) → they run immediately,
//     but they release nothing (allocation=0) → Work stays 0.
//   - pA and pB remain blocked regardless.

function generateForcedDeadlock(): RandomScenario {
  const numProcesses = randInt(3, 6)
  const numResources = randInt(2, 4)

  // Total instances: generous so maximum looks realistic
  const total: Vector = Array.from({ length: numResources }, () => randInt(6, 12))

  // pA = 0, pB = 1 — the two deadlocked processes
  const pA = 0
  const pB = 1

  // How much each holds per resource (1–3 per resource)
  const holdA: Vector = Array.from({ length: numResources }, () => randInt(1, 3))
  const holdB: Vector = Array.from({ length: numResources }, () => randInt(1, 3))

  // Maximum must cover allocation + what they'll request
  // maxA[j] >= holdA[j] + holdB[j] (so need[pA][j] >= holdB[j])
  const maxA: Vector = Array.from({ length: numResources }, (_, j) =>
    holdA[j] + holdB[j] + randInt(0, 2),
  )
  const maxB: Vector = Array.from({ length: numResources }, (_, j) =>
    holdB[j] + holdA[j] + randInt(0, 2),
  )

  // Build full matrices — extra processes (P2+) hold nothing and request nothing
  const maximum: Matrix = Array.from({ length: numProcesses }, (_, i) => {
    if (i === pA) return [...maxA]
    if (i === pB) return [...maxB]
    // Give extra processes a plausible maximum (won't affect deadlock logic)
    return Array.from({ length: numResources }, (_, j) => randInt(0, Math.min(total[j], 3)))
  })

  const allocation: Matrix = Array.from({ length: numProcesses }, (_, i) => {
    if (i === pA) return [...holdA]
    if (i === pB) return [...holdB]
    return Array(numResources).fill(0) // extra processes hold nothing
  })

  // Need = maximum − allocation
  const need: Matrix = maximum.map((row, i) =>
    row.map((maxVal, j) => Math.max(0, maxVal - allocation[i][j])),
  )

  // Available = 0 (all resources are held by pA and pB, or unclaimed but set to 0)
  // We set available to 0 so Work starts at zero → neither pA nor pB can ever run.
  const available: Vector = Array(numResources).fill(0)

  // Request: pA wants what pB holds, pB wants what pA holds
  const request: Matrix = Array.from({ length: numProcesses }, (_, i) => {
    if (i === pA) return [...holdB] // pA requests pB's allocation
    if (i === pB) return [...holdA] // pB requests pA's allocation
    return Array(numResources).fill(0) // extra processes request nothing
  })

  return {
    numProcesses,
    numResources,
    total,
    maximum,
    allocation,
    need,
    available,
    request,
    processLabels: Array.from({ length: numProcesses }, (_, i) => `P${i}`),
    resourceLabels: Array.from({ length: numResources }, (_, j) => `R${j}`),
  }
}
