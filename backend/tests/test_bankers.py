"""
Unit tests for the Banker's Algorithm (bankers.py).

Required test cases (per spec)
-------------------------------
1. Classic 5-process/3-resource textbook safe-state example
   – verify exact safe sequence produced.
2. Unsafe state (no process can ever proceed) – is_safe == False.
3. A valid resource request that gets GRANTED.
4. A request exceeding Need → rejected with correct reason.
5. A request exceeding Available → rejected with correct reason.
6. A request within Need and Available but would push system UNSAFE
   → DENIED, state rolled back (Available and Allocation unchanged).

Additional tests cover:
  - calculate_need() wrapper delegates to need.py correctly
  - is_safe_state() convenience predicate
  - SafetyResult structure and trace fields
  - RequestResult structure fields
  - Input validation (BankersError)
  - Edge cases: single process, all resources already allocated
"""

import copy

import pytest

from app.algorithms.bankers import (
    BankersError,
    RequestResult,
    SafetyResult,
    calculate_need,
    is_safe_state,
    resource_request,
    safety_algorithm,
)
from app.algorithms.need import NeedMatrixError


# ===========================================================================
# Shared fixtures – textbook 5-process / 3-resource example
# (Silberschatz, Galvin & Gagne "Operating System Concepts")
#
#          Allocation    Maximum        Need          Available
#          A  B  C      A  B  C      A  B  C         A  B  C
#  P0      0  1  0      7  5  3      7  4  3         3  3  2
#  P1      2  0  0      3  2  2      1  2  2
#  P2      3  0  2      9  0  2      6  0  0
#  P3      2  1  1      2  2  2      0  1  1
#  P4      0  0  2      4  3  3      4  3  1
#
# Expected safe sequence: P1 → P3 → P0 → P2 → P4  (indices [1,3,0,2,4])
# ===========================================================================

ALLOC_5X3 = [
    [0, 1, 0],  # P0
    [2, 0, 0],  # P1
    [3, 0, 2],  # P2
    [2, 1, 1],  # P3
    [0, 0, 2],  # P4
]
MAX_5X3 = [
    [7, 5, 3],  # P0
    [3, 2, 2],  # P1
    [9, 0, 2],  # P2
    [2, 2, 2],  # P3
    [4, 3, 3],  # P4
]
NEED_5X3 = [
    [7, 4, 3],  # P0
    [1, 2, 2],  # P1
    [6, 0, 0],  # P2
    [0, 1, 1],  # P3
    [4, 3, 1],  # P4
]
AVAIL_5X3 = [3, 3, 2]

# Safe sequence as process *indices*
SAFE_SEQ_5X3 = [1, 3, 0, 2, 4]


# ===========================================================================
# Test class 1 – Required case 1:
# Classic 5-process / 3-resource textbook example (safe state)
# ===========================================================================

