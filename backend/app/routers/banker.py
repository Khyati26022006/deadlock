"""
Banker's Algorithm router.

Routes
------
    POST /api/banker/safety   – run the Safety Algorithm on a given state
    POST /api/banker/request  – attempt a resource request via Banker's

Route handlers contain NO business logic.  They only:
  1. Accept a validated Pydantic request body.
  2. Call the appropriate algorithm function.
  3. Map the dataclass result to a Pydantic response model.

Algorithm errors (BankersError, NeedMatrixError) are NOT caught here.
They propagate to the app-level exception handlers in main.py, which
produce a consistent {"error": "...", "detail": "..."} JSON envelope
for every 400 response across the entire API.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.algorithms.bankers import resource_request, safety_algorithm
from app.models.api import (
    IterationSnapshotResponse,
    ResourceRequestBody,
    ResourceRequestResponse,
    SafetyRequest,
    SafetyResponse,
)

router = APIRouter(prefix="/api/banker", tags=["banker"])


# ---------------------------------------------------------------------------
# POST /api/banker/safety
# ---------------------------------------------------------------------------


@router.post("/safety", response_model=SafetyResponse)
def run_safety_algorithm(body: SafetyRequest) -> SafetyResponse:
    """
    Run the Banker's Safety Algorithm.

    Returns SAFE/UNSAFE state, safe sequence (when safe), and a full
    step-by-step trace for educational display.
    """
    result = safety_algorithm(
        allocation=body.allocation,
        need=body.need,
        available=body.available,
    )

    return SafetyResponse(
        is_safe=result.is_safe,
        safe_sequence=result.safe_sequence,
        work_final=result.work_final,
        finish_final=result.finish_final,
        steps=[
            IterationSnapshotResponse(
                iteration=s.iteration,
                process_index=s.process_index,
                process_qualified=s.process_qualified,
                work_before=s.work_before,
                work_after=s.work_after,
                finish_vector=s.finish_vector,
                note=s.note,
            )
            for s in result.steps
        ],
        message=result.message,
    )


# ---------------------------------------------------------------------------
# POST /api/banker/request
# ---------------------------------------------------------------------------


@router.post("/request", response_model=ResourceRequestResponse)
def run_resource_request(body: ResourceRequestBody) -> ResourceRequestResponse:
    """
    Attempt to grant a resource request using the Banker's Algorithm.

    Returns whether the request was GRANTED or DENIED, the updated (or
    rolled-back) system state, and the safety result of the hypothetical state.
    """
    result = resource_request(
        process_index=body.process_index,
        request=body.request,
        allocation=body.allocation,
        need=body.need,
        available=body.available,
    )

    safety_resp: SafetyResponse | None = None
    if result.safety_result is not None:
        sr = result.safety_result
        safety_resp = SafetyResponse(
            is_safe=sr.is_safe,
            safe_sequence=sr.safe_sequence,
            work_final=sr.work_final,
            finish_final=sr.finish_final,
            steps=[
                IterationSnapshotResponse(
                    iteration=s.iteration,
                    process_index=s.process_index,
                    process_qualified=s.process_qualified,
                    work_before=s.work_before,
                    work_after=s.work_after,
                    finish_vector=s.finish_vector,
                    note=s.note,
                )
                for s in sr.steps
            ],
            message=sr.message,
        )

    return ResourceRequestResponse(
        granted=result.granted,
        reason=result.reason,
        allocation=result.allocation,
        need=result.need,
        available=result.available,
        safety=safety_resp,
    )
