"""
DeadlockGuard – FastAPI application entry point.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.algorithms.bankers import BankersError
from app.algorithms.detection import DetectionError
from app.algorithms.need import NeedMatrixError
from app.algorithms.prevention import PreventionError
from app.algorithms.recovery import RecoveryError
from app.routers import banker, deadlock, health, prevention, recovery, scenarios

app = FastAPI(
    title="DeadlockGuard API",
    description=(
        "Backend for the DeadlockGuard Interactive Deadlock Simulator. "
        "Provides endpoints for deadlock detection, avoidance, prevention, "
        "and recovery algorithms."
    ),
    version="0.2.0",
)

# ---------------------------------------------------------------------------
# CORS — restricted to the Vite dev server origin only
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Exception handlers — map algorithm errors to HTTP 400 with the original
# message preserved in the response body, never swallowed as a 500.
# ---------------------------------------------------------------------------


@app.exception_handler(BankersError)
async def bankers_error_handler(request: Request, exc: BankersError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "BankersError", "detail": str(exc)},
    )


@app.exception_handler(DetectionError)
async def detection_error_handler(request: Request, exc: DetectionError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "DetectionError", "detail": str(exc)},
    )


@app.exception_handler(NeedMatrixError)
async def need_error_handler(request: Request, exc: NeedMatrixError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "NeedMatrixError", "detail": str(exc)},
    )


@app.exception_handler(PreventionError)
async def prevention_error_handler(request: Request, exc: PreventionError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "PreventionError", "detail": str(exc)},
    )


@app.exception_handler(RecoveryError)
async def recovery_error_handler(request: Request, exc: RecoveryError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "RecoveryError", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(banker.router)
app.include_router(deadlock.router)
app.include_router(prevention.router)
app.include_router(recovery.router)
app.include_router(scenarios.router)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/")
def root() -> dict:
    return {
        "project": "DeadlockGuard",
        "version": "0.2.0",
        "docs": "/docs",
        "health": "/api/health",
        "endpoints": {
            "safety":   "POST /api/banker/safety",
            "request":  "POST /api/banker/request",
            "detect":   "POST /api/deadlock/detect",
            "prevent":  "POST /api/prevention/analyze",
            "recover_terminate": "POST /api/recovery/terminate",
            "recover_preempt": "POST /api/recovery/preempt",
            "scenarios": "GET/POST /api/scenarios",
        },
    }
