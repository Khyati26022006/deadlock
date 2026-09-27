"""
Unit tests for DeadlockGuard Pydantic schemas.

Coverage:
  Process         – valid construction, all ProcessState values
  Resource        – valid construction, total_instances ≥ 1
  AllocationMatrix – non-negative values, uniform row lengths
  MaximumMatrix   – non-negative values, uniform row lengths
  NeedMatrix      – non-negative values, uniform row lengths
  AvailableVector – non-negative values
  ResourceRequest – non-negative amounts, process_id field
  Scenario        – happy path, dimension mismatches, allocation > maximum,
                    need ≠ maximum − allocation, empty process/resource lists
  AlgorithmResult – default fields, all explicit fields
  HealthResponse  – simple construction
  SimulationState – None scenario and scenario-populated
"""

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    AlgorithmResult,
    AllocationMatrix,
    AvailableVector,
    HealthResponse,
    MaximumMatrix,
    NeedMatrix,
    Process,
    ProcessState,
    Resource,
    ResourceRequest,
    Scenario,
    SimulationState,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def make_scenario(
    *,
    processes=None,
    resources=None,
    allocation=None,
    maximum=None,
    need=None,
    available=None,
) -> dict:
    """
    Return keyword arguments for a 3-process × 3-resource Banker's example
    (classic textbook instance).  Any argument can be overridden.

    Processes: P0, P1, P2
    Resources: R0 (10), R1 (5), R2 (7)

    Allocation:          Maximum:           Need (= Max - Alloc):
      P0  0 1 0          P0  7 5 3           P0  7 4 3
      P1  2 0 0          P1  3 2 2           P1  1 2 2
      P2  3 0 2          P2  9 0 2           P2  6 0 0

    Available: [3, 3, 2]  (Total - sum of Allocation columns)
    """
    return {
        "id": "scenario-1",
        "name": "Classic Banker Example",
        "processes": processes
        or [
            {"id": "P0", "name": "Process 0"},
            {"id": "P1", "name": "Process 1"},
            {"id": "P2", "name": "Process 2"},
        ],
        "resources": resources
        or [
            {"id": "R0", "name": "Resource 0", "total_instances": 10},
            {"id": "R1", "name": "Resource 1", "total_instances": 5},
            {"id": "R2", "name": "Resource 2", "total_instances": 7},
        ],
        "allocation": {"matrix": allocation or [[0, 1, 0], [2, 0, 0], [3, 0, 2]]},
        "maximum": {"matrix": maximum or [[7, 5, 3], [3, 2, 2], [9, 0, 2]]},
        "need": {"matrix": need or [[7, 4, 3], [1, 2, 2], [6, 0, 0]]},
        "available": {"vector": available or [3, 3, 2]},
    }


# ---------------------------------------------------------------------------
# ProcessState
# ---------------------------------------------------------------------------


class TestProcessState:
    def test_all_values_exist(self):
        assert ProcessState.RUNNING == "running"
        assert ProcessState.WAITING == "waiting"
        assert ProcessState.BLOCKED == "blocked"
        assert ProcessState.TERMINATED == "terminated"

    def test_is_string_enum(self):
        assert isinstance(ProcessState.RUNNING, str)


# ---------------------------------------------------------------------------
# Process
# ---------------------------------------------------------------------------


class TestProcess:
    def test_valid_construction(self):
        p = Process(id="P0", name="Process 0")
        assert p.id == "P0"
        assert p.name == "Process 0"
        assert p.state == ProcessState.RUNNING  # default

    def test_explicit_state(self):
        p = Process(id="P1", name="Process 1", state=ProcessState.BLOCKED)
        assert p.state == ProcessState.BLOCKED

    def test_all_states_accepted(self):
        for state in ProcessState:
            p = Process(id="P0", name="P", state=state)
            assert p.state == state

    def test_missing_id_raises(self):
        with pytest.raises(ValidationError):
            Process(name="No ID")

    def test_missing_name_raises(self):
        with pytest.raises(ValidationError):
            Process(id="P0")

    def test_invalid_state_raises(self):
        with pytest.raises(ValidationError):
            Process(id="P0", name="P", state="flying")


