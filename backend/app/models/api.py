"""
DeadlockGuard – API-layer Pydantic request/response models.

These models are the HTTP contract between the frontend and the backend.
They are intentionally separate from the domain models in schemas.py so
that the API shape can evolve independently of the internal algorithm
data-structures.

Naming convention
-----------------
  <Resource>Request  – inbound JSON body for a POST endpoint
  <Resource>Response – outbound JSON body for any endpoint
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared primitive models (reused across multiple endpoints)
# ---------------------------------------------------------------------------


class MatrixBody(BaseModel):
    """A 2-D matrix of integers, rows = processes, columns = resources."""
    matrix: List[List[int]] = Field(
        ..., description="2-D list: rows=processes, columns=resources"
    )


class VectorBody(BaseModel):
    """A 1-D integer vector (one entry per resource type)."""
    vector: List[int] = Field(
        ..., description="1-D list with one entry per resource type"
    )


# ---------------------------------------------------------------------------
# Banker's Algorithm – safety check
# ---------------------------------------------------------------------------


class SafetyRequest(BaseModel):
    """
    Request body for POST /api/banker/safety.

    Fields mirror the three inputs of safety_algorithm():
        allocation  – n_processes × n_resources matrix
        need        – n_processes × n_resources matrix (Maximum − Allocation)
        available   – 1-D vector of length n_resources
    """
    allocation: List[List[int]] = Field(
        ..., description="Current allocation matrix"
    )
    need: List[List[int]] = Field(
        ..., description="Remaining need matrix (Maximum − Allocation)"
    )
    available: List[int] = Field(
        ..., description="Currently available resources vector"
    )


class IterationSnapshotResponse(BaseModel):
    """One step of the Safety Algorithm trace."""
    iteration: int
    process_index: int
    process_qualified: bool
    work_before: List[int]
    work_after: List[int]
    finish_vector: List[bool]
    note: str


class SafetyResponse(BaseModel):
    """
    Response body for POST /api/banker/safety.
    """
    is_safe: bool = Field(
        ..., description="True = SAFE state, False = UNSAFE state"
    )
    safe_sequence: List[int] = Field(
        default_factory=list,
        description="Order in which processes were granted resources (indices)"
    )
    work_final: List[int] = Field(
        ..., description="Work vector when algorithm terminated"
    )
    finish_final: List[bool] = Field(
        ..., description="Finish vector when algorithm terminated"
    )
    steps: List[IterationSnapshotResponse] = Field(
        default_factory=list,
        description="Step-by-step trace for educational display"
    )
    message: str = Field(..., description="Human-readable result summary")


# ---------------------------------------------------------------------------
# Banker's Algorithm – resource request
# ---------------------------------------------------------------------------


class ResourceRequestBody(BaseModel):
    """
    Request body for POST /api/banker/request.

    Fields mirror the five inputs of resource_request():
        process_index – 0-based index of the requesting process
        request       – vector of resource amounts being requested
        allocation    – current allocation matrix
        need          – current need matrix
        available     – current available vector
    """
    process_index: int = Field(
        ..., ge=0, description="0-based index of the requesting process"
    )
    request: List[int] = Field(
        ..., description="Amount of each resource being requested"
    )
    allocation: List[List[int]] = Field(
        ..., description="Current allocation matrix"
    )
    need: List[List[int]] = Field(
        ..., description="Current need matrix"
    )
    available: List[int] = Field(
        ..., description="Current available vector"
    )


class ResourceRequestResponse(BaseModel):
    """
    Response body for POST /api/banker/request.
    """
    granted: bool = Field(
        ..., description="True = request granted, False = denied"
    )
    reason: str = Field(
        ..., description="Why the request was granted or denied"
    )
    allocation: List[List[int]] = Field(
        ..., description="Allocation matrix after decision"
    )
    need: List[List[int]] = Field(
        ..., description="Need matrix after decision"
    )
    available: List[int] = Field(
        ..., description="Available vector after decision"
    )
    safety: Optional[SafetyResponse] = Field(
        default=None,
        description="Safety algorithm result on the hypothetical state"
    )


# ---------------------------------------------------------------------------
# Deadlock Detection
# ---------------------------------------------------------------------------


class DetectionRequest(BaseModel):
    """
    Request body for POST /api/deadlock/detect.

    Fields mirror the three inputs of detect_deadlock():
        allocation – n_processes × n_resources matrix
        request    – n_processes × n_resources matrix (pending requests)
        available  – 1-D vector of length n_resources
    """
    allocation: List[List[int]] = Field(
        ..., description="Current allocation matrix"
    )
    request: List[List[int]] = Field(
        ..., description="Pending request matrix (what each process is waiting for)"
    )
    available: List[int] = Field(
        ..., description="Currently available resources vector"
    )


class DetectionSnapshotResponse(BaseModel):
    """One step of the detection algorithm trace."""
    iteration: int
    process_index: int
    process_qualified: bool
    work_before: List[int]
    work_after: List[int]
    finish_vector: List[bool]
    note: str


class DetectionResponse(BaseModel):
    """
    Response body for POST /api/deadlock/detect.
    """
    deadlock_detected: bool = Field(
        ..., description="True = deadlock confirmed, False = no deadlock"
    )
    deadlocked_processes: List[int] = Field(
        default_factory=list,
        description="Indices of processes confirmed deadlocked"
    )
    completed_processes: List[int] = Field(
        default_factory=list,
        description="Indices of processes that can complete"
    )
    work_final: List[int] = Field(
        ..., description="Work vector when algorithm terminated"
    )
    finish_final: List[bool] = Field(
        ..., description="Finish vector when algorithm terminated"
    )
    steps: List[DetectionSnapshotResponse] = Field(
        default_factory=list,
        description="Step-by-step trace for educational display"
    )
    message: str = Field(..., description="Human-readable result summary")


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------


class ScenarioCreateRequest(BaseModel):
    """
    Request body for POST /api/scenarios.

    Clients supply the full Scenario data.  The server assigns the ID.
    """
    name: str = Field(..., min_length=1, description="Scenario name")
    description: str = Field(default="", description="Optional description")
    processes: List[Dict[str, Any]] = Field(
        ..., min_length=1, description="List of process objects"
    )
    resources: List[Dict[str, Any]] = Field(
        ..., min_length=1, description="List of resource objects"
    )
    allocation: List[List[int]] = Field(
        ..., description="Allocation matrix"
    )
    maximum: List[List[int]] = Field(
        ..., description="Maximum demand matrix"
    )
    available: List[int] = Field(
        ..., description="Available resources vector"
    )


class ScenarioSummary(BaseModel):
    """Lightweight scenario representation used in list responses."""
    id: str
    name: str
    description: str
    n_processes: int
    n_resources: int


class ScenarioDetailResponse(BaseModel):
    """Full scenario returned by GET /api/scenarios/{id}."""
    id: str
    name: str
    description: str
    processes: List[Dict[str, Any]]
    resources: List[Dict[str, Any]]
    allocation: List[List[int]]
    maximum: List[List[int]]
    need: List[List[int]]
    available: List[int]


class ScenarioListResponse(BaseModel):
    """Response body for GET /api/scenarios."""
    scenarios: List[ScenarioSummary]
    total: int


# ---------------------------------------------------------------------------
# Generic error response (used by exception handlers)
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    """Standard error envelope returned on 4xx responses."""
    error: str = Field(..., description="Error category / exception class name")
    detail: str = Field(..., description="Human-readable error message")


# ---------------------------------------------------------------------------
# Deadlock Prevention
# ---------------------------------------------------------------------------


class ConditionResultResponse(BaseModel):
    """Analysis result for one Coffman condition."""
    condition_name: str = Field(..., description="Name of the Coffman condition")
    present: bool = Field(..., description="True if the condition is present in the scenario")
    explanation: str = Field(..., description="Plain-language description of what was found")
    prevention_strategy: str = Field(
        ..., description="Standard OS technique to deny this condition"
    )
    affected_processes: List[str] = Field(
        default_factory=list,
        description="Process IDs implicated (Hold-and-Wait, Circular Wait)"
    )
    affected_resources: List[str] = Field(
        default_factory=list,
        description="Resource IDs implicated (Mutual Exclusion)"
    )


class PreventionRequest(BaseModel):
    """
    Request body for POST /api/prevention/analyze.

    Supplies the full scenario state plus the current request matrix.
    The request matrix represents what each process is CURRENTLY waiting
    for (used for circular wait detection in the wait-for graph).
    Pass a zero matrix if no process is currently blocked.
    """
    processes: List[Dict[str, Any]] = Field(
        ..., min_length=1,
        description="List of process objects, each with at least {id, name}"
    )
    resources: List[Dict[str, Any]] = Field(
        ..., min_length=1,
        description="List of resource objects, each with {id, name, total_instances}"
    )
    allocation: List[List[int]] = Field(
        ..., description="Current allocation matrix (n_processes × n_resources)"
    )
    need: List[List[int]] = Field(
        ..., description="Need matrix = Maximum − Allocation (n_processes × n_resources)"
    )
    available: List[int] = Field(
        ..., description="Currently free instances of each resource"
    )
    request_matrix: List[List[int]] = Field(
        ..., description=(
            "Current pending requests matrix (n_processes × n_resources). "
            "Use a zero matrix if no process is currently waiting."
        )
    )


class PreventionResponse(BaseModel):
    """
    Response body for POST /api/prevention/analyze.

    Contains one ConditionResultResponse per Coffman condition plus an
    overall summary.
    """
    mutual_exclusion: ConditionResultResponse
    hold_and_wait: ConditionResultResponse
    no_preemption: ConditionResultResponse
    circular_wait: ConditionResultResponse
    conditions_present: int = Field(
        ..., description="Number of the 4 Coffman conditions currently present (0–4)"
    )
    summary: str = Field(..., description="Overall plain-language conclusion")


# ---------------------------------------------------------------------------
# Deadlock Recovery
# ---------------------------------------------------------------------------


class TerminationStepResponse(BaseModel):
    """One step in a process termination recovery sequence."""
    step: int = Field(..., description="Sequential step number (0-indexed)")
    terminated_process: str = Field(..., description="Process ID that was terminated")
    reason: str = Field(..., description="Explanation of why this process was selected")
    resources_freed: List[List[int]] = Field(
        default_factory=list,
        description="List of [resource_index, amount] pairs showing what was released"
    )
    deadlock_resolved: bool = Field(
        ..., description="True if deadlock is broken after this termination"
    )
    remaining_deadlocked: List[str] = Field(
        default_factory=list,
        description="Process IDs still deadlocked after this step"
    )


class PreemptionStepResponse(BaseModel):
    """One resource preemption action."""
    victim_process: str = Field(..., description="Process ID from which resources are preempted")
    preempted_resources: List[List[int]] = Field(
        default_factory=list,
        description="List of [resource_index, amount] pairs"
    )
    reason: str = Field(..., description="Explanation of victim selection")
    requires_rollback: bool = Field(
        ..., description="True if the victim process must roll back its state"
    )
    victim_state_before: str = Field(
        default="blocked",
        description="Process state before preemption"
    )
    victim_state_after: str = Field(
        default="waiting",
        description="Process state after preemption (typically 'waiting' for rescheduling)"
    )
    rollback_checkpoint: str = Field(
        default="safe state before resource allocation",
        description="Description of the checkpoint the victim must roll back to"
    )


class RecoveryRequest(BaseModel):
    """
    Request body for POST /api/recovery/terminate and POST /api/recovery/preempt.

    Supplies the scenario state and the list of deadlocked process IDs
    (typically obtained from deadlock detection first).
    """
    processes: List[Dict[str, Any]] = Field(
        ..., min_length=1,
        description="List of process objects, each with at least {id, name, state}"
    )
    resources: List[Dict[str, Any]] = Field(
        ..., min_length=1,
        description="List of resource objects, each with {id, name, total_instances}"
    )
    allocation: List[List[int]] = Field(
        ..., description="Current allocation matrix (n_processes × n_resources)"
    )
    need: List[List[int]] = Field(
        ..., description="Need matrix (n_processes × n_resources)"
    )
    available: List[int] = Field(
        ..., description="Currently free instances of each resource"
    )
    deadlocked_pids: List[str] = Field(
        ..., min_length=1,
        description="Process IDs detected as deadlocked"
    )
    strategy: str = Field(
        default="min_resources",
        description=(
            "Recovery strategy: 'all' (terminate all), 'min_resources' (one at a time, "
            "fewest resources), 'lowest_pid' (deterministic)"
        )
    )


class RecoveryResponse(BaseModel):
    """
    Response body for POST /api/recovery/terminate and POST /api/recovery/preempt.
    """
    strategy: str = Field(..., description="Name of the recovery strategy used")
    success: bool = Field(..., description="True if deadlock was successfully resolved")
    processes_terminated: List[str] = Field(
        default_factory=list,
        description="Process IDs that were terminated (termination strategies only)"
    )
    processes_preempted: List[str] = Field(
        default_factory=list,
        description="Process IDs that had resources preempted (preemption only)"
    )
    termination_steps: List[TerminationStepResponse] = Field(
        default_factory=list,
        description="Ordered list of termination actions taken"
    )
    preemption_steps: List[PreemptionStepResponse] = Field(
        default_factory=list,
        description="Ordered list of preemption actions taken"
    )
    available_after: List[int] = Field(
        default_factory=list,
        description="Available vector after recovery actions"
    )
    allocation_after: List[List[int]] = Field(
        default_factory=list,
        description="Allocation matrix after recovery (for preemption)"
    )
    message: str = Field(..., description="Human-readable summary of the recovery outcome")
    cost_estimate: int = Field(
        ..., description="Rough estimate of recovery cost (processes affected)"
    )
