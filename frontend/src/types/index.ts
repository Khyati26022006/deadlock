// ─── Shared primitive types ──────────────────────────────────────────────────

export type Matrix = number[][]
export type Vector = number[]

// ─── Error envelopes ─────────────────────────────────────────────────────────

/** 400 response from algorithm endpoints: {"error": "...", "detail": "..."} */
export interface AlgorithmErrorBody {
  error: string
  detail: string
}

/** 404 response from resource endpoints: {"detail": "..."} */
export interface NotFoundErrorBody {
  detail: string
}

/** Union of all possible error bodies */
export type ApiErrorBody = AlgorithmErrorBody | NotFoundErrorBody

// ─── Banker's Safety ─────────────────────────────────────────────────────────

export interface IterationSnapshot {
  iteration: number
  process_index: number
  process_qualified: boolean
  work_before: Vector
  work_after: Vector
  finish_vector: boolean[]
  note: string
}

export interface SafetyRequest {
  allocation: Matrix
  need: Matrix
  available: Vector
}

export interface SafetyResponse {
  is_safe: boolean
  safe_sequence: number[]
  work_final: Vector
  finish_final: boolean[]
  steps: IterationSnapshot[]
  message: string
}

// ─── Banker's Resource Request ───────────────────────────────────────────────

export interface ResourceRequestBody {
  process_index: number
  request: Vector
  allocation: Matrix
  need: Matrix
  available: Vector
}

export interface ResourceRequestResponse {
  granted: boolean
  reason: string
  allocation: Matrix
  need: Matrix
  available: Vector
  safety: SafetyResponse | null
}

// ─── Deadlock Detection ──────────────────────────────────────────────────────

export interface DetectionRequest {
  allocation: Matrix
  request: Matrix
  available: Vector
}

export interface DetectionSnapshot {
  iteration: number
  process_index: number
  process_qualified: boolean
  work_before: Vector
  work_after: Vector
  finish_vector: boolean[]
  note: string
}

export interface DetectionResponse {
  deadlock_detected: boolean
  deadlocked_processes: number[]
  completed_processes: number[]
  work_final: Vector
  finish_final: boolean[]
  steps: DetectionSnapshot[]
  message: string
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export interface ProcessDef {
  id: string
  name: string
  state?: string
}

export interface ResourceDef {
  id: string
  name: string
  total_instances: number
}

export interface ScenarioCreateRequest {
  name: string
  description?: string
  processes: ProcessDef[]
  resources: ResourceDef[]
  allocation: Matrix
  maximum: Matrix
  available: Vector
}

export interface ScenarioDetail {
  id: string
  name: string
  description: string
  processes: ProcessDef[]
  resources: ResourceDef[]
  allocation: Matrix
  maximum: Matrix
  need: Matrix
  available: Vector
}

export interface ScenarioSummary {
  id: string
  name: string
  description: string
  n_processes: number
  n_resources: number
}

export interface ScenarioListResponse {
  scenarios: ScenarioSummary[]
  total: number
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string
  message: string
  version: string
}

// ─── Deadlock Prevention ─────────────────────────────────────────────────────

export interface ConditionResult {
  condition_name: string
  present: boolean
  explanation: string
  prevention_strategy: string
  affected_processes: string[]
  affected_resources: string[]
}

export interface PreventionRequest {
  processes: ProcessDef[]
  resources: ResourceDef[]
  allocation: Matrix
  need: Matrix
  available: Vector
  request_matrix: Matrix
}

export interface PreventionResponse {
  mutual_exclusion: ConditionResult
  hold_and_wait: ConditionResult
  no_preemption: ConditionResult
  circular_wait: ConditionResult
  conditions_present: number
  summary: string
}

// ─── Deadlock Recovery ───────────────────────────────────────────────────────

export interface RecoveryRequest {
  processes: ProcessDef[]
  resources: ResourceDef[]
  allocation: Matrix
  need: Matrix
  available: Vector
  deadlocked_pids: string[]
  strategy: string
}

export interface TerminationStep {
  step: number
  terminated_process: string
  reason: string
  resources_freed: [number, number][]
  deadlock_resolved: boolean
  remaining_deadlocked: string[]
}

export interface PreemptionStep {
  victim_process: string
  preempted_resources: [number, number][]
  reason: string
  requires_rollback: boolean
  victim_state_before: string
  victim_state_after: string
  rollback_checkpoint: string
}

export interface RecoveryResponse {
  strategy: string
  success: boolean
  processes_terminated: string[]
  processes_preempted: string[]
  termination_steps: TerminationStep[]
  preemption_steps: PreemptionStep[]
  available_after: Vector
  allocation_after: Matrix
  message: string
  cost_estimate: number
}