# ---------------------------------------------------------------------------
# Resource
# ---------------------------------------------------------------------------


class TestResource:
    def test_valid_construction(self):
        r = Resource(id="R0", name="Printer", total_instances=3)
        assert r.id == "R0"
        assert r.name == "Printer"
        assert r.total_instances == 3

    def test_single_instance_ok(self):
        r = Resource(id="R0", name="R", total_instances=1)
        assert r.total_instances == 1

    def test_zero_instances_raises(self):
        with pytest.raises(ValidationError):
            Resource(id="R0", name="R", total_instances=0)

    def test_negative_instances_raises(self):
        with pytest.raises(ValidationError):
            Resource(id="R0", name="R", total_instances=-1)

    def test_missing_id_raises(self):
        with pytest.raises(ValidationError):
            Resource(name="R", total_instances=1)

    def test_missing_total_instances_raises(self):
        with pytest.raises(ValidationError):
            Resource(id="R0", name="R")


# ---------------------------------------------------------------------------
# AllocationMatrix
# ---------------------------------------------------------------------------


class TestAllocationMatrix:
    def test_valid_matrix(self):
        m = AllocationMatrix(matrix=[[0, 1, 0], [2, 0, 0]])
        assert m.matrix[0][1] == 1

    def test_zero_matrix(self):
        m = AllocationMatrix(matrix=[[0, 0], [0, 0], [0, 0]])
        assert m.matrix[2][1] == 0

    def test_single_cell(self):
        m = AllocationMatrix(matrix=[[5]])
        assert m.matrix[0][0] == 5

    def test_empty_matrix_ok(self):
        # Empty is allowed at the matrix level; Scenario enforces non-empty
        m = AllocationMatrix(matrix=[])
        assert m.matrix == []

    def test_negative_value_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            AllocationMatrix(matrix=[[0, -1], [2, 0]])

    def test_negative_in_first_cell_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            AllocationMatrix(matrix=[[-1, 0]])

    def test_jagged_rows_raise(self):
        with pytest.raises(ValidationError, match="equal length"):
            AllocationMatrix(matrix=[[1, 2], [3]])


# ---------------------------------------------------------------------------
# MaximumMatrix
# ---------------------------------------------------------------------------


class TestMaximumMatrix:
    def test_valid_matrix(self):
        m = MaximumMatrix(matrix=[[7, 5, 3], [3, 2, 2]])
        assert m.matrix[0][0] == 7

    def test_negative_value_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            MaximumMatrix(matrix=[[7, -5, 3]])

    def test_jagged_rows_raise(self):
        with pytest.raises(ValidationError, match="equal length"):
            MaximumMatrix(matrix=[[1, 2, 3], [4, 5]])


# ---------------------------------------------------------------------------
# NeedMatrix
# ---------------------------------------------------------------------------


class TestNeedMatrix:
    def test_valid_matrix(self):
        m = NeedMatrix(matrix=[[7, 4, 3], [1, 2, 2]])
        assert m.matrix[1][2] == 2

    def test_zero_need_ok(self):
        m = NeedMatrix(matrix=[[0, 0], [0, 0]])
        assert m.matrix[0][0] == 0

    def test_negative_value_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            NeedMatrix(matrix=[[7, 4, -1]])

    def test_jagged_rows_raise(self):
        with pytest.raises(ValidationError, match="equal length"):
            NeedMatrix(matrix=[[1, 2], [3, 4, 5]])


# ---------------------------------------------------------------------------
# AvailableVector
# ---------------------------------------------------------------------------


class TestAvailableVector:
    def test_valid_vector(self):
        v = AvailableVector(vector=[3, 3, 2])
        assert v.vector == [3, 3, 2]

    def test_zeros_ok(self):
        v = AvailableVector(vector=[0, 0, 0])
        assert v.vector == [0, 0, 0]

    def test_single_element_ok(self):
        v = AvailableVector(vector=[5])
        assert v.vector[0] == 5

    def test_negative_value_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            AvailableVector(vector=[3, -1, 2])

    def test_first_element_negative_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            AvailableVector(vector=[-1, 2])

    def test_missing_vector_raises(self):
        with pytest.raises(ValidationError):
            AvailableVector()


