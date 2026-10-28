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

const C = {
  nodeBg:          '#ffffff',
  nodeBorder:      '#cccccc',
  nodeText:        '#111111',
  nodeSubtext:     '#aaaaaa',

  deadlockBg:      '#fff5f5',
  deadlockBorder:  '#cc2222',
  deadlockText:    '#cc2222',

  allocationEdge:  '#aaaaaa',
  requestEdge:     '#555555',
  deadlockEdge:    '#cc2222',
} as const

function ProcessNode({ data }: NodeProps) {
  const dead = data.deadlocked as boolean
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: dead ? C.deadlockBg : C.nodeBg,
      border: `1.5px solid ${dead ? C.deadlockBorder : C.nodeBorder}`,
      boxShadow: dead ? '0 0 14px 2px rgba(200,30,30,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: dead ? C.deadlockText : C.nodeText,
      userSelect: 'none',
      transition: 'box-shadow 0.3s, border-color 0.3s',
    }}>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <span style={{ fontSize: 8, color: dead ? '#cc4444' : '#aaa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>proc</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{data.label as string}</span>
    </div>
  )
}

function ResourceNode({ data }: NodeProps) {
  const dead = data.deadlocked as boolean
  const total = data.total as number
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 3,
      background: dead ? C.deadlockBg : C.nodeBg,
      border: `1.5px solid ${dead ? C.deadlockBorder : C.nodeBorder}`,
      boxShadow: dead ? '0 0 14px 2px rgba(200,30,30,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 3, color: dead ? C.deadlockText : C.nodeText,
      userSelect: 'none',
      transition: 'box-shadow 0.3s, border-color 0.3s',
    }}>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <span style={{ fontSize: 8, color: dead ? '#cc4444' : '#aaa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>res</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{data.label as string}</span>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 52 }}>
        {Array.from({ length: Math.min(total, 6) }, (_, k) => (
          <div key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: dead ? '#cc2222' : '#ccc' }} />
        ))}
        {total > 6 && <span style={{ fontSize: 8, color: dead ? '#cc4444' : '#aaa' }}>+{total - 6}</span>}
      </div>
    </div>
  )
}

const NODE_TYPES = { processNode: ProcessNode, resourceNode: ResourceNode }

const PROCESS_X = 60, RESOURCE_X = 300, NODE_GAP = 100, TOP_OFFSET = 40

