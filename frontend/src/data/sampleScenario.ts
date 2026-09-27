/**
 * Hardcoded sample scenario used to populate the Dashboard until the
 * Scenario Builder is implemented in a later phase.
 *
 * Classic 5-process / 3-resource Banker's Algorithm example
 * (Silberschatz, Galvin & Gagne "Operating System Concepts").
 *
 * Total resources: A=10, B=5, C=7
 *
 *          Allocation    Maximum        Need (derived)   Available
 *          A  B  C      A  B  C        A  B  C          A  B  C
 *  P0      0  1  0      7  5  3        7  4  3          3  3  2
 *  P1      2  0  0      3  2  2        1  2  2
 *  P2      3  0  2      9  0  2        6  0  0
 *  P3      2  1  1      2  2  2        0  1  1
 *  P4      0  0  2      4  3  3        4  3  1
 *
 * Safe sequence: P1 → P3 → P0 → P2 → P4
 */

import type { ScenarioDetail } from '../types'

export const SAMPLE_SCENARIO: ScenarioDetail = {
  id: 'sample',
  name: 'Classic Banker\'s Example',
  description:
    'Silberschatz textbook 5-process / 3-resource example. ' +
    'Safe sequence: P1 → P3 → P0 → P2 → P4.',
  processes: [
    { id: 'P0', name: 'Process 0' },
    { id: 'P1', name: 'Process 1' },
    { id: 'P2', name: 'Process 2' },
    { id: 'P3', name: 'Process 3' },
    { id: 'P4', name: 'Process 4' },
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