# ---------------------------------------------------------------------------
# ResourceRequest
# ---------------------------------------------------------------------------


class TestResourceRequest:
    def test_valid_request(self):
        rr = ResourceRequest(process_id="P1", amounts=[1, 0, 2])
        assert rr.process_id == "P1"
        assert rr.amounts == [1, 0, 2]

    def test_zero_amounts_ok(self):
        rr = ResourceRequest(process_id="P0", amounts=[0, 0, 0])
        assert rr.amounts == [0, 0, 0]

    def test_negative_amount_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            ResourceRequest(process_id="P0", amounts=[1, -1, 0])

    def test_first_amount_negative_raises(self):
        with pytest.raises(ValidationError, match="negative"):
            ResourceRequest(process_id="P0", amounts=[-5, 0])

    def test_missing_process_id_raises(self):
        with pytest.raises(ValidationError):
            ResourceRequest(amounts=[1, 0])

    def test_missing_amounts_raises(self):
        with pytest.raises(ValidationError):
            ResourceRequest(process_id="P0")


# ---------------------------------------------------------------------------
# Scenario – happy path
# ---------------------------------------------------------------------------


class TestScenarioValid:
    def test_classic_bankers_example(self):
        s = Scenario(**make_scenario())
        assert s.id == "scenario-1"
        assert len(s.processes) == 3
        assert len(s.resources) == 3
        assert s.allocation.matrix[1][0] == 2   # P1 holds 2 of R0
        assert s.maximum.matrix[0][0] == 7       # P0 max of R0 is 7
        assert s.need.matrix[0][0] == 7          # P0 needs 7 of R0
        assert s.available.vector == [3, 3, 2]

    def test_single_process_single_resource(self):
        s = Scenario(
            id="s",
            name="Minimal",
            processes=[{"id": "P0", "name": "P"}],
            resources=[{"id": "R0", "name": "R", "total_instances": 2}],
            allocation={"matrix": [[1]]},
            maximum={"matrix": [[2]]},
            need={"matrix": [[1]]},
            available={"vector": [0]},
        )
        assert s.need.matrix[0][0] == 1

    def test_all_zeros_allocation(self):
        s = Scenario(
            id="s",
            name="All Zero",
            processes=[{"id": "P0", "name": "P"}],
            resources=[{"id": "R0", "name": "R", "total_instances": 5}],
            allocation={"matrix": [[0]]},
            maximum={"matrix": [[5]]},
            need={"matrix": [[5]]},
            available={"vector": [5]},
        )
        assert s.allocation.matrix[0][0] == 0

    def test_full_allocation_no_need(self):
        """Process holds everything it could ever want."""
        s = Scenario(
            id="s",
            name="Full Alloc",
            processes=[{"id": "P0", "name": "P"}],
            resources=[{"id": "R0", "name": "R", "total_instances": 3}],
            allocation={"matrix": [[3]]},
            maximum={"matrix": [[3]]},
            need={"matrix": [[0]]},
            available={"vector": [0]},
        )
        assert s.need.matrix[0][0] == 0

    def test_process_state_preserved(self):
        data = make_scenario()
        data["processes"][0]["state"] = "blocked"
        s = Scenario(**data)
        assert s.processes[0].state == ProcessState.BLOCKED

    def test_description_defaults_to_empty(self):
        s = Scenario(**make_scenario())
        assert s.description == ""

    def test_description_set(self):
        data = make_scenario()
        data["description"] = "A test scenario"
        s = Scenario(**data)
        assert s.description == "A test scenario"


# ---------------------------------------------------------------------------
# Scenario – dimension validation
# ---------------------------------------------------------------------------