class TestClassicTextbookSafeExample:
    def test_is_safe(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert result.is_safe is True

    def test_exact_safe_sequence(self):
        """The safe sequence must match the textbook derivation exactly."""
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert result.safe_sequence == SAFE_SEQ_5X3, (
            f"Expected safe sequence {SAFE_SEQ_5X3}, "
            f"got {result.safe_sequence}"
        )

    def test_all_processes_finish(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert all(result.finish_final), (
            "All processes must be marked finished in a safe state."
        )

    def test_safe_sequence_length(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert len(result.safe_sequence) == 5

    def test_safe_sequence_is_permutation(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert sorted(result.safe_sequence) == [0, 1, 2, 3, 4]

    def test_message_says_safe(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert "SAFE" in result.message

    def test_trace_steps_populated(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert len(result.steps) > 0

    def test_is_safe_state_predicate(self):
        assert is_safe_state(ALLOC_5X3, NEED_5X3, AVAIL_5X3) is True


# ===========================================================================
# Test class 2 – Required case 2:
# Unsafe state – no process can ever proceed
# ===========================================================================

class TestUnsafeState:
    """
    Construct a state where every process needs more than Available for
    every resource, so no process can ever get started.

    2 processes, 2 resources.
    Allocation = [[1,0],[0,1]]
    Need       = [[5,5],[5,5]]   (far beyond anything Available can cover)
    Available  = [0,0]
    """

    ALLOC = [[1, 0], [0, 1]]
    NEED  = [[5, 5], [5, 5]]
    AVAIL = [0, 0]

    def test_is_unsafe(self):
        result = safety_algorithm(self.ALLOC, self.NEED, self.AVAIL)
        assert result.is_safe is False

    def test_safe_sequence_is_empty(self):
        result = safety_algorithm(self.ALLOC, self.NEED, self.AVAIL)
        assert result.safe_sequence == []

    def test_no_process_finishes(self):
        result = safety_algorithm(self.ALLOC, self.NEED, self.AVAIL)
        assert not any(result.finish_final)

    def test_message_says_unsafe(self):
        result = safety_algorithm(self.ALLOC, self.NEED, self.AVAIL)
        assert "UNSAFE" in result.message

    def test_message_does_not_say_deadlock(self):
        """The safety algorithm must not use the word 'deadlock'."""
        result = safety_algorithm(self.ALLOC, self.NEED, self.AVAIL)
        assert "deadlock" not in result.message.lower()

    def test_is_safe_state_predicate_false(self):
        assert is_safe_state(self.ALLOC, self.NEED, self.AVAIL) is False

    def test_another_clearly_unsafe_state(self):
        """Available is all zeros, every process still has remaining need."""
        alloc = [[2, 1, 0], [0, 0, 2]]
        need  = [[1, 1, 1], [1, 1, 1]]
        avail = [0, 0, 0]
        result = safety_algorithm(alloc, need, avail)
        assert result.is_safe is False


# ===========================================================================
# Test class 3 – Required case 3:
# A valid resource request that gets GRANTED
# ===========================================================================

class TestResourceRequestGranted:
    """
    Using the textbook 5×3 state, P1 requests [1,0,2].

    Step verification:
      Request=[1,0,2] ≤ Need[P1]=[1,2,2]  ✓
      Request=[1,0,2] ≤ Available=[3,3,2]  ✓
      Hypothetical state after applying:
        Available    = [3-1,3-0,2-2] = [2,3,0]
        Allocation[1]= [2+1,0+0,0+2] = [3,0,2]
        Need[1]      = [1-1,2-0,2-2] = [0,2,0]
      Safety check on hypothetical → should still be safe.
    """

    REQUEST_PROC = 1
    REQUEST      = [1, 0, 2]

    def test_request_is_granted(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is True

    def test_available_decremented(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.available == [2, 3, 0]

    def test_allocation_incremented(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.allocation[self.REQUEST_PROC] == [3, 0, 2]

    def test_need_decremented(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.need[self.REQUEST_PROC] == [0, 2, 0]

    def test_safety_result_attached(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.safety_result is not None
        assert result.safety_result.is_safe is True

    def test_reason_says_granted(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert "GRANTED" in result.reason

    def test_original_matrices_unchanged(self):
        """resource_request must not mutate the caller's inputs."""
        alloc_copy = copy.deepcopy(ALLOC_5X3)
        need_copy  = copy.deepcopy(NEED_5X3)
        avail_copy = list(AVAIL_5X3)
        resource_request(
            self.REQUEST_PROC, self.REQUEST,
            alloc_copy, need_copy, avail_copy,
        )
        # Granted path returns new objects; originals must be unchanged
        assert alloc_copy == ALLOC_5X3
        assert need_copy  == NEED_5X3
        assert avail_copy == AVAIL_5X3


# ===========================================================================
# Test class 4 – Required case 4:
# Request exceeds Need → rejected immediately
# ===========================================================================

class TestRequestExceedsNeed:
    """
    P0's Need = [7,4,3].  Request [8,0,0] exceeds Need[0][0].
    Must be rejected before any state change is attempted.
    """

    REQUEST_PROC = 0
    REQUEST      = [8, 0, 0]   # 8 > Need[P0][A]=7

    def test_request_is_denied(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is False

    def test_reason_mentions_need(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert "Need" in result.reason or "maximum" in result.reason.lower()

    def test_state_unchanged(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.allocation == ALLOC_5X3
        assert result.need       == NEED_5X3
        assert result.available  == AVAIL_5X3

    def test_another_exceeds_need_case(self):
        """Request second resource dimension beyond Need."""
        result = resource_request(
            0, [0, 5, 0],   # Need[P0][B]=4, request 5
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is False
        assert "Need" in result.reason or "maximum" in result.reason.lower()


# ===========================================================================
# Test class 5 – Required case 5:
# Request exceeds Available → rejected immediately
# ===========================================================================

class TestRequestExceedsAvailable:
    """
    Available = [3,3,2].  P4 requests [4,0,0] → 4 > Available[A]=3.
    Must be rejected before any state change is attempted.
    """

    REQUEST_PROC = 4
    REQUEST      = [4, 0, 0]   # 4 > Available[A]=3

    def test_request_is_denied(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is False

    def test_reason_mentions_available(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert "Available" in result.reason or "available" in result.reason

    def test_state_unchanged(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.allocation == ALLOC_5X3
        assert result.need       == NEED_5X3
        assert result.available  == AVAIL_5X3

    def test_another_exceeds_available_case(self):
        """Request third resource dimension beyond Available."""
        result = resource_request(
            0, [0, 0, 3],   # Available[C]=2, request 3
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is False
        assert "Available" in result.reason or "available" in result.reason


# ===========================================================================
# Test class 6 – Required case 6:
# Request within Need and Available but would push system UNSAFE → DENIED,
# and state is confirmed rolled back (Available and Allocation unchanged)
# ===========================================================================

class TestRequestDeniedWouldCauseUnsafe:
    """
    Construct a minimal state where granting a request leaves no safe sequence.

    3 processes, 1 resource (A).
    Total resources = 4.

    Initial state:
      Allocation = [[1],[1],[1]]    (each holds 1)
      Maximum    = [[3],[3],[3]]
      Need       = [[2],[2],[2]]
      Available  = [1]

    Available=[1] → only 1 free unit.

    P0 requests [1]:
      Request ≤ Need[P0]=[2]     ✓
      Request ≤ Available=[1]    ✓
    Hypothetical state after granting P0:
      Allocation = [[2],[1],[1]]
      Need       = [[1],[2],[2]]
      Available  = [0]

    Safety check on hypothetical:
      Work=[0]. P0 Need=[1]>0 ✗. P1 Need=[2]>0 ✗. P2 Need=[2]>0 ✗.
      No process can proceed → UNSAFE → deny and roll back.
    """

    ALLOC = [[1], [1], [1]]
    NEED  = [[2], [2], [2]]
    AVAIL = [1]

    REQUEST_PROC = 0
    REQUEST      = [1]

    def test_request_within_need_and_available(self):
        """Pre-condition: request passes the first two checks."""
        assert self.REQUEST[0] <= self.NEED[self.REQUEST_PROC][0]
        assert self.REQUEST[0] <= self.AVAIL[0]

    def test_request_is_denied(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            self.ALLOC, self.NEED, self.AVAIL,
        )
        assert result.granted is False

    def test_reason_mentions_unsafe(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            self.ALLOC, self.NEED, self.AVAIL,
        )
        assert "UNSAFE" in result.reason or "unsafe" in result.reason.lower()

    def test_reason_does_not_say_deadlock(self):
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            self.ALLOC, self.NEED, self.AVAIL,
        )
        assert "deadlock" not in result.reason.lower()

    def test_available_rolled_back(self):
        """Available must be identical to the original after denial."""
        alloc_in = copy.deepcopy(self.ALLOC)
        need_in  = copy.deepcopy(self.NEED)
        avail_in = list(self.AVAIL)
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            alloc_in, need_in, avail_in,
        )
        assert result.available == self.AVAIL, (
            f"Available should be rolled back to {self.AVAIL}, "
            f"got {result.available}"
        )

    def test_allocation_rolled_back(self):
        """Allocation must be identical to the original after denial."""
        alloc_in = copy.deepcopy(self.ALLOC)
        need_in  = copy.deepcopy(self.NEED)
        avail_in = list(self.AVAIL)
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            alloc_in, need_in, avail_in,
        )
        assert result.allocation == self.ALLOC, (
            f"Allocation should be rolled back to {self.ALLOC}, "
            f"got {result.allocation}"
        )

    def test_need_rolled_back(self):
        """Need must be identical to the original after denial."""
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            copy.deepcopy(self.ALLOC),
            copy.deepcopy(self.NEED),
            list(self.AVAIL),
        )
        assert result.need == self.NEED

    def test_safety_result_is_unsafe(self):
        """The attached SafetyResult must record is_safe=False."""
        result = resource_request(
            self.REQUEST_PROC, self.REQUEST,
            self.ALLOC, self.NEED, self.AVAIL,
        )
        assert result.safety_result is not None
        assert result.safety_result.is_safe is False

    def test_inputs_not_mutated_on_denial(self):
        """
        The caller's own objects must not be mutated when a request is denied.
        (resource_request deep-copies internally, so the caller's data stays clean.)
        """
        alloc = copy.deepcopy(self.ALLOC)
        need  = copy.deepcopy(self.NEED)
        avail = list(self.AVAIL)
        resource_request(self.REQUEST_PROC, self.REQUEST, alloc, need, avail)
        assert alloc == self.ALLOC
        assert need  == self.NEED
        assert avail == self.AVAIL


# ===========================================================================
# Additional tests – calculate_need() wrapper
# ===========================================================================

class TestCalculateNeedWrapper:
    def test_delegates_to_need_module(self):
        alloc = [[0, 1, 0], [2, 0, 0]]
        maxi  = [[7, 5, 3], [3, 2, 2]]
        result = calculate_need(alloc, maxi)
        assert result == [[7, 4, 3], [1, 2, 2]]

    def test_propagates_need_matrix_error(self):
        with pytest.raises(NeedMatrixError):
            calculate_need([[5]], [[3]])  # allocation > maximum

    def test_all_zero_allocation(self):
        alloc = [[0, 0], [0, 0]]
        maxi  = [[3, 2], [1, 4]]
        assert calculate_need(alloc, maxi) == maxi


# ===========================================================================
# Additional tests – SafetyResult structure
# ===========================================================================

class TestSafetyResultStructure:
    def test_result_is_safety_result_instance(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert isinstance(result, SafetyResult)

    def test_work_final_correct_length(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert len(result.work_final) == 3

    def test_finish_final_correct_length(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        assert len(result.finish_final) == 5

    def test_iteration_snapshot_fields(self):
        result = safety_algorithm(ALLOC_5X3, NEED_5X3, AVAIL_5X3)
        snap = result.steps[0]
        assert hasattr(snap, "iteration")
        assert hasattr(snap, "process_index")
        assert hasattr(snap, "process_qualified")
        assert hasattr(snap, "work_before")
        assert hasattr(snap, "work_after")
        assert hasattr(snap, "finish_vector")
        assert hasattr(snap, "note")
        assert isinstance(snap.note, str)
        assert len(snap.note) > 0


# ===========================================================================
# Additional tests – input validation (BankersError)
# ===========================================================================

class TestBankersInputValidation:
    def test_empty_allocation_raises(self):
        with pytest.raises(BankersError, match="empty"):
            safety_algorithm([], [[1, 0]], [1, 0])

    def test_empty_need_raises(self):
        with pytest.raises(BankersError, match="empty"):
            safety_algorithm([[1, 0]], [], [1, 0])

    def test_empty_available_raises(self):
        with pytest.raises(BankersError, match="empty"):
            safety_algorithm([[1, 0]], [[0, 0]], [])

    def test_row_count_mismatch_raises(self):
        with pytest.raises(BankersError, match="rows"):
            safety_algorithm(
                [[1, 0], [0, 1]],  # 2 rows
                [[0, 1]],          # 1 row
                [1, 1],
            )

    def test_allocation_column_mismatch_raises(self):
        with pytest.raises(BankersError):
            safety_algorithm(
                [[1, 0, 0]],   # 3 cols
                [[0, 1]],      # 2 cols
                [1, 1],        # 2 entries
            )

    def test_negative_allocation_raises(self):
        with pytest.raises(BankersError, match="negative"):
            safety_algorithm([[-1, 0]], [[0, 1]], [1, 0])

    def test_negative_need_raises(self):
        with pytest.raises(BankersError, match="negative"):
            safety_algorithm([[1, 0]], [[-1, 1]], [1, 0])

    def test_negative_available_raises(self):
        with pytest.raises(BankersError, match="negative"):
            safety_algorithm([[0, 0]], [[1, 1]], [-1, 0])

    def test_invalid_process_index_raises(self):
        with pytest.raises(BankersError, match="out of range"):
            resource_request(
                10, [1, 0, 0],
                ALLOC_5X3, NEED_5X3, AVAIL_5X3,
            )

    def test_negative_process_index_raises(self):
        with pytest.raises(BankersError, match="out of range"):
            resource_request(
                -1, [1, 0, 0],
                ALLOC_5X3, NEED_5X3, AVAIL_5X3,
            )

    def test_wrong_request_length_raises(self):
        with pytest.raises(BankersError, match="length"):
            resource_request(
                0, [1, 0],          # should be length 3
                ALLOC_5X3, NEED_5X3, AVAIL_5X3,
            )

    def test_negative_request_raises(self):
        with pytest.raises(BankersError, match="negative"):
            resource_request(
                0, [-1, 0, 0],
                ALLOC_5X3, NEED_5X3, AVAIL_5X3,
            )


# ===========================================================================
# Additional tests – edge cases
# ===========================================================================

class TestEdgeCases:
    def test_single_process_single_resource_safe(self):
        """One process, one resource, process needs 0 more."""
        result = safety_algorithm([[3]], [[0]], [2])
        assert result.is_safe is True
        assert result.safe_sequence == [0]

    def test_single_process_zero_need_safe(self):
        """Process already has all it needs; Available can be 0."""
        result = safety_algorithm([[5]], [[0]], [0])
        assert result.is_safe is True

    def test_all_processes_need_zero(self):
        """Every process is already satisfied – trivially safe."""
        alloc = [[2, 1], [1, 3], [0, 2]]
        need  = [[0, 0], [0, 0], [0, 0]]
        avail = [1, 0]
        result = safety_algorithm(alloc, need, avail)
        assert result.is_safe is True
        assert len(result.safe_sequence) == 3

    def test_zero_request_always_safe_if_state_is_safe(self):
        """A zero-vector request should always be granted in a safe state."""
        result = resource_request(
            0, [0, 0, 0],
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert result.granted is True

    def test_request_result_is_request_result_instance(self):
        result = resource_request(
            1, [1, 0, 0],
            ALLOC_5X3, NEED_5X3, AVAIL_5X3,
        )
        assert isinstance(result, RequestResult)
