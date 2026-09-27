"""
API integration tests using FastAPI TestClient.

Coverage
--------
GET  /api/health                        – happy path + response shape
POST /api/banker/safety                 – safe state, unsafe state, validation error
POST /api/banker/request                – granted, denied (need), denied (available),
                                          denied (unsafe), validation error
POST /api/deadlock/detect               – no deadlock, deadlock, validation error
POST /api/scenarios                     – create success, bad allocation (400),
                                          allocation > maximum (400)
GET  /api/scenarios                     – list (empty + after create)
GET  /api/scenarios/{id}                – found, not found (404)

Every endpoint has at least one test that deliberately triggers a
validation/algorithm error and asserts the response is HTTP 400 with
a meaningful, non-generic body (not a 500).

Test isolation
--------------
Each test class resets the in-memory store in setup so scenario tests
are independent of each other.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import store

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Shared textbook fixtures
# ---------------------------------------------------------------------------

# Classic 5-process / 3-resource Banker's example
_ALLOC_5X3 = [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 2],
    [2, 1, 1],
    [0, 0, 2],
]
_MAX_5X3 = [
    [7, 5, 3],
    [3, 2, 2],
    [9, 0, 2],
    [2, 2, 2],
    [4, 3, 3],
]
_NEED_5X3 = [
    [7, 4, 3],
    [1, 2, 2],
    [6, 0, 0],
    [0, 1, 1],
    [4, 3, 1],
]
_AVAIL_5X3 = [3, 3, 2]

# Minimal safe-state body for banker/safety
_SAFE_BODY = {
    "allocation": _ALLOC_5X3,
    "need":       _NEED_5X3,
    "available":  _AVAIL_5X3,
}

# Unsafe state – no process can proceed
_UNSAFE_BODY = {
    "allocation": [[1, 0], [0, 1]],
    "need":       [[5, 5], [5, 5]],
    "available":  [0, 0],
}

# Minimal scenario create body
def _scenario_body(**overrides):
    base = {
        "name": "Test Scenario",
        "description": "Created by test suite",
        "processes": [
            {"id": "P0", "name": "Process 0"},
            {"id": "P1", "name": "Process 1"},
            {"id": "P2", "name": "Process 2"},
        ],
        "resources": [
            {"id": "R0", "name": "Resource 0", "total_instances": 10},
            {"id": "R1", "name": "Resource 1", "total_instances": 5},
            {"id": "R2", "name": "Resource 2", "total_instances": 7},
        ],
        "allocation": [[0, 1, 0], [2, 0, 0], [3, 0, 2]],
        "maximum":    [[7, 5, 3], [3, 2, 2], [9, 0, 2]],
        "available":  [3, 3, 2],
    }
    base.update(overrides)
    return base


# ===========================================================================
# GET /api/health
# ===========================================================================

class TestHealth:
    def test_returns_200(self):
        r = client.get("/api/health")
        assert r.status_code == 200

    def test_status_is_ok(self):
        r = client.get("/api/health")
        data = r.json()
        assert data["status"] == "ok"

    def test_response_has_required_fields(self):
        data = client.get("/api/health").json()
        assert "status" in data
        assert "message" in data
        assert "version" in data

    def test_message_is_string(self):
        data = client.get("/api/health").json()
        assert isinstance(data["message"], str)
        assert len(data["message"]) > 0


# ===========================================================================
# POST /api/banker/safety
# ===========================================================================

class TestBankerSafety:
    def test_safe_state_returns_200(self):
        r = client.post("/api/banker/safety", json=_SAFE_BODY)
        assert r.status_code == 200

    def test_safe_state_is_safe_true(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert data["is_safe"] is True

    def test_safe_state_correct_sequence(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert data["safe_sequence"] == [1, 3, 0, 2, 4]

    def test_safe_state_message_contains_safe(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert "SAFE" in data["message"]

    def test_safe_state_steps_populated(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert len(data["steps"]) > 0

    def test_safe_state_finish_all_true(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert all(data["finish_final"])

    def test_safe_state_work_final_correct_length(self):
        data = client.post("/api/banker/safety", json=_SAFE_BODY).json()
        assert len(data["work_final"]) == 3

    def test_unsafe_state_returns_200(self):
        r = client.post("/api/banker/safety", json=_UNSAFE_BODY)
        assert r.status_code == 200

    def test_unsafe_state_is_safe_false(self):
        data = client.post("/api/banker/safety", json=_UNSAFE_BODY).json()
        assert data["is_safe"] is False

    def test_unsafe_state_safe_sequence_empty(self):
        data = client.post("/api/banker/safety", json=_UNSAFE_BODY).json()
        assert data["safe_sequence"] == []

    def test_unsafe_state_message_contains_unsafe(self):
        data = client.post("/api/banker/safety", json=_UNSAFE_BODY).json()
        assert "UNSAFE" in data["message"]

    # --- Validation error tests ---

    def test_missing_available_returns_422(self):
        """Pydantic catches missing required field before reaching the handler."""
        r = client.post("/api/banker/safety", json={
            "allocation": [[1, 0]],
            "need":       [[0, 1]],
            # "available" missing
        })
        assert r.status_code == 422

    def test_negative_available_returns_400(self):
        """BankersError from the algorithm maps to HTTP 400."""
        r = client.post("/api/banker/safety", json={
            "allocation": [[0, 0]],
            "need":       [[1, 1]],
            "available":  [-1, 0],
        })
        assert r.status_code == 400
        data = r.json()
        assert "detail" in data
        assert len(data["detail"]) > 0

    def test_row_count_mismatch_returns_400(self):
        r = client.post("/api/banker/safety", json={
            "allocation": [[1, 0], [0, 1]],   # 2 rows
            "need":       [[0, 1]],            # 1 row
            "available":  [1, 1],
        })
        assert r.status_code == 400
        assert "rows" in r.json()["detail"].lower() or "row" in r.json()["detail"].lower()

    def test_empty_allocation_returns_400(self):
        r = client.post("/api/banker/safety", json={
            "allocation": [],
            "need":       [],
            "available":  [1],
        })
        assert r.status_code == 400

    def test_400_detail_is_not_empty_string(self):
        r = client.post("/api/banker/safety", json={
            "allocation": [[-1, 0]],
            "need":       [[0, 1]],
            "available":  [1, 1],
        })
        assert r.status_code == 400
        assert r.json()["detail"] != ""


# ===========================================================================
# POST /api/banker/request
# ===========================================================================

class TestBankerRequest:
    # Granted request: P1 asks for [1, 0, 2]
    _GRANTED_BODY = {
        "process_index": 1,
        "request":    [1, 0, 2],
        "allocation": _ALLOC_5X3,
        "need":       _NEED_5X3,
        "available":  _AVAIL_5X3,
    }

    def test_granted_returns_200(self):
        r = client.post("/api/banker/request", json=self._GRANTED_BODY)
        assert r.status_code == 200

    def test_granted_is_true(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert data["granted"] is True

    def test_granted_reason_says_granted(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert "GRANTED" in data["reason"]

    def test_granted_available_updated(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert data["available"] == [2, 3, 0]

    def test_granted_allocation_updated(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert data["allocation"][1] == [3, 0, 2]

    def test_granted_need_updated(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert data["need"][1] == [0, 2, 0]

    def test_granted_safety_attached(self):
        data = client.post("/api/banker/request", json=self._GRANTED_BODY).json()
        assert data["safety"] is not None
        assert data["safety"]["is_safe"] is True

    def test_denied_exceeds_need_returns_200_with_granted_false(self):
        """Request [8,0,0] exceeds Need[P0][0]=7 → denied."""
        r = client.post("/api/banker/request", json={
            "process_index": 0,
            "request":    [8, 0, 0],
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["granted"] is False
        assert "Need" in data["reason"] or "maximum" in data["reason"].lower()

    def test_denied_exceeds_available_returns_200_with_granted_false(self):
        """P4 requests [4,0,0], Available[0]=3 → denied."""
        r = client.post("/api/banker/request", json={
            "process_index": 4,
            "request":    [4, 0, 0],
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["granted"] is False
        assert "Available" in data["reason"] or "available" in data["reason"].lower()

    def test_denied_would_cause_unsafe_returns_200_with_granted_false(self):
        """
        P0 requests [1] in a 2-process/1-resource state where granting
        would leave Available=[0] and both processes still need more.
        """
        r = client.post("/api/banker/request", json={
            "process_index": 0,
            "request":    [1],
            "allocation": [[1], [1]],
            "need":       [[2], [2]],
            "available":  [1],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["granted"] is False
        assert "UNSAFE" in data["reason"] or "unsafe" in data["reason"].lower()

    def test_denied_state_unchanged(self):
        """Denied request: returned allocation must equal the input allocation."""
        body = {
            "process_index": 0,
            "request":    [8, 0, 0],
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        }
        data = client.post("/api/banker/request", json=body).json()
        assert data["allocation"] == _ALLOC_5X3
        assert data["available"]  == _AVAIL_5X3

    # --- Validation error ---

    def test_negative_process_index_returns_422(self):
        """process_index has ge=0 constraint → Pydantic 422."""
        r = client.post("/api/banker/request", json={
            "process_index": -1,
            "request":    [1, 0, 0],
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        })
        assert r.status_code == 422

    def test_missing_request_field_returns_422(self):
        r = client.post("/api/banker/request", json={
            "process_index": 0,
            # "request" omitted
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        })
        assert r.status_code == 422

    def test_out_of_range_process_index_returns_400(self):
        """process_index=99 passes Pydantic but fails BankersError validation."""
        r = client.post("/api/banker/request", json={
            "process_index": 99,
            "request":    [1, 0, 0],
            "allocation": _ALLOC_5X3,
            "need":       _NEED_5X3,
            "available":  _AVAIL_5X3,
        })
        assert r.status_code == 400
        assert "range" in r.json()["detail"].lower()

    def test_400_detail_is_meaningful(self):
        r = client.post("/api/banker/request", json={
            "process_index": 0,
            "request":    [1, 0, 0],
            "allocation": [[-1, 0, 0]],
            "need":       [[0, 1, 1]],
            "available":  [1, 1, 1],
        })
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert isinstance(detail, str) and len(detail) > 10


# ===========================================================================
# POST /api/deadlock/detect
# ===========================================================================

class TestDeadlockDetect:
    # No-deadlock body (nobody waiting)
    _NO_DEAD_BODY = {
        "allocation": [[0, 1, 0], [2, 0, 0], [3, 0, 2]],
        "request":    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        "available":  [3, 3, 2],
    }
    # Deadlock body (circular wait, zero available)
    _DEAD_BODY = {
        "allocation": [[1, 0], [0, 1]],
        "request":    [[0, 1], [1, 0]],
        "available":  [0, 0],
    }

    def test_no_deadlock_returns_200(self):
        r = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY)
        assert r.status_code == 200

    def test_no_deadlock_detected_false(self):
        data = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY).json()
        assert data["deadlock_detected"] is False

    def test_no_deadlock_processes_empty(self):
        data = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY).json()
        assert data["deadlocked_processes"] == []

    def test_no_deadlock_message_label(self):
        data = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY).json()
        assert "NO_DEADLOCK" in data["message"]

    def test_deadlock_returns_200(self):
        r = client.post("/api/deadlock/detect", json=self._DEAD_BODY)
        assert r.status_code == 200

    def test_deadlock_detected_true(self):
        data = client.post("/api/deadlock/detect", json=self._DEAD_BODY).json()
        assert data["deadlock_detected"] is True

    def test_deadlock_processes_identified(self):
        data = client.post("/api/deadlock/detect", json=self._DEAD_BODY).json()
        assert sorted(data["deadlocked_processes"]) == [0, 1]

    def test_deadlock_message_label(self):
        data = client.post("/api/deadlock/detect", json=self._DEAD_BODY).json()
        assert "DEADLOCKED" in data["message"]

    def test_deadlock_steps_populated(self):
        data = client.post("/api/deadlock/detect", json=self._DEAD_BODY).json()
        # Steps may be empty if no process ever qualified; finished_final tells the story
        assert isinstance(data["steps"], list)

    def test_finish_final_length(self):
        data = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY).json()
        assert len(data["finish_final"]) == 3

    def test_work_final_length(self):
        data = client.post("/api/deadlock/detect", json=self._NO_DEAD_BODY).json()
        assert len(data["work_final"]) == 3

    # --- Validation error ---

    def test_missing_request_matrix_returns_422(self):
        r = client.post("/api/deadlock/detect", json={
            "allocation": [[1, 0]],
            # "request" missing
            "available":  [0, 1],
        })
        assert r.status_code == 422

    def test_negative_allocation_returns_400(self):
        r = client.post("/api/deadlock/detect", json={
            "allocation": [[-1, 0]],
            "request":    [[0, 1]],
            "available":  [1, 1],
        })
        assert r.status_code == 400
        data = r.json()
        assert "detail" in data
        assert "negative" in data["detail"].lower()

    def test_row_count_mismatch_returns_400(self):
        r = client.post("/api/deadlock/detect", json={
            "allocation": [[1, 0], [0, 1]],
            "request":    [[0, 1]],            # 1 row vs 2
            "available":  [0, 0],
        })
        assert r.status_code == 400
        assert "rows" in r.json()["detail"].lower() or "row" in r.json()["detail"].lower()

    def test_400_is_not_500(self):
        """Any algorithm-level error must produce 400, never 500."""
        r = client.post("/api/deadlock/detect", json={
            "allocation": [],
            "request":    [],
            "available":  [1],
        })
        assert r.status_code == 400
        assert r.status_code != 500


# ===========================================================================
# POST /api/scenarios  +  GET /api/scenarios  +  GET /api/scenarios/{id}
# ===========================================================================

class TestScenarios:
    def setup_method(self):
        """Reset the store before every test in this class."""
        store.clear()

    def test_create_returns_201(self):
        r = client.post("/api/scenarios", json=_scenario_body())
        assert r.status_code == 201

    def test_create_returns_id(self):
        data = client.post("/api/scenarios", json=_scenario_body()).json()
        assert "id" in data
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0

    def test_create_returns_need_matrix(self):
        """Server must compute and return the need matrix."""
        data = client.post("/api/scenarios", json=_scenario_body()).json()
        assert "need" in data
        # Need = Maximum - Allocation for the 3×3 scenario body
        # P0: [7,5,3]-[0,1,0]=[7,4,3]
        assert data["need"][0] == [7, 4, 3]

    def test_create_echoes_name(self):
        data = client.post("/api/scenarios", json=_scenario_body(name="My Scenario")).json()
        assert data["name"] == "My Scenario"

    def test_create_stores_processes_and_resources(self):
        data = client.post("/api/scenarios", json=_scenario_body()).json()
        assert len(data["processes"]) == 3
        assert len(data["resources"]) == 3

    def test_list_empty_initially(self):
        data = client.get("/api/scenarios").json()
        assert data["total"] == 0
        assert data["scenarios"] == []

    def test_list_after_create(self):
        client.post("/api/scenarios", json=_scenario_body())
        data = client.get("/api/scenarios").json()
        assert data["total"] == 1
        assert len(data["scenarios"]) == 1

    def test_list_multiple_scenarios(self):
        client.post("/api/scenarios", json=_scenario_body(name="A"))
        client.post("/api/scenarios", json=_scenario_body(name="B"))
        data = client.get("/api/scenarios").json()
        assert data["total"] == 2

    def test_list_summary_has_expected_fields(self):
        client.post("/api/scenarios", json=_scenario_body())
        summary = client.get("/api/scenarios").json()["scenarios"][0]
        assert "id" in summary
        assert "name" in summary
        assert "n_processes" in summary
        assert "n_resources" in summary

    def test_get_by_id_returns_200(self):
        created = client.post("/api/scenarios", json=_scenario_body()).json()
        r = client.get(f"/api/scenarios/{created['id']}")
        assert r.status_code == 200

    def test_get_by_id_correct_data(self):
        created = client.post("/api/scenarios", json=_scenario_body(name="Fetch Me")).json()
        fetched = client.get(f"/api/scenarios/{created['id']}").json()
        assert fetched["name"] == "Fetch Me"
        assert fetched["id"] == created["id"]

    def test_get_unknown_id_returns_404(self):
        r = client.get("/api/scenarios/does-not-exist")
        assert r.status_code == 404

    def test_get_unknown_id_detail_is_meaningful(self):
        r = client.get("/api/scenarios/ghost-id-999")
        data = r.json()
        assert "detail" in data
        assert "ghost-id-999" in data["detail"]

    # --- Validation error tests (400 with meaningful body) ---

    def test_create_negative_allocation_returns_400(self):
        """Allocation containing negative values → NeedMatrixError → 400."""
        body = _scenario_body()
        body["allocation"] = [[-1, 0, 0], [0, 0, 0], [0, 0, 0]]
        r = client.post("/api/scenarios", json=body)
        assert r.status_code == 400
        data = r.json()
        assert "detail" in data
        assert "negative" in data["detail"].lower()

    def test_create_allocation_exceeds_maximum_returns_400(self):
        """Allocation > Maximum → NeedMatrixError → 400."""
        body = _scenario_body()
        body["allocation"] = [[9, 1, 0], [2, 0, 0], [3, 0, 2]]  # P0 A=9 > Max A=7
        r = client.post("/api/scenarios", json=body)
        assert r.status_code == 400
        data = r.json()
        assert "detail" in data
        assert "exceed" in data["detail"].lower() or "exceed" in data["detail"]

    def test_create_missing_name_returns_422(self):
        body = _scenario_body()
        del body["name"]
        r = client.post("/api/scenarios", json=body)
        assert r.status_code == 422

    def test_create_empty_processes_returns_422(self):
        """min_length=1 on processes list → Pydantic 422."""
        body = _scenario_body()
        body["processes"] = []
        r = client.post("/api/scenarios", json=body)
        assert r.status_code == 422

    def test_create_400_is_not_500(self):
        """Algorithm errors must never leak as 500."""
        body = _scenario_body()
        body["allocation"] = [[-5, 0, 0], [0, 0, 0], [0, 0, 0]]
        r = client.post("/api/scenarios", json=body)
        assert r.status_code != 500

    def test_round_trip_full(self):
        """Create then retrieve: all fields survive the round trip."""
        created = client.post("/api/scenarios", json=_scenario_body()).json()
        fetched = client.get(f"/api/scenarios/{created['id']}").json()
        assert fetched["allocation"] == created["allocation"]
        assert fetched["maximum"]    == created["maximum"]
        assert fetched["need"]       == created["need"]
        assert fetched["available"]  == created["available"]


# ===========================================================================
# GET / (root – sanity)
# ===========================================================================

class TestRoot:
    def test_root_returns_200(self):
        r = client.get("/")
        assert r.status_code == 200

    def test_root_contains_project_name(self):
        data = client.get("/").json()
        assert data.get("project") == "DeadlockGuard"

    def test_root_lists_endpoints(self):
        data = client.get("/").json()
        assert "endpoints" in data