class TestScenarioDimensions:
    def test_too_few_allocation_rows(self):
        """AllocationMatrix has 2 rows but there are 3 processes."""
        with pytest.raises(ValidationError, match="AllocationMatrix has 2 rows"):
            Scenario(**make_scenario(allocation=[[0, 1, 0], [2, 0, 0]]))

    def test_too_many_allocation_rows(self):
        """AllocationMatrix has 4 rows but there are 3 processes."""
        with pytest.raises(ValidationError, match="AllocationMatrix has 4 rows"):
            Scenario(**make_scenario(
                allocation=[[0, 1, 0], [2, 0, 0], [3, 0, 2], [1, 0, 0]]
            ))

    def test_allocation_wrong_column_count(self):
        """AllocationMatrix row 1 has 2 columns but there are 3 resources."""
        with pytest.raises(ValidationError, match="AllocationMatrix row 1"):
            Scenario(**make_scenario(
                allocation=[[0, 1, 0], [2, 0], [3, 0, 2]]
            ))

    def test_too_few_maximum_rows(self):
        with pytest.raises(ValidationError, match="MaximumMatrix has 2 rows"):
            Scenario(**make_scenario(maximum=[[7, 5, 3], [3, 2, 2]]))

    def test_maximum_wrong_column_count(self):
        # Row 0 sets width=2; row 1 has width=3, so the validator fires on row 1.
        with pytest.raises(ValidationError, match="MaximumMatrix row"):
            Scenario(**make_scenario(
                maximum=[[7, 5], [3, 2, 2], [9, 0, 2]]
            ))

    def test_too_few_need_rows(self):
        with pytest.raises(ValidationError, match="NeedMatrix has 2 rows"):
            Scenario(**make_scenario(need=[[7, 4, 3], [1, 2, 2]]))

    def test_need_wrong_column_count(self):
        with pytest.raises(ValidationError, match="NeedMatrix row 2"):
            Scenario(**make_scenario(
                need=[[7, 4, 3], [1, 2, 2], [6, 0]]
            ))

    def test_available_wrong_length(self):
        """AvailableVector has 2 entries but there are 3 resources."""
        with pytest.raises(ValidationError, match="AvailableVector has length 2"):
            Scenario(**make_scenario(available=[3, 3]))

    def test_available_too_long(self):
        with pytest.raises(ValidationError, match="AvailableVector has length 4"):
            Scenario(**make_scenario(available=[3, 3, 2, 0]))

    def test_empty_processes_raises(self):
        # Pass empty matrices too so the empty-list validator fires first
        with pytest.raises(ValidationError, match="at least one process"):
            Scenario(
                id="s",
                name="n",
                processes=[],
                resources=[{"id": "R0", "name": "R", "total_instances": 1}],
                allocation={"matrix": []},
                maximum={"matrix": []},
                need={"matrix": []},
                available={"vector": [1]},
            )

    def test_empty_resources_raises(self):
        # Pass empty available vector too so the empty-list validator fires first
        with pytest.raises(ValidationError, match="at least one resource"):
            Scenario(
                id="s",
                name="n",
                processes=[{"id": "P0", "name": "P"}],
                resources=[],
                allocation={"matrix": [[]]},
                maximum={"matrix": [[]]},
                need={"matrix": [[]]},
                available={"vector": []},
            )


# ---------------------------------------------------------------------------
# Scenario – allocation ≤ maximum
# ---------------------------------------------------------------------------


