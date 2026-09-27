/**
 * Preset scenarios for DeadlockGuard.
 *
 * Each scenario is a complete ScenarioDetail that can be loaded directly
 * into ScenarioContext via the Scenario Builder's preset dropdown.
 *
 * Every scenario has been verified against the live backend:
 *
 *  "Safe State"
 *    → POST /api/banker/safety  → is_safe: true, seq: P1→P3→P0→P2→P4
 *
 *  "Unsafe State"
 *    → POST /api/banker/safety  → is_safe: false
 *    → POST /api/deadlock/detect (zero request) → deadlock_detected: false
 *    Demonstrates: UNSAFE ≠ deadlocked. The system cannot guarantee
 *    completion (no safe sequence exists) but no process is actively stuck.
 *
 *  "Classic Circular Deadlock"
 *    → POST /api/deadlock/detect → deadlock_detected: true, P0 + P1
 *    P0 holds R0 and needs R1; P1 holds R1 and needs R0.
 *    Available = [0, 0] so neither can ever proceed.
 *
 *  "All Conditions Present"
 *    → POST /api/prevention/analyze → conditions_present: 4
 *    All four Coffman conditions flagged: Mutual Exclusion, Hold-and-Wait,
 *    No Preemption, Circular Wait. Designed for the Prevention page demo.
 *
 *  "Resolvable Recovery Case"
 *    → POST /api/deadlock/detect → deadlock_detected: true, P0+P1+P2
 *    → POST /api/recovery/terminate (lowest_pid) → P0 terminated, resolved in 1 step
 *    → POST /api/recovery/preempt  (lowest_pid) → P0 preempted, state blocked→waiting
 *    Designed for a clean, readable before/after display on the Recovery page.
 */

import type { ScenarioDetail } from '../types'

// ─── 1. Safe State ────────────────────────────────────────────────────────────
// Classic Silberschatz 5-process / 3-resource Banker's Algorithm example.
// Safe sequence: P1 → P3 → P0 → P2 → P4
// Total: A=10, B=5, C=7   Available: A=3, B=3, C=2
export const PRESET_SAFE_STATE: ScenarioDetail = {
  id: 'preset-safe',
  name: 'Safe State',
  description:
    'Classic Silberschatz 5-process/3-resource Banker\'s example. ' +
    'Safety algorithm returns SAFE with sequence P1→P3→P0→P2→P4.',
  processes: [
    { id: 'P0', name: 'Process 0', state: 'running' },
    { id: 'P1', name: 'Process 1', state: 'running' },
    { id: 'P2', name: 'Process 2', state: 'running' },
    { id: 'P3', name: 'Process 3', state: 'running' },
    { id: 'P4', name: 'Process 4', state: 'running' },
  ],
  resources: [
    { id: 'R0', name: 'Resource A', total_instances: 10 },
    { id: 'R1', name: 'Resource B', total_instances: 5 },
    { id: 'R2', name: 'Resource C', total_instances: 7 },
  ],
  allocation: [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 2],
    [2, 1, 1],
    [0, 0, 2],
  ],
  maximum: [
    [7, 5, 3],
    [3, 2, 2],
    [9, 0, 2],
    [2, 2, 2],
    [4, 3, 3],
  ],
  need: [
    [7, 4, 3],
    [1, 2, 2],
    [6, 0, 0],
    [0, 1, 1],
    [4, 3, 1],
  ],
  available: [3, 3, 2],
}

