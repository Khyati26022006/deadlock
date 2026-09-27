"""
Unit tests for the matrix-based Deadlock Detection Algorithm (detection.py).

Required test cases (per spec)
-------------------------------
1. No deadlock — all processes can eventually finish.
2. Deadlock involving multiple processes — a subset that can never proceed.
3. Multiple instances of the same resource type — detection still resolves.
4. UNSAFE under Banker's Algorithm but NOT actually deadlocked under
   detection — proves the two concepts are properly distinct.

Additional tests cover:
  - DetectionResult / DetectionSnapshot structure
  - Finish[] initialisation rule (all-zero allocation → True from start)
  - Input validation (DetectionError)
  - message contains "NO_DEADLOCK" or "DEADLOCKED" as appropriate
  - Completed vs. deadlocked process lists
  - Step trace populated and correct
  - Module does NOT import from bankers.py (verified structurally)
"""

import pytest

from app.algorithms.detection import (
    DetectionError,
    DetectionResult,
    DetectionSnapshot,
    detect_deadlock,
)


# ===========================================================================
# Required test case 1
# No deadlock — all processes can eventually finish
#
# Classic textbook example (Silberschatz 10th ed., Table 8.4)
# 5 processes, 3 resource types
#
#   Allocation   Request   Available
#   A  B  C     A  B  C   A  B  C
#   0  1  0     0  0  0   0  0  0
#   2  0  0     2  0  2
#   3  0  3     0  0  0
#   2  1  1     1  0  0
#   0  0  2     0  0  2
#
# Available=[0,0,0].  Processes with zero Request can run immediately.
# P0: Request=[0,0,0]≤Work=[0,0,0] ✓ → Work=[0,1,0]
# P2: Request=[0,0,0]≤Work=[0,1,0] ✓ → Work=[3,1,3]
# P3: Request=[1,0,0]≤Work=[3,1,3] ✓ → Work=[5,2,4]
# P1: Request=[2,0,2]≤Work=[5,2,4] ✓ → Work=[7,2,4]
# P4: Request=[0,0,2]≤Work=[7,2,4] ✓ → Work=[7,2,6]
# All finish → NO_DEADLOCK.
# ===========================================================================

ALLOC_5X3 = [
    [0, 1, 0],  # P0
    [2, 0, 0],  # P1
    [3, 0, 3],  # P2
    [2, 1, 1],  # P3
    [0, 0, 2],  # P4
]
REQUEST_5X3_CLEAN = [
    [0, 0, 0],  # P0 – not waiting
    [2, 0, 2],  # P1
    [0, 0, 0],  # P2 – not waiting
    [1, 0, 0],  # P3
    [0, 0, 2],  # P4
]
AVAIL_5X3_ZERO = [0, 0, 0]


