"""
Simulation router – placeholder endpoints.
Full algorithm implementations come in later phases.
"""

from fastapi import APIRouter
from app.models.schemas import SimulationState

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.get("/state", response_model=SimulationState)
def get_simulation_state() -> SimulationState:
    """Return the current (empty) simulation state. Placeholder for Phase 2+."""
    return SimulationState(scenario=None)
