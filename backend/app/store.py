"""
DeadlockGuard – In-memory scenario store.

A plain dict keyed by scenario ID serves as storage for this phase.
All mutations go through the ScenarioStore class so the storage
implementation can be swapped out (to a database, file, etc.) later
without touching any route handlers.

Thread-safety note
------------------
FastAPI runs in a single async event loop by default, so a plain dict is
sufficient here.  If worker concurrency is added later, replace the dict
with an asyncio.Lock-protected structure or a proper persistence layer.
"""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from app.models.api import ScenarioDetailResponse, ScenarioSummary


class ScenarioStore:
    """Thin wrapper around an in-memory dict of saved scenarios."""

    def __init__(self) -> None:
        self._data: Dict[str, ScenarioDetailResponse] = {}

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def save(self, scenario: ScenarioDetailResponse) -> ScenarioDetailResponse:
        """Persist (or overwrite) a scenario.  Returns the stored object."""
        self._data[scenario.id] = scenario
        return scenario

    def delete(self, scenario_id: str) -> bool:
        """Remove a scenario.  Returns True if it existed, False otherwise."""
        if scenario_id in self._data:
            del self._data[scenario_id]
            return True
        return False

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def get(self, scenario_id: str) -> Optional[ScenarioDetailResponse]:
        """Return the scenario or None if not found."""
        return self._data.get(scenario_id)

    def list_summaries(self) -> List[ScenarioSummary]:
        """Return lightweight summaries of all stored scenarios."""
        return [
            ScenarioSummary(
                id=s.id,
                name=s.name,
                description=s.description,
                n_processes=len(s.processes),
                n_resources=len(s.resources),
            )
            for s in self._data.values()
        ]

    def count(self) -> int:
        return len(self._data)

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def clear(self) -> None:
        """Remove all scenarios.  Useful for test isolation."""
        self._data.clear()

    @staticmethod
    def new_id() -> str:
        """Generate a unique scenario ID."""
        return str(uuid.uuid4())


# Module-level singleton used by all route handlers.
# Tests can call store.clear() in their setup to get a clean slate.
store = ScenarioStore()