function buildGraph(scenario: ScenarioDetail, request: Matrix, deadlockedSet: Set<number>, deadlockedResSet: Set<number>): { nodes: Node[]; edges: Edge[] } {
  const { processes, resources, allocation } = scenario
  const np = processes.length, nr = resources.length

  const nodes: Node[] = [
    ...processes.map((p, i) => ({
      id: `p-${i}`, type: 'processNode',
      position: { x: PROCESS_X, y: TOP_OFFSET + i * NODE_GAP },
      data: { label: p.id, deadlocked: deadlockedSet.has(i) }, draggable: true,
    })),
    ...resources.map((r, j) => ({
      id: `r-${j}`, type: 'resourceNode',
      position: { x: RESOURCE_X, y: TOP_OFFSET + j * NODE_GAP },
      data: { label: r.id, total: r.total_instances, deadlocked: deadlockedResSet.has(j) }, draggable: true,
    })),
  ]

  const edges: Edge[] = []
  for (let i = 0; i < np; i++) {
    for (let j = 0; j < nr; j++) {
      const amt = allocation[i]?.[j] ?? 0
      if (!amt) continue
      const isDead = deadlockedSet.has(i)
      edges.push({
        id: `alloc-${i}-${j}`, source: `r-${j}`, target: `p-${i}`,
        label: amt > 1 ? `×${amt}` : undefined, type: 'straight',
        style: { stroke: isDead ? C.deadlockEdge : C.allocationEdge, strokeWidth: isDead ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDead ? C.deadlockEdge : C.allocationEdge, width: 12, height: 12 },
      })
    }
  }
  for (let i = 0; i < np; i++) {
    for (let j = 0; j < nr; j++) {
      const amt = request[i]?.[j] ?? 0
      if (!amt) continue
      const isDead = deadlockedSet.has(i)
      edges.push({
        id: `req-${i}-${j}`, source: `p-${i}`, target: `r-${j}`,
        label: amt > 1 ? `×${amt}` : undefined, type: 'straight',
        style: { stroke: isDead ? C.deadlockEdge : C.requestEdge, strokeWidth: isDead ? 2 : 1.5, strokeDasharray: '5 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDead ? C.deadlockEdge : C.requestEdge, width: 12, height: 12 },
        animated: isDead,
      })
    }
  }
  return { nodes, edges }
}

function FitButton() {
  const { fitView } = useReactFlow()
  return (
    <button
      onClick={() => fitView({ padding: 0.25, duration: 400 })}
      className="bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-600 hover:text-black text-sm px-3 py-1.5 rounded-sm transition-colors shadow-sm"
    >
      Reset View
    </button>
  )
}

function Legend({ hasDeadlock }: { hasDeadlock: boolean }) {
  const items = [
    { shape: 'circle', color: C.nodeBorder,     label: 'Process' },
    { shape: 'square', color: C.nodeBorder,     label: 'Resource' },
    { shape: 'line',   color: C.allocationEdge, label: 'Allocation (res → proc)', dashed: false },
    { shape: 'line',   color: C.requestEdge,    label: 'Request (proc → res)',    dashed: true  },
    ...(hasDeadlock ? [{ shape: 'circle', color: C.deadlockBorder, label: 'Deadlocked' }] : []),
  ]
  return (
    <div className="bg-white border border-neutral-200 rounded-sm p-3 space-y-1.5 shadow-sm">
      <p className="section-label mb-2">Legend</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2.5">
          {item.shape === 'circle' && <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${item.color}`, display: 'inline-block', background: '#fff', flexShrink: 0 }} />}
          {item.shape === 'square' && <span style={{ width: 12, height: 12, borderRadius: 2, border: `1.5px solid ${item.color}`, display: 'inline-block', background: '#fff', flexShrink: 0 }} />}
          {item.shape === 'line' && (
            <svg width="22" height="10" style={{ flexShrink: 0 }}>
              <line x1="0" y1="5" x2="22" y2="5" stroke={item.color} strokeWidth={1.5} strokeDasharray={(item as { dashed: boolean }).dashed ? '4 3' : undefined} />
              <polygon points="18,2 22,5 18,8" fill={item.color} />
            </svg>
          )}
          <span className="text-xs text-neutral-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  scenario: ScenarioDetail
  request: Matrix
  detectionResult: DetectionResponse | null
}

export default function ResourceGraph({ scenario, request, detectionResult }: Props) {
  const { deadlockedSet, deadlockedResSet } = useMemo(() => {
    const dProc = new Set<number>(detectionResult?.deadlocked_processes ?? [])
    const dRes  = new Set<number>()
    if (dProc.size > 0) {
      dProc.forEach((pi) => {
        scenario.allocation[pi]?.forEach((amt, j) => { if (amt > 0) dRes.add(j) })
        request[pi]?.forEach((amt, j) => { if (amt > 0) dRes.add(j) })
      })
    }
    return { deadlockedSet: dProc, deadlockedResSet: dRes }
  }, [detectionResult, scenario.allocation, request])

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(scenario, request, deadlockedSet, deadlockedResSet),
    [scenario, request, deadlockedSet, deadlockedResSet],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(scenario, request, deadlockedSet, deadlockedResSet)
    setNodes(n); setEdges(e)
  }, [scenario, request, deadlockedSet, deadlockedResSet, setNodes, setEdges])

  const hasDeadlock = detectionResult?.deadlock_detected === true

  return (
    <div className="space-y-3">
      {initEdges.length === 0 && !hasDeadlock && (
        <p className="text-sm text-neutral-400 italic px-1">No allocation or request edges — set non-zero values in the matrices above.</p>
      )}
      <div
        className={['w-full rounded-sm border overflow-hidden', hasDeadlock ? 'border-red-300' : 'border-neutral-200'].join(' ')}
        style={{ height: Math.max(320, Math.max(scenario.processes.length, scenario.resources.length) * NODE_GAP + 80), background: '#fafafa' }}
      >
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES} fitView fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3} maxZoom={2} proOptions={{ hideAttribution: true }} deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e5e5e5" />
          <Controls showInteractive={false} />
          <Panel position="top-right"><FitButton /></Panel>
          <Panel position="bottom-left"><Legend hasDeadlock={hasDeadlock} /></Panel>
        </ReactFlow>
      </div>
    </div>
  )
}