class TestScenarioAllocationExceedsMaximum:
    def test_allocation_exceeds_maximum_cell(self):
        """P0's allocation of R0 = 8, but maximum = 7."""
        with pytest.raises(ValidationError, match="Allocation\\[0\\]\\[0\\].*exceeds"):
            Scenario(**make_scenario(
                allocation=[[8, 1, 0], [2, 0, 0], [3, 0, 2]]
            ))

    def test_allocation_exceeds_maximum_last_cell(self):
        """P2's allocation of R2 = 3, but maximum = 2. Need must be consistent."""
        # Provide a valid (non-negative) need so per-field validation passes,
        # leaving the cross-field allocation > maximum check to fire.
        with pytest.raises(ValidationError, match="Allocation\\[2\\]\\[2\\].*exceeds"):
            Scenario(**make_scenario(
                allocation=[[0, 1, 0], [2, 0, 0], [3, 0, 3]],
                need=[[7, 4, 3], [1, 2, 2], [6, 0, 0]],
            ))

    def test_allocation_equal_to_maximum_is_valid(self):
        """Edge case: allocation == maximum means need == 0, which is fine."""
        s = Scenario(**make_scenario(
            allocation=[[7, 5, 3], [3, 2, 2], [9, 0, 2]],
            need=[[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        ))
        assert s.need.matrix[0][0] == 0


# ---------------------------------------------------------------------------
# Scenario – need = maximum − allocation
# ---------------------------------------------------------------------------


class TestScenarioNeedConsistency:
    def test_need_wrong_single_cell(self):
        """NeedMatrix[0][0] should be 7 (7−0) but is given as 6."""
        bad_need = [[6, 4, 3], [1, 2, 2], [6, 0, 0]]
        with pytest.raises(ValidationError, match="NeedMatrix\\[0\\]\\[0\\]"):
            Scenario(**make_scenario(need=bad_need))

    def test_need_all_wrong(self):
        """Supply a completely wrong need matrix."""
        bad_need = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        with pytest.raises(ValidationError, match="NeedMatrix"):
            Scenario(**make_scenario(need=bad_need))

    def test_need_correct_after_fixing(self):
        """Verify the fixed version of the previous test passes."""
        s = Scenario(**make_scenario())
        # Check every cell
        alloc = s.allocation.matrix
        maxi = s.maximum.matrix
        need = s.need.matrix
        for i in range(len(s.processes)):
            for j in range(len(s.resources)):
                assert need[i][j] == maxi[i][j] - alloc[i][j]

    def test_need_negative_value_independent(self):
        """NeedMatrix validator fires independently of cross-field check."""
        with pytest.raises(ValidationError, match="negative"):
            Scenario(**make_scenario(
                need=[[-1, 4, 3], [1, 2, 2], [6, 0, 0]]
            ))


# ---------------------------------------------------------------------------
# AlgorithmResult
# ---------------------------------------------------------------------------


class TestAlgorithmResult:
    def test_minimal_construction(self):
        r = AlgorithmResult(algorithm="bankers")
        assert r.algorithm == "bankers"
        assert r.is_safe is None
        assert r.safe_sequence == []
        assert r.deadlocked_processes == []
        assert r.message == ""
        assert r.steps == []
        assert r.metadata == {}

    def test_safe_result(self):
        r = AlgorithmResult(
            algorithm="bankers",
            is_safe=True,
            safe_sequence=["P1", "P0", "P2"],
            message="System is in a safe state.",
            steps=["Grant P1", "Grant P0", "Grant P2"],
        )
        assert r.is_safe is True
        assert r.safe_sequence == ["P1", "P0", "P2"]
        assert len(r.steps) == 3

    def test_unsafe_result(self):
        r = AlgorithmResult(
            algorithm="bankers",
            is_safe=False,
            message="System is in an unsafe state.",
        )
        assert r.is_safe is False

    def test_deadlock_detection_result(self):
        r = AlgorithmResult(
            algorithm="rag_detection",
            is_safe=False,
            deadlocked_processes=["P0", "P2"],
            message="Deadlock detected involving P0, P2.",
        )
        assert "P0" in r.deadlocked_processes

    def test_metadata_stored(self):
        r = AlgorithmResult(
            algorithm="bankers",
            metadata={"iterations": 5, "work_vector": [3, 3, 2]},
        )
        assert r.metadata["iterations"] == 5

    def test_missing_algorithm_raises(self):
        with pytest.raises(ValidationError):
            AlgorithmResult()


# ---------------------------------------------------------------------------
# HealthResponse
# ---------------------------------------------------------------------------


class TestHealthResponse:
    def test_valid_construction(self):
        h = HealthResponse(
            status="ok",
            message="DeadlockGuard backend is running",
            version="0.1.0",
        )
        assert h.status == "ok"
        assert h.version == "0.1.0"

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            HealthResponse(status="ok", message="hi")


# ---------------------------------------------------------------------------
# SimulationState
# ---------------------------------------------------------------------------


class TestSimulationState:
    def test_empty_state(self):
        s = SimulationState()
        assert s.scenario is None

    def test_none_scenario(self):
        s = SimulationState(scenario=None)
        assert s.scenario is None

    def test_with_scenario(self):
        scenario = Scenario(**make_scenario())
        s = SimulationState(scenario=scenario)
        assert s.scenario is not None
        assert s.scenario.id == "scenario-1"