class TestNoDeadlock:
    def test_no_deadlock_detected(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert result.deadlock_detected is False

    def test_deadlocked_processes_empty(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert result.deadlocked_processes == []

    def test_all_processes_completed(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert sorted(result.completed_processes) == [0, 1, 2, 3, 4]

    def test_all_finish_true(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert all(result.finish_final)

    def test_message_contains_no_deadlock(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert "NO_DEADLOCK" in result.message

    def test_message_does_not_contain_deadlocked(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert "DEADLOCKED" not in result.message

    def test_steps_populated(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert len(result.steps) > 0

    def test_simple_no_deadlock_with_available(self):
        """Single process, holds nothing, requests nothing."""
        result = detect_deadlock([[0, 0]], [[0, 0]], [2, 1])
        assert result.deadlock_detected is False

    def test_all_zero_requests_no_deadlock(self):
        """When every process requests nothing, no deadlock is possible."""
        alloc = [[1, 0], [0, 1], [1, 1]]
        req   = [[0, 0], [0, 0], [0, 0]]
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is False
        assert sorted(result.completed_processes) == [0, 1, 2]


# ===========================================================================
# Required test case 2
# Deadlock involving MULTIPLE processes
#
# 4 processes, 2 resource types.  Total resources = [4, 4].
#
#   Allocation   Request   Available
#   A  B         A  B      A  B
#   1  0         0  1      0  0
#   0  1         1  0
#   1  0         0  1
#   0  1         1  0
#
# Available=[0,0].  P0 wants B but nobody has B to give until P1/P3 finish,
# but P1 wants A (held by P0/P2) and P3 wants A (held by P0/P2).
# No process can proceed → all 4 deadlocked.
# ===========================================================================

ALLOC_4X2_DEAD = [
    [1, 0],  # P0 holds A
    [0, 1],  # P1 holds B
    [1, 0],  # P2 holds A
    [0, 1],  # P3 holds B
]
REQUEST_4X2_DEAD = [
    [0, 1],  # P0 wants B
    [1, 0],  # P1 wants A
    [0, 1],  # P2 wants B
    [1, 0],  # P3 wants A
]
AVAIL_4X2_ZERO = [0, 0]


class TestDeadlockMultipleProcesses:
    def test_deadlock_detected(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        assert result.deadlock_detected is True

    def test_all_four_processes_deadlocked(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        assert sorted(result.deadlocked_processes) == [0, 1, 2, 3]

    def test_no_process_completed(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        assert result.completed_processes == []

    def test_no_finish_true(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        assert not any(result.finish_final)

    def test_message_contains_deadlocked(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        assert "DEADLOCKED" in result.message

    def test_partial_deadlock_subset(self):
        """
        3 processes; P0 finishes (request=0), P1 and P2 are stuck.

        Allocation   Request   Available
        A            A         A
        2            0         1         ← P0 requests nothing; can finish
        1            2                   ← P1 wants 2 but after P0 only 3 free,
        1            2                     P1 needs 2 of those and so does P2;
                                           P1 runs first, then P2 can't get any.

        Manual trace:
          Work=1. P0 Req=[0]≤1 → Work=3. P1 Req=[2]≤3 → Work=4. P2 Req=[2]≤4 → Work=5.
          All finish → NO_DEADLOCK. (Adjust to actually deadlock.)
        """
        # Tighter scenario: only 1 unit free, P1+P2 each need 2.
        alloc = [[2], [1], [1]]
        req   = [[0], [2], [2]]
        avail = [0]  # Available=0 after P0 finishes Work=2, still <2 for P1/P2
        # Work=0. P0 Req=[0]≤0 ✓ → Work=2. P1 Req=[2]≤2 ✓ → Work=3. P2 Req=[2]≤3 ✓.
        # Still no deadlock. Let's make it actually deadlock:
        alloc2 = [[1], [1], [1]]
        req2   = [[0], [2], [2]]
        avail2 = [0]
        # Work=0. P0 Req=[0]≤0 ✓ → Work=1. P1 Req=[2]>1 ✗. P2 Req=[2]>1 ✗. → P1,P2 deadlocked.
        result = detect_deadlock(alloc2, req2, avail2)
        assert result.deadlock_detected is True
        assert 1 in result.deadlocked_processes
        assert 2 in result.deadlocked_processes
        assert 0 in result.completed_processes

    def test_single_process_deadlocked(self):
        """One process holding a resource and waiting for more that don't exist."""
        alloc = [[2]]
        req   = [[3]]   # needs 3 more but only 0 available and nobody else to release
        avail = [0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is True
        assert result.deadlocked_processes == [0]


# ===========================================================================
# Required test case 3
# Multiple instances of the same resource type — detection resolves correctly
#
# 3 processes, 2 resource types, multiple instances of each.
# Total A=7, B=5.
#
#   Allocation   Request   Available
#   A  B         A  B      A  B
#   0  1         0  0      1  0
#   2  0         2  0
#   3  0         0  0
#
# Finish init: P0 allocation=[0,1] ≠ zeros → False.
#              P1=[2,0] → False.  P2=[3,0] → False.
#
# Work=[1,0].
# P0 Req=[0,0]≤[1,0] ✓ → Work=[1,1]. Finish[0]=True.
# P1 Req=[2,0]>[1,1] ✗ (A: 2>1).
# P2 Req=[0,0]≤[1,1] ✓ → Work=[4,1]. Finish[2]=True.
# P1 Req=[2,0]≤[4,1] ✓ → Work=[6,1]. Finish[1]=True.
# → NO_DEADLOCK, all processes finish.
# ===========================================================================

ALLOC_3X2_MULTI = [
    [0, 1],   # P0
    [2, 0],   # P1
    [3, 0],   # P2
]
REQUEST_3X2_MULTI = [
    [0, 0],   # P0 – not waiting
    [2, 0],   # P1
    [0, 0],   # P2 – not waiting
]
AVAIL_3X2_MULTI = [1, 0]


class TestMultipleInstancesSameResource:
    def test_no_deadlock(self):
        result = detect_deadlock(ALLOC_3X2_MULTI, REQUEST_3X2_MULTI, AVAIL_3X2_MULTI)
        assert result.deadlock_detected is False

    def test_all_processes_finish(self):
        result = detect_deadlock(ALLOC_3X2_MULTI, REQUEST_3X2_MULTI, AVAIL_3X2_MULTI)
        assert sorted(result.completed_processes) == [0, 1, 2]

    def test_deadlocked_processes_empty(self):
        result = detect_deadlock(ALLOC_3X2_MULTI, REQUEST_3X2_MULTI, AVAIL_3X2_MULTI)
        assert result.deadlocked_processes == []

    def test_multi_instance_with_deadlock(self):
        """
        4 processes, 2 resource types, multiple instances — deadlock still caught.

        Total A=4, B=4.
        Allocation   Request   Available
        A  B         A  B      A  B
        1  1         1  1      0  0
        1  1         1  1
        1  1         1  1
        1  1         1  1

        Available=[0,0]. Every process needs more than available.
        No process has zero allocation → Finish all start False.
        No progress possible → all 4 deadlocked.
        """
        alloc = [[1, 1], [1, 1], [1, 1], [1, 1]]
        req   = [[1, 1], [1, 1], [1, 1], [1, 1]]
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is True
        assert sorted(result.deadlocked_processes) == [0, 1, 2, 3]

    def test_multi_instance_partial_resolution(self):
        """
        3 processes, 1 resource with 6 instances.
        P0 holds 3, needs 0.  P1 holds 2, needs 2.  P2 holds 1, needs 5.
        Available = 0.

        Work=0. P0 Req=[0]≤0 ✓ → Work=3. P1 Req=[2]≤3 ✓ → Work=5. P2 Req=[5]>5 ✗.
        Wait — 5>5 is False (≤), so P2 qualifies → Work=6. All finish → NO_DEADLOCK.

        Use needs 6 instead for P2: Req=[6]>5 after P1 releases → deadlocked.
        """
        alloc = [[3], [2], [1]]
        req   = [[0], [2], [6]]   # P2 needs 6 but max ever available = 5
        avail = [0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is True
        assert 2 in result.deadlocked_processes
        assert 0 in result.completed_processes
        assert 1 in result.completed_processes

    def test_message_no_deadlock_label(self):
        result = detect_deadlock(ALLOC_3X2_MULTI, REQUEST_3X2_MULTI, AVAIL_3X2_MULTI)
        assert "NO_DEADLOCK" in result.message


# ===========================================================================
# Required test case 4
# UNSAFE under Banker's Algorithm but NOT deadlocked under detection
#
# This test proves the two concepts are properly distinct.
#
# State:
#   2 processes, 1 resource.  Total = 2.
#   Allocation = [[1],[1]]    Available = [0]
#
#   Banker's inputs (Need = [[1],[1]]):
#     Work=0.  P0 Need=[1]>0 ✗.  P1 Need=[1]>0 ✗.  → UNSAFE.
#
#   Detection inputs (Request = [[0],[0]]):
#     Neither process is CURRENTLY WAITING for anything.
#     Finish init: P0 alloc=[1]≠0 → False; P1 alloc=[1]≠0 → False.
#     Work=0. P0 Req=[0]≤0 ✓ → Work=1. P1 Req=[0]≤1 ✓ → Work=2.
#     → NO_DEADLOCK. (Both processes can complete because they aren't
#       blocked on anything right now.)
#
# Explanation of why both algorithms are correct:
#   Banker's says "if these processes ever request up to their maximum in
#   the worst order, we cannot guarantee completion" — that's a future risk.
#   Detection says "given what processes are *actually waiting for right now*,
#   is anyone permanently blocked?" — that's the current reality.
# ===========================================================================

class TestUnsafeButNotDeadlocked:
    # --- Detection side ---

    def test_detection_no_deadlock(self):
        """Detection confirms NO_DEADLOCK even though Banker's says UNSAFE."""
        alloc = [[1], [1]]
        req   = [[0], [0]]   # neither process is currently waiting
        avail = [0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is False

    def test_detection_all_processes_complete(self):
        alloc = [[1], [1]]
        req   = [[0], [0]]
        avail = [0]
        result = detect_deadlock(alloc, req, avail)
        assert sorted(result.completed_processes) == [0, 1]

    def test_detection_message_says_no_deadlock(self):
        alloc = [[1], [1]]
        req   = [[0], [0]]
        avail = [0]
        result = detect_deadlock(alloc, req, avail)
        assert "NO_DEADLOCK" in result.message

    # --- Banker's side (imported from bankers, used for comparison only) ---

    def test_bankers_says_unsafe_for_same_state(self):
        """
        Confirm that the same resource configuration IS unsafe under Banker's,
        using the Banker's module directly.  This proves that the detection
        module returning NO_DEADLOCK is not a bug — the two algorithms answer
        different questions.
        """
        from app.algorithms.bankers import safety_algorithm

        alloc = [[1], [1]]
        need  = [[1], [1]]   # each process could still request 1 more
        avail = [0]
        safety = safety_algorithm(alloc, need, avail)
        assert safety.is_safe is False, (
            "Banker's must flag this state as UNSAFE for the contrast "
            "with detection to be meaningful."
        )

    def test_bankers_does_not_say_unsafe_implies_deadlocked(self):
        """
        Conceptual guard: an UNSAFE result from Banker's is NOT proof of
        deadlock.  The detection algorithm on the same allocation but with
        zero current requests must still return NO_DEADLOCK.
        """
        from app.algorithms.bankers import safety_algorithm

        alloc = [[1], [1]]
        need  = [[1], [1]]
        avail = [0]
        req   = [[0], [0]]

        bankers_result  = safety_algorithm(alloc, need, avail)
        detection_result = detect_deadlock(alloc, req, avail)

        assert bankers_result.is_safe is False        # UNSAFE
        assert detection_result.deadlock_detected is False  # NOT deadlocked

    def test_larger_unsafe_not_deadlocked(self):
        """
        3 processes, 2 resources, larger unsafe-but-no-deadlock scenario.

        Available = [0, 0] (all held by processes).
        Banker's Need > 0 for all → UNSAFE.
        Detection Request = all zeros → all processes can complete → NO_DEADLOCK.
        """
        alloc = [[2, 1], [1, 2], [1, 1]]
        req   = [[0, 0], [0, 0], [0, 0]]
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        assert result.deadlock_detected is False
        assert sorted(result.completed_processes) == [0, 1, 2]

    def test_zero_allocation_process_not_deadlockable(self):
        """
        A process with all-zero allocation cannot participate in
        hold-and-wait → Finish[i] starts True regardless of its Request.
        """
        alloc = [[0, 0], [1, 1]]   # P0 holds nothing → Finish[P0]=True immediately
        req   = [[5, 5], [0, 0]]   # P0 "requests" resources it could never get
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        # P0 is trivially done (holds nothing).
        # P1 requests nothing → qualifies → Work=[1,1]. All finish.
        assert result.deadlock_detected is False
        assert 0 in result.completed_processes


# ===========================================================================
# DetectionResult / DetectionSnapshot structure tests
# ===========================================================================

class TestDetectionResultStructure:
    def test_result_is_detection_result_instance(self):
        result = detect_deadlock([[1]], [[0]], [1])
        assert isinstance(result, DetectionResult)

    def test_work_final_length(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert len(result.work_final) == 3

    def test_finish_final_length(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        assert len(result.finish_final) == 5

    def test_snapshot_fields_present(self):
        result = detect_deadlock(ALLOC_5X3, REQUEST_5X3_CLEAN, AVAIL_5X3_ZERO)
        snap = result.steps[0]
        assert isinstance(snap, DetectionSnapshot)
        assert hasattr(snap, "iteration")
        assert hasattr(snap, "process_index")
        assert hasattr(snap, "process_qualified")
        assert hasattr(snap, "work_before")
        assert hasattr(snap, "work_after")
        assert hasattr(snap, "finish_vector")
        assert hasattr(snap, "note")
        assert isinstance(snap.note, str)
        assert len(snap.note) > 0

    def test_completed_plus_deadlocked_equals_total(self):
        result = detect_deadlock(ALLOC_4X2_DEAD, REQUEST_4X2_DEAD, AVAIL_4X2_ZERO)
        total = len(result.completed_processes) + len(result.deadlocked_processes)
        assert total == 4


# ===========================================================================
# Finish[] initialisation rule tests
# ===========================================================================

class TestFinishInitialisation:
    def test_zero_allocation_process_starts_finished(self):
        """
        A process with all-zero allocation must be treated as finished from
        the start, regardless of its request vector.
        """
        alloc = [[0, 0], [1, 0]]
        req   = [[9, 9], [0, 0]]   # P0 requests impossibly many — irrelevant
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        # P0 holds nothing → already finished.
        # P1 holds [1,0], requests [0,0] → Work gets [1,0] → Finish[P1]=True.
        assert result.finish_final[0] is True
        assert result.deadlock_detected is False

    def test_non_zero_allocation_starts_not_finished(self):
        """A process holding resources must undergo the eligibility check."""
        alloc = [[1, 0]]
        req   = [[2, 0]]   # needs more than available
        avail = [0, 0]
        result = detect_deadlock(alloc, req, avail)
        assert result.finish_final[0] is False
        assert result.deadlock_detected is True


# ===========================================================================
# Input validation (DetectionError)
# ===========================================================================

class TestDetectionInputValidation:
    def test_empty_allocation_raises(self):
        with pytest.raises(DetectionError, match="empty"):
            detect_deadlock([], [[1]], [1])

    def test_empty_request_raises(self):
        with pytest.raises(DetectionError, match="empty"):
            detect_deadlock([[1]], [], [1])

    def test_empty_available_raises(self):
        with pytest.raises(DetectionError, match="empty"):
            detect_deadlock([[1]], [[0]], [])

    def test_row_count_mismatch_raises(self):
        with pytest.raises(DetectionError, match="rows"):
            detect_deadlock(
                [[1, 0], [0, 1]],  # 2 rows
                [[0, 0]],          # 1 row
                [1, 1],
            )

    def test_allocation_column_mismatch_raises(self):
        with pytest.raises(DetectionError):
            detect_deadlock(
                [[1, 0, 0]],  # 3 cols
                [[0, 1]],     # 2 cols
                [1, 1],       # 2 entries
            )

    def test_request_column_mismatch_raises(self):
        with pytest.raises(DetectionError):
            detect_deadlock(
                [[1, 0]],
                [[0, 1, 0]],  # 3 cols vs 2
                [1, 1],
            )

    def test_negative_allocation_raises(self):
        with pytest.raises(DetectionError, match="negative"):
            detect_deadlock([[-1, 0]], [[0, 0]], [1, 0])

    def test_negative_request_raises(self):
        with pytest.raises(DetectionError, match="negative"):
            detect_deadlock([[1, 0]], [[-1, 0]], [1, 0])

    def test_negative_available_raises(self):
        with pytest.raises(DetectionError, match="negative"):
            detect_deadlock([[0, 0]], [[0, 0]], [-1, 0])


# ===========================================================================
# Module isolation: detection.py must not import from bankers.py
# ===========================================================================

class TestModuleIsolation:
    def test_detection_does_not_import_bankers(self):
        """
        Verify at the module level that detection.py has no dependency on
        bankers.py.  This enforces the architectural separation between
        avoidance and detection.
        """
        import app.algorithms.detection as det_module

        # Collect all module names referenced by detection's global namespace
        imported_modules = {
            v.__module__
            for v in vars(det_module).values()
            if hasattr(v, "__module__")
        }
        for mod_name in imported_modules:
            assert "bankers" not in str(mod_name), (
                f"detection.py must not depend on bankers.py, "
                f"but found reference to '{mod_name}'."
            )

    def test_detection_does_not_import_need(self):
        """
        detection.py implements its own validation rather than reusing
        need.py — it operates on Request, not Need.  Confirm it has no
        dependency on need.py either.
        """
        import app.algorithms.detection as det_module

        source_file = det_module.__file__
        with open(source_file, encoding="utf-8") as fh:
            source = fh.read()

        assert "from app.algorithms.need" not in source, (
            "detection.py must not import from need.py."
        )
        assert "from app.algorithms.bankers" not in source, (
            "detection.py must not import from bankers.py."
        )