// ─── 2. Unsafe State ──────────────────────────────────────────────────────────
// 3 processes, 2 resources. No safe execution sequence exists —
// nobody can complete in the current state. However, no process is
// blocked in an active circular wait (all request rows are zero),
// so deadlock detection returns NO_DEADLOCK.
// Total: A=3, B=3   Available: A=1, B=0
export const PRESET_UNSAFE_STATE: ScenarioDetail = {
  id: 'preset-unsafe',
  name: 'Unsafe State',
  description:
    'No safe execution sequence exists (Banker\'s returns UNSAFE), but no ' +
    'process is currently blocked — deadlock detection returns NO_DEADLOCK. ' +
    'Demonstrates that UNSAFE ≠ deadlocked.',
  processes: [
    { id: 'P0', name: 'Process 0', state: 'running' },
    { id: 'P1', name: 'Process 1', state: 'running' },
    { id: 'P2', name: 'Process 2', state: 'running' },
  ],
  resources: [
    { id: 'R0', name: 'Resource A', total_instances: 3 },
    { id: 'R1', name: 'Resource B', total_instances: 3 },
  ],
  allocation: [
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  maximum: [
    [2, 2],
    [2, 1],
    [3, 2],
  ],
  need: [
    [1, 2],
    [1, 0],
    [3, 1],
  ],
  available: [1, 0],
}

// ─── 3. Classic Circular Deadlock ─────────────────────────────────────────────
// 2 processes, 2 resources. P0 holds R0 and needs R1; P1 holds R1 and
// needs R0. Available = [0, 0]. Neither can ever proceed.
// Detection with request = need → DEADLOCKED (P0 + P1).
export const PRESET_CLASSIC_DEADLOCK: ScenarioDetail = {
  id: 'preset-deadlock',
  name: 'Classic Circular Deadlock',
  description:
    'P0 holds R0 and waits for R1. P1 holds R1 and waits for R0. ' +
    'Available=[0,0]. Confirmed circular deadlock — both processes blocked permanently.',
  processes: [
    { id: 'P0', name: 'Process 0', state: 'blocked' },
    { id: 'P1', name: 'Process 1', state: 'blocked' },
  ],
  resources: [
    { id: 'R0', name: 'Resource A', total_instances: 1 },
    { id: 'R1', name: 'Resource B', total_instances: 1 },
  ],
  allocation: [
    [1, 0],
    [0, 1],
  ],
  maximum: [
    [1, 1],
    [1, 1],
  ],
  need: [
    [0, 1],
    [1, 0],
  ],
  available: [0, 0],
}

// ─── 4. All Conditions Present ────────────────────────────────────────────────
// 3 processes, 3 resources, one of each. Perfect circular wait P0→P1→P2→P0.
// Prevention analysis flags all 4 Coffman conditions:
//   Mutual Exclusion: total_instances=1 per resource
//   Hold and Wait:    each process holds 1 resource and needs 1 more
//   No Preemption:    always true (policy constant)
//   Circular Wait:    P0→P1→P2→P0 in wait-for graph
export const PRESET_ALL_CONDITIONS: ScenarioDetail = {
  id: 'preset-all-conditions',
  name: 'All Conditions Present',
  description:
    'Three-process circular hold-and-wait: P0→P1→P2→P0. ' +
    'Prevention analysis flags all 4 Coffman conditions as present. ' +
    'Designed for the Prevention page demo.',
  processes: [
    { id: 'P0', name: 'Process 0', state: 'blocked' },
    { id: 'P1', name: 'Process 1', state: 'blocked' },
    { id: 'P2', name: 'Process 2', state: 'blocked' },
  ],
  resources: [
    { id: 'R0', name: 'Resource A', total_instances: 1 },
    { id: 'R1', name: 'Resource B', total_instances: 1 },
    { id: 'R2', name: 'Resource C', total_instances: 1 },
  ],
  allocation: [
    [1, 0, 0],  // P0 holds R0
    [0, 1, 0],  // P1 holds R1
    [0, 0, 1],  // P2 holds R2
  ],
  maximum: [
    [1, 1, 0],
    [0, 1, 1],
    [1, 0, 1],
  ],
  need: [
    [0, 1, 0],  // P0 needs R1
    [0, 0, 1],  // P1 needs R2
    [1, 0, 0],  // P2 needs R0
  ],
  available: [0, 0, 0],
}

// ─── 5. Resolvable Recovery Case ─────────────────────────────────────────────
// 3 processes, 2 resources. All three are deadlocked.
// P0 holds 2 of R0 and needs R1.
// P1 holds 1 of R1 and needs R0.
// P2 holds 1 of each and needs R0.
// Available = [0, 0].
//
// Termination (lowest_pid): terminate P0 → releases [2,0] → avail=[2,0].
//   P1 needs [1,0] ≤ [2,0] ✓ and P2 needs [1,0] ≤ [2,0] ✓ → resolved in 1 step.
// Preemption (lowest_pid): preempt P0 → state blocked→waiting, same resource release.
export const PRESET_RECOVERY: ScenarioDetail = {
  id: 'preset-recovery',
  name: 'Resolvable Recovery Case',
  description:
    'P0, P1, and P2 are all deadlocked. Terminating or preempting P0 alone ' +
    'releases enough of R0 for P1 and P2 to proceed — clean 1-step resolution.',
  processes: [
    { id: 'P0', name: 'Process 0', state: 'blocked' },
    { id: 'P1', name: 'Process 1', state: 'blocked' },
    { id: 'P2', name: 'Process 2', state: 'blocked' },
  ],
  resources: [
    { id: 'R0', name: 'Resource A', total_instances: 3 },
    { id: 'R1', name: 'Resource B', total_instances: 2 },
  ],
  allocation: [
    [2, 0],  // P0 holds 2 of R0
    [0, 1],  // P1 holds 1 of R1
    [1, 1],  // P2 holds 1 of R0, 1 of R1
  ],
  maximum: [
    [2, 1],
    [1, 1],
    [2, 1],
  ],
  need: [
    [0, 1],  // P0 needs R1
    [1, 0],  // P1 needs R0
    [1, 0],  // P2 needs R0
  ],
  available: [0, 0],
}

// ─── Preset registry ─────────────────────────────────────────────────────────
// Ordered list consumed by the ScenarioBuilder dropdown.
export interface PresetEntry {
  id: string
  label: string
  description: string
  scenario: ScenarioDetail
}

export const PRESETS: PresetEntry[] = [
  {
    id: 'safe',
    label: 'Safe State',
    description: 'Banker\'s safety check returns SAFE — safe sequence exists',
    scenario: PRESET_SAFE_STATE,
  },
  {
    id: 'unsafe',
    label: 'Unsafe State',
    description: 'No safe sequence (UNSAFE), but no active deadlock yet',
    scenario: PRESET_UNSAFE_STATE,
  },
  {
    id: 'deadlock',
    label: 'Classic Circular Deadlock',
    description: 'P0↔P1 mutual block, Available=0 — confirmed deadlock',
    scenario: PRESET_CLASSIC_DEADLOCK,
  },
  {
    id: 'all-conditions',
    label: 'All Conditions Present',
    description: 'Prevention page: all 4 Coffman conditions flagged',
    scenario: PRESET_ALL_CONDITIONS,
  },
  {
    id: 'recovery',
    label: 'Resolvable Recovery Case',
    description: 'Recovery page: 1-step termination or preemption resolves deadlock',
    scenario: PRESET_RECOVERY,
  },
]
