"""
Deadlock Recovery router.

Routes
------
    POST /api/recovery/terminate  – abort deadlocked processes to break the cycle
    POST /api/recovery/preempt    – preempt resources from deadlocked processes

Route handlers contain NO business logic.  They only:
  1. Accept a validated Pydantic request body.
  2. Call the appropriate recovery function.
  3. Map the dataclass result to a Pydantic response model.

Algorithm errors (RecoveryError) are NOT caught here.
They propagate to the app-level exception handlers in main.py, which
produce a consistent {"error": "...", "detail": "..."} JSON envelope
for every 400 response across the entire API.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.algorithms.recovery import (
    terminate_all_deadlocked,
    terminate_one_at_a_time,
    preempt_resources,
)
from app.models.api import (
    RecoveryRequest,
    RecoveryResponse,
    TerminationStepResponse,
    PreemptionStepResponse,
)

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


# ---------------------------------------------------------------------------
# POST /api/recovery/terminate
# ---------------------------------------------------------------------------


@router.post("/terminate", response_model=RecoveryResponse)
def run_terminate_recovery(body: RecoveryRequest) -> RecoveryResponse:
    """
    Break deadlock by terminating one or more processes.

    Strategy options:
    - "all": terminate all deadlocked processes at once (brute force)
    - "min_resources": terminate one at a time, choosing process with fewest resources
    - "lowest_pid": terminate one at a time, choosing process with lowest ID

    Returns the list of terminated processes, step-by-step trace, and
    updated resource availability after recovery.
    """
    # Build scenario dict for algorithm layer
    scenario = {
        "processes": body.processes,
        "resources": body.resources,
        "allocation": body.allocation,
        "need": body.need,
        "available": body.available,
    }

    # Select appropriate strategy
    if body.strategy == "all":
        result = terminate_all_deadlocked(
            scenario=scenario,
            deadlocked_pids=body.deadlocked_pids,
        )
    else:
        # Default to one-at-a-time with specified strategy
        result = terminate_one_at_a_time(
            scenario=scenario,
            deadlocked_pids=body.deadlocked_pids,
            strategy=body.strategy,
        )

    return RecoveryResponse(
        strategy=result.strategy,
        success=result.success,
        processes_terminated=result.processes_terminated,
        processes_preempted=result.processes_preempted,
        termination_steps=[
            TerminationStepResponse(
                step=s.step,
                terminated_process=s.terminated_process,
                reason=s.reason,
                resources_freed=[[j, amt] for j, amt in s.resources_freed],
                deadlock_resolved=s.deadlock_resolved,
                remaining_deadlocked=s.remaining_deadlocked,
            )
            for s in result.termination_steps
        ],
        preemption_steps=[],
        available_after=result.available_after,
        allocation_after=result.allocation_after,
        message=result.message,
        cost_estimate=result.cost_estimate,
    )


# ---------------------------------------------------------------------------
# POST /api/recovery/preempt
# ---------------------------------------------------------------------------


@router.post("/preempt", response_model=RecoveryResponse)
def run_preempt_recovery(body: RecoveryRequest) -> RecoveryResponse:
    """
    Break deadlock by preempting resources from victim processes.

    Preemption is less drastic than termination: processes are not killed,
    but they lose resources and must roll back to a safe state.

    Strategy options:
    - "min_resources": preempt from process holding fewest resources
    - "lowest_pid": preempt from process with lowest ID (deterministic)

    Returns the list of victim processes, resources preempted, and
    updated allocation/availability after recovery.
    """
    # Build scenario dict for algorithm layer
    scenario = {
        "processes": body.processes,
        "resources": body.resources,
        "allocation": body.allocation,
        "need": body.need,
        "available": body.available,
    }

    result = preempt_resources(
        scenario=scenario,
        deadlocked_pids=body.deadlocked_pids,
        strategy=body.strategy,
    )

    return RecoveryResponse(
        strategy=result.strategy,
        success=result.success,
        processes_terminated=result.processes_terminated,
        processes_preempted=result.processes_preempted,
        termination_steps=[],
        preemption_steps=[
            PreemptionStepResponse(
                victim_process=s.victim_process,
                preempted_resources=[[j, amt] for j, amt in s.preempted_resources],
                reason=s.reason,
                requires_rollback=s.requires_rollback,
                victim_state_before=s.victim_state_before,
                victim_state_after=s.victim_state_after,
                rollback_checkpoint=s.rollback_checkpoint,
            )
            for s in result.preemption_steps
        ],
        available_after=result.available_after,
        allocation_after=result.allocation_after,
        message=result.message,
        cost_estimate=result.cost_estimate,
    )
