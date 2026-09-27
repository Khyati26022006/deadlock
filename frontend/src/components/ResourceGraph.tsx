/**
 * ResourceGraph – Resource Allocation Graph visualization using React Flow.
 *
 * Renders dynamically from ScenarioContext data and a detection result.
 * Does NOT run cycle detection itself — deadlock highlighting is driven
 * entirely by the `detectionResult` prop returned from the backend.
 *
 * Node types
 *   ProcessNode  – circle, labelled with process ID
 *   ResourceNode – rounded square, labelled with resource ID
 *
 * Edge types
 *   Allocation  resource → process  solid gray arrow
 *   Request     process → resource  dashed blue arrow
 *
 * Highlighting (only when deadlock_detected === true)
 *   Deadlocked processes and the edges incident to them turn red.
 *   Everything else stays calm/neutral.
 */

import { useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { DetectionResponse, Matrix, ScenarioDetail } from '../types'

// ─── Colour tokens ────────────────────────────────────────────────────────────

const C = {
  processBg: '#1e293b',        // slate-800
  processBorder: '#475569',    // slate-600
  processText: '#e2e8f0',      // slate-200
  resourceBg: '#1e293b',
  resourceBorder: '#475569',
  resourceText: '#e2e8f0',

  deadlockBg: '#450a0a',       // red-950
  deadlockBorder: '#ef4444',   // red-500
  deadlockText: '#fca5a5',     // red-300

  allocationEdge: '#64748b',   // slate-500
  requestEdge: '#3b82f6',      // blue-500
  deadlockEdge: '#ef4444',     // red-500
} as const

// ─── Custom node: Process (circle) ───────────────────────────────────────────

function ProcessNode({ data }: NodeProps) {
  const dead = data.deadlocked as boolean
  const bg     = dead ? C.deadlockBg     : C.processBg
  const border = dead ? C.deadlockBorder : C.processBorder
  const color  = dead ? C.deadlockText   : C.processText
  const shadow = dead ? '0 0 12px 3px rgba(239,68,68,0.6)' : 'none'

  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: bg,
        border: `2.5px solid ${border}`,
        boxShadow: shadow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: 11,
        fontWeight: 600,
        userSelect: 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      {/* React Flow handles – invisible but required for edge connections */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <span style={{ fontSize: 9, color: dead ? '#fca5a5' : '#94a3b8' }}>process</span>
      <span style={{ fontSize: 13 }}>{data.label as string}</span>
    </div>
  )
}

// ─── Custom node: Resource (rounded square) ───────────────────────────────────

function ResourceNode({ data }: NodeProps) {
  const dead = data.deadlocked as boolean
  const bg     = dead ? C.deadlockBg     : C.resourceBg
  const border = dead ? C.deadlockBorder : C.resourceBorder
  const color  = dead ? C.deadlockText   : C.resourceText
  const shadow = dead ? '0 0 12px 3px rgba(239,68,68,0.6)' : 'none'
  const total  = data.total as number

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 8,
        background: bg,
        border: `2.5px solid ${border}`,
        boxShadow: shadow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        color,
        fontSize: 11,
        fontWeight: 600,
        userSelect: 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <span style={{ fontSize: 9, color: dead ? '#fca5a5' : '#94a3b8' }}>resource</span>
      <span style={{ fontSize: 13 }}>{data.label as string}</span>
      {/* Instance dots */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 52 }}>
        {Array.from({ length: Math.min(total, 6) }, (_, k) => (
          <div
            key={k}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: dead ? '#ef4444' : '#475569',
            }}
          />
        ))}
        {total > 6 && (
          <span style={{ fontSize: 8, color: dead ? '#fca5a5' : '#94a3b8' }}>+{total - 6}</span>
        )}
      </div>
    </div>
  )
}

const NODE_TYPES = { processNode: ProcessNode, resourceNode: ResourceNode }

// ─── Layout helpers ───────────────────────────────────────────────────────────

const PROCESS_X  = 60
const RESOURCE_X = 320
const NODE_GAP   = 110
const TOP_OFFSET = 40

function buildGraph(
  scenario: ScenarioDetail,
  request: Matrix,
  deadlockedSet: Set<number>,          // process indices confirmed deadlocked
  deadlockedResSet: Set<number>,        // resource indices incident to deadlocked edges
): { nodes: Node[]; edges: Edge[] } {
  const { processes, resources, allocation } = scenario
  const np = processes.length
  const nr = resources.length

  // ── Nodes ──────────────────────────────────────────────────────────────
  const nodes: Node[] = [
    ...processes.map((p, i) => ({
      id: `p-${i}`,
      type: 'processNode',
      position: { x: PROCESS_X, y: TOP_OFFSET + i * NODE_GAP },
      data: { label: p.id, deadlocked: deadlockedSet.has(i) },
      draggable: true,
    })),
    ...resources.map((r, j) => ({
      id: `r-${j}`,
      type: 'resourceNode',
      position: { x: RESOURCE_X, y: TOP_OFFSET + j * NODE_GAP },
      data: {
        label: r.id,
        total: r.total_instances,
        deadlocked: deadlockedResSet.has(j),
      },
      draggable: true,
    })),
  ]

  // ── Edges ──────────────────────────────────────────────────────────────
  const edges: Edge[] = []

  // Allocation edges: resource → process  (for every nonzero cell)
  for (let i = 0; i < np; i++) {
    for (let j = 0; j < nr; j++) {
      const amt = allocation[i]?.[j] ?? 0
      if (amt === 0) continue
      const isDead = deadlockedSet.has(i)
      edges.push({
        id: `alloc-${i}-${j}`,
        source: `r-${j}`,
        target: `p-${i}`,
        label: amt > 1 ? `×${amt}` : undefined,
        type: 'straight',
        style: {
          stroke: isDead ? C.deadlockEdge : C.allocationEdge,
          strokeWidth: isDead ? 2.5 : 1.5,
          opacity: isDead ? 1 : 0.7,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDead ? C.deadlockEdge : C.allocationEdge,
          width: 14,
          height: 14,
        },
        animated: false,
        data: { kind: 'allocation' },
      })
    }
  }

  // Request edges: process → resource  (for every nonzero cell)
  for (let i = 0; i < np; i++) {
    for (let j = 0; j < nr; j++) {
      const amt = request[i]?.[j] ?? 0
      if (amt === 0) continue
      const isDead = deadlockedSet.has(i)
      edges.push({
        id: `req-${i}-${j}`,
        source: `p-${i}`,
        target: `r-${j}`,
        label: amt > 1 ? `×${amt}` : undefined,
        type: 'straight',
        style: {
          stroke: isDead ? C.deadlockEdge : C.requestEdge,
          strokeWidth: isDead ? 2.5 : 1.5,
          strokeDasharray: '5 4',
          opacity: isDead ? 1 : 0.85,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDead ? C.deadlockEdge : C.requestEdge,
          width: 14,
          height: 14,
        },
        animated: isDead,   // animate deadlocked request edges for emphasis
        data: { kind: 'request' },
      })
    }
  }

  return { nodes, edges }
}

