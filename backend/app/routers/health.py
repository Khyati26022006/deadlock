"""
Health-check router.
"""

from fastapi import APIRouter
from app.models.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return the current health status of the backend."""
    return HealthResponse(
        status="ok",
        message="DeadlockGuard backend is running",
        version="0.1.0",
    )
