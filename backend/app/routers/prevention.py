"""
Deadlock Prevention router.

Routes
------
    POST /api/prevention/analyze  – analyse all four Coffman conditions

Route handlers contain NO business logic.  They only:
  1. Accept a validated Pydantic request body.
  2. Call analyze_prevention().
  3. Map the dataclass result to a Pydantic response model.

Algorithm errors (PreventionError) are NOT caught here.
They propagate to the app-level exception handler registered in main.py,
which produces a consistent {"error": "...", "detail": "..."} envelope.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.algorithms.prevention import analyze_prevention
from app.models.api import (
    ConditionResultResponse,
    PreventionRequest,
    PreventionResponse,
)

router = APIRouter(prefix="/api/prevention", tags=["prevention"])


def _condition_to_response(c) -> ConditionResultResponse:
    """Map a ConditionResult dataclass to its Pydantic response model."""
    return ConditionResultResponse(
        condition_name=c.condition_name,
        present=c.present,
        explanation=c.explanation,
        prevention_strategy=c.prevention_strategy,
        affected_processes=c.affected_processes,
        affected_resources=c.affected_resources,
    )


# ---------------------------------------------------------------------------
# POST /api/prevention/analyze
# ---------------------------------------------------------------------------


@router.post("/analyze", response_model=PreventionResponse)
def run_prevention_analysis(body: PreventionRequest) -> PreventionResponse:
    """
    Analyse all four Coffman conditions for the supplied scenario state.

    Returns one result per condition (present flag, explanation, prevention
    strategy) plus an overall summary and count of conditions present.
    """
    result = analyze_prevention(
        processes=body.processes,
        resources=body.resources,
        allocation=body.allocation,
        need=body.need,
        available=body.available,
        request_matrix=body.request_matrix,
    )

    return PreventionResponse(
        mutual_exclusion=_condition_to_response(result.mutual_exclusion),
        hold_and_wait=_condition_to_response(result.hold_and_wait),
        no_preemption=_condition_to_response(result.no_preemption),
        circular_wait=_condition_to_response(result.circular_wait),
        conditions_present=result.conditions_present,
        summary=result.summary,
    )