// ─── Fit-view button (inner, has access to RF context) ───────────────────────

function FitButton() {
  const { fitView } = useReactFlow()
  return (
    <button
      onClick={() => fitView({ padding: 0.25, duration: 400 })}
      className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
    >
      Reset View
    </button>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ hasDeadlock }: { hasDeadlock: boolean }) {
  const items = [
    { shape: 'circle', color: C.processBorder,    label: 'Process node' },
    { shape: 'square', color: C.resourceBorder,   label: 'Resource node' },
    { shape: 'line',   color: C.allocationEdge,   label: 'Allocation  (resource → process)', dashed: false },
    { shape: 'line',   color: C.requestEdge,      label: 'Request  (process → resource)',    dashed: true  },
    ...(hasDeadlock
      ? [{ shape: 'circle', color: C.deadlockBorder, label: 'Deadlocked node (red glow)' }]
      : []),
  ]

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Legend</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2.5">
          {item.shape === 'circle' && (
            <span
              style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${item.color}`, display: 'inline-block', background: C.processBg, flexShrink: 0 }}
            />
          )}
          {item.shape === 'square' && (
            <span
              style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${item.color}`, display: 'inline-block', background: C.resourceBg, flexShrink: 0 }}
            />
          )}
          {item.shape === 'line' && (
            <svg width="24" height="10" style={{ flexShrink: 0 }}>
              <line
                x1="0" y1="5" x2="24" y2="5"
                stroke={item.color}
                strokeWidth={1.5}
                strokeDasharray={(item as { dashed: boolean }).dashed ? '4 3' : undefined}
              />
              <polygon points="20,2 24,5 20,8" fill={item.color} />
            </svg>
          )}
          <span className="text-xs text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  scenario: ScenarioDetail
  request: Matrix
  detectionResult: DetectionResponse | null
}

export default function ResourceGraph({ scenario, request, detectionResult }: Props) {
  // Compute which process and resource indices are deadlocked
  const { deadlockedSet, deadlockedResSet } = useMemo(() => {
    const dProc = new Set<number>(detectionResult?.deadlocked_processes ?? [])

    // A resource node is "incident to deadlock" if any deadlocked process
    // either holds it (allocation) or is waiting for it (request)
    const dRes = new Set<number>()
    if (dProc.size > 0) {
      dProc.forEach((pi) => {
        scenario.allocation[pi]?.forEach((amt, j) => { if (amt > 0) dRes.add(j) })
        request[pi]?.forEach((amt, j) => { if (amt > 0) dRes.add(j) })
      })
    }
    return { deadlockedSet: dProc, deadlockedResSet: dRes }
  }, [detectionResult, scenario.allocation, request])

  // Build initial nodes/edges
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(scenario, request, deadlockedSet, deadlockedResSet),
    [scenario, request, deadlockedSet, deadlockedResSet],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // Re-build whenever inputs change (scenario, request, or detection result)
  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(scenario, request, deadlockedSet, deadlockedResSet)
    setNodes(n)
    setEdges(e)
  }, [scenario, request, deadlockedSet, deadlockedResSet, setNodes, setEdges])

  const hasDeadlock = (detectionResult?.deadlock_detected) === true
  const noEdges = initEdges.length === 0

  return (
    <div className="space-y-3">
      {/* Empty state */}
      {noEdges && !hasDeadlock && (
        <p className="text-xs text-gray-500 italic px-1">
          No allocation or request edges yet — set non-zero values in the matrices above.
        </p>
      )}

      {/* Graph canvas */}
      <div
        className={[
          'w-full rounded-xl border overflow-hidden transition-colors',
          hasDeadlock ? 'border-red-700 bg-red-950/20' : 'border-gray-700 bg-gray-900',
        ].join(' ')}
        style={{ height: Math.max(320, Math.max(scenario.processes.length, scenario.resources.length) * NODE_GAP + 80) }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={hasDeadlock ? '#3f1212' : '#1e293b'}
          />
          <Controls showInteractive={false} />
          <Panel position="top-right" className="space-y-2">
            <FitButton />
          </Panel>
          <Panel position="bottom-left">
            <Legend hasDeadlock={hasDeadlock} />
          </Panel>
        </ReactFlow>
      </div>
    </div>
  )
}
