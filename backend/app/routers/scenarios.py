"""
Scenarios router.

Routes
------
    POST /api/scenarios          – create and save a new scenario
    GET  /api/scenarios          – list all saved scenarios (summaries)
    GET  /api/scenarios/{id}     – retrieve one scenario by ID

Scenario storage is in-memory (app.store.store singleton).
The need matrix is computed automatically from maximum − allocation when
a scenario is saved, so the client only needs to supply allocation + maximum.

Algorithm errors (NeedMatrixError) are NOT caught here.
They propagate to the app-level exception handlers in main.py, which
produce a consistent {"error": "...", "detail": "..."} JSON envelope
for every 400 response across the entire API.

The 404 HTTPException on get_scenario is kept because it is an HTTP
concern (resource not found), not an algorithm error.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.algorithms.need import calculate_need_matrix
from app.models.api import (
    ScenarioCreateRequest,
    ScenarioDetailResponse,
    ScenarioListResponse,
)
from app.store import store

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


# ---------------------------------------------------------------------------
# POST /api/scenarios
# ---------------------------------------------------------------------------


@router.post("", response_model=ScenarioDetailResponse, status_code=201)
def create_scenario(body: ScenarioCreateRequest) -> ScenarioDetailResponse:
    """
    Create and save a new scenario.

    The need matrix is derived automatically: Need = Maximum − Allocation.
    Returns the full scenario including its server-assigned ID.
    """
    # NeedMatrixError propagates to the app-level handler if invalid
    need = calculate_need_matrix(
        allocation=body.allocation,
        maximum=body.maximum,
    )

    scenario_id = store.new_id()

    scenario = ScenarioDetailResponse(
        id=scenario_id,
        name=body.name,
        description=body.description,
        processes=body.processes,
        resources=body.resources,
        allocation=body.allocation,
        maximum=body.maximum,
        need=need,
        available=body.available,
    )

    store.save(scenario)
    return scenario


# ---------------------------------------------------------------------------
# GET /api/scenarios
# ---------------------------------------------------------------------------


@router.get("", response_model=ScenarioListResponse)
def list_scenarios() -> ScenarioListResponse:
    """Return lightweight summaries of all saved scenarios."""
    summaries = store.list_summaries()
    return ScenarioListResponse(scenarios=summaries, total=len(summaries))


# ---------------------------------------------------------------------------
# GET /api/scenarios/{scenario_id}
# ---------------------------------------------------------------------------


@router.get("/{scenario_id}", response_model=ScenarioDetailResponse)
def get_scenario(scenario_id: str) -> ScenarioDetailResponse:
    """Retrieve a single scenario by its ID."""
    scenario = store.get(scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario_id}' not found.",
        )
    return scenario
