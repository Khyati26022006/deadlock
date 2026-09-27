"""
Deadlock Detection router.

Routes
------
    POST /api/deadlock/detect  – run the matrix-based detection algorithm

Route handlers contain NO business logic.  They only:
  1. Accept a validated Pydantic request body.
  2. Call detect_deadlock().
  3. Map the dataclass result to a Pydantic response model.

Algorithm errors (DetectionError) are NOT caught here.
They propagate to the app-level exception handlers in main.py, which
produce a consistent {"error": "...", "detail": "..."} JSON envelope
for every 400 response across the entire API.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.algorithms.detection import detect_deadlock
from app.models.api import (
    DetectionRequest,
    DetectionResponse,
    DetectionSnapshotResponse,
)

router = APIRouter(prefix="/api/deadlock", tags=["deadlock"])


# ---------------------------------------------------------------------------
# POST /api/deadlock/detect
# ---------------------------------------------------------------------------


@router.post("/detect", response_model=DetectionResponse)
def run_detect_deadlock(body: DetectionRequest) -> DetectionResponse:
    """
    Run the matrix-based deadlock detection algorithm.

    Returns NO_DEADLOCK or DEADLOCKED, the list of deadlocked processes,
    and a full step-by-step trace.
    """
    result = detect_deadlock(
        allocation=body.allocation,
        request=body.request,
        available=body.available,
    )

    return DetectionResponse(
        deadlock_detected=result.deadlock_detected,
        deadlocked_processes=result.deadlocked_processes,
        completed_processes=result.completed_processes,
        work_final=result.work_final,
        finish_final=result.finish_final,
        steps=[
            DetectionSnapshotResponse(
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
