"""
Unit tests for Deadlock Prevention Analysis (prevention.py).

Required test cases (per spec)
-------------------------------
1. Hold-and-Wait PRESENT  – process holds resources AND has remaining need.
2. Hold-and-Wait ABSENT   – every process either holds nothing OR needs nothing.
3. Circular Wait PRESENT  – matches the classic 2-process circular deadlock.
4. Circular Wait ABSENT   – wait-for graph has no cycle.
5. All 4 conditions always return a result (never null/missing) regardless
   of scenario shape.

Additional coverage
--------------------
- Mutual exclusion: present when resource is over-subscribed, absent when not.
- No-preemption: always present=True (policy constant).
- analyze_prevention(): summary correct for 0, partial, and all-4-present cases.
- ConditionResult structure: all required fields populated on every call.
- PreventionError raised on malformed inputs.
- API endpoint: POST /api/prevention/analyze happy path + validation error.
- Module isolation: prevention.py must not import detection.py or bankers.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.algorithms.prevention import (
    ConditionResult,
    PreventionError,
    PreventionResult,
    analyze_prevention,
    check_circular_wait,
    check_hold_and_wait,
    check_mutual_exclusion,
    check_no_preemption,
)
from app.main import app

client = TestClient(app)


# ===========================================================================
# Shared fixtures / helpers
# ===========================================================================

def make_processes(*ids: str) -> list:
    return [{"id": pid, "name": f"Process {pid}"} for pid in ids]


def make_resources(*specs: tuple) -> list:
    """specs: list of (id, total_instances)"""
    return [{"id": rid, "name": f"Resource {rid}", "total_instances": total}
            for rid, total in specs]


def zero_matrix(rows: int, cols: int) -> list:
    return [[0] * cols for _ in range(rows)]


# ---------------------------------------------------------------------------
# Minimal 2-process, 2-resource scenario used across many tests.
#
# State:
#   Allocation = [[1,0],[0,1]]   (P0 holds R0, P1 holds R1)
#   Need       = [[1,1],[1,1]]   (both still need both)
#   Available  = [0,0]
#   Resources  = R0(total=1), R1(total=1)
# ---------------------------------------------------------------------------
PROCS_2  = make_processes("P0", "P1")
RES_2    = make_resources(("R0", 1), ("R1", 1))
ALLOC_2  = [[1, 0], [0, 1]]
NEED_2   = [[1, 1], [1, 1]]
AVAIL_2  = [0, 0]

# Circular request: P0 wants R1, P1 wants R0
REQUEST_CIRCULAR = [[0, 1], [1, 0]]

# No pending requests
REQUEST_ZERO = zero_matrix(2, 2)


# ===========================================================================
# Required test case 1 – Hold-and-Wait PRESENT
# ===========================================================================

class TestHoldAndWaitPresent:
    """A process holds ≥1 resource AND has nonzero remaining need."""

    def test_hold_and_wait_is_present(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.present is True

    def test_both_processes_implicated(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert "P0" in result.affected_processes
        assert "P1" in result.affected_processes

    def test_condition_name_correct(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.condition_name == "Hold and Wait"

    def test_explanation_mentions_hold(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert "hold" in result.explanation.lower() or "holding" in result.explanation.lower()

    def test_explanation_mentions_process_ids(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert "P0" in result.explanation or "P1" in result.explanation

    def test_prevention_strategy_populated(self):
        result = check_hold_and_wait(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert len(result.prevention_strategy) > 30

    def test_partial_hold_and_wait(self):
        """Only P0 holds + needs; P1 holds nothing."""
        procs  = make_processes("P0", "P1")
        res    = make_resources(("R0", 2))
        alloc  = [[1], [0]]        # P0 holds R0, P1 holds nothing
        need   = [[1], [0]]        # P0 still needs more, P1 needs nothing
        avail  = [1]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is True
        assert "P0" in result.affected_processes
        assert "P1" not in result.affected_processes

    def test_larger_scenario_multiple_holding(self):
        """5 processes; P0, P2, P4 exhibit hold-and-wait."""
        procs = make_processes("P0", "P1", "P2", "P3", "P4")
        res   = make_resources(("R0", 5), ("R1", 5), ("R2", 5))
        alloc = [
            [0, 1, 0],  # P0 holds R1
            [2, 0, 0],  # P1 holds R0
            [3, 0, 2],  # P2 holds R0, R2
            [2, 1, 1],  # P3 holds all
            [0, 0, 2],  # P4 holds R2
        ]
        need = [
            [7, 4, 3],  # P0 still needs a lot
            [0, 0, 0],  # P1 needs nothing → no hold-and-wait
            [6, 0, 0],  # P2 still needs R0
            [0, 0, 0],  # P3 needs nothing → no hold-and-wait
            [4, 3, 1],  # P4 still needs
        ]
        avail = [3, 3, 2]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is True
        assert "P0" in result.affected_processes
        assert "P2" in result.affected_processes
        assert "P4" in result.affected_processes
        # P1 and P3 hold resources but need nothing → NOT hold-and-wait
        assert "P1" not in result.affected_processes
        assert "P3" not in result.affected_processes


# ===========================================================================
# Required test case 2 – Hold-and-Wait ABSENT
# ===========================================================================

class TestHoldAndWaitAbsent:
    """Every process either holds nothing or wants nothing additional."""

    def test_no_hold_and_wait_all_zero_alloc(self):
        """No process holds anything → condition absent."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 2), ("R1", 2))
        alloc = [[0, 0], [0, 0]]   # nobody holds anything
        need  = [[1, 1], [2, 0]]   # both have need — but can't hold-and-wait
        avail = [2, 2]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is False
        assert result.affected_processes == []

    def test_no_hold_and_wait_all_zero_need(self):
        """Processes hold resources but need nothing more → condition absent."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 2), ("R1", 2))
        alloc = [[1, 0], [0, 1]]   # each holds one resource
        need  = [[0, 0], [0, 0]]   # neither needs anything else
        avail = [1, 1]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is False
        assert result.affected_processes == []

    def test_explanation_says_not_present(self):
        procs = make_processes("P0")
        res   = make_resources(("R0", 1))
        alloc = [[0]]
        need  = [[1]]
        avail = [1]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is False
        assert "NOT" in result.explanation or "not" in result.explanation

    def test_single_process_holds_needs_nothing(self):
        procs = make_processes("P0")
        res   = make_resources(("R0", 3))
        alloc = [[2]]
        need  = [[0]]   # holds 2, needs 0 → no hold-and-wait
        avail = [1]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is False

    def test_single_process_needs_holds_nothing(self):
        procs = make_processes("P0")
        res   = make_resources(("R0", 3))
        alloc = [[0]]   # holds nothing
        need  = [[3]]   # needs everything — but not holding-and-waiting
        avail = [3]
        result = check_hold_and_wait(procs, res, alloc, need, avail)
        assert result.present is False


# ===========================================================================
# Required test case 3 – Circular Wait PRESENT
# ===========================================================================

class TestCircularWaitPresent:
    """Classic 2-process circular wait: P0→P1→P0."""

    def test_circular_wait_detected(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        assert result.present is True

    def test_condition_name_correct(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        assert result.condition_name == "Circular Wait"

    def test_affected_processes_populated(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        # Both processes are in the cycle
        assert len(result.affected_processes) >= 2
        assert "P0" in result.affected_processes
        assert "P1" in result.affected_processes

    def test_explanation_contains_cycle_info(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        explanation_lower = result.explanation.lower()
        assert "cycle" in explanation_lower or "circular" in explanation_lower

    def test_prevention_strategy_mentions_ordering(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        strategy_lower = result.prevention_strategy.lower()
        assert "order" in strategy_lower

    def test_longer_cycle_detected(self):
        """3-process chain: P0→P1→P2→P0."""
        procs = make_processes("P0", "P1", "P2")
        res   = make_resources(("R0", 1), ("R1", 1), ("R2", 1))
        alloc = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]   # each holds one resource
        need  = [[0, 1, 0], [0, 0, 1], [1, 0, 0]]
        avail = [0, 0, 0]
        # P0 wants R1 (held by P1), P1 wants R2 (held by P2), P2 wants R0 (held by P0)
        request = [[0, 1, 0], [0, 0, 1], [1, 0, 0]]
        result = check_circular_wait(procs, res, alloc, need, avail, request)
        assert result.present is True
        assert len(result.affected_processes) >= 3

    def test_4_process_deadlock_cycle(self):
        """4-process circular wait matching the detection test."""
        procs  = make_processes("P0", "P1", "P2", "P3")
        res    = make_resources(("R0", 2), ("R1", 2))
        alloc  = [[1, 0], [0, 1], [1, 0], [0, 1]]
        need   = [[0, 1], [1, 0], [0, 1], [1, 0]]
        avail  = [0, 0]
        req    = [[0, 1], [1, 0], [0, 1], [1, 0]]
        result = check_circular_wait(procs, res, alloc, need, avail, req)
        assert result.present is True


# ===========================================================================
# Required test case 4 – Circular Wait ABSENT
# ===========================================================================

class TestCircularWaitAbsent:
    """Wait-for graph has no cycle."""

    def test_no_cycle_zero_requests(self):
        """Nobody waiting → no edges → no cycle."""
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO
        )
        assert result.present is False

    def test_no_cycle_with_some_requests_but_resources_available(self):
        """P0 requests R1 but R1 has a free instance → P0 is not blocked."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 2), ("R1", 2))
        alloc = [[1, 0], [0, 1]]
        need  = [[0, 1], [1, 0]]
        avail = [1, 1]   # both resources have free instances
        req   = [[0, 1], [1, 0]]
        result = check_circular_wait(procs, res, alloc, need, avail, req)
        assert result.present is False

    def test_no_cycle_unidirectional_wait(self):
        """P0 waits for R0 (held by P1), but P1 doesn't wait for anything → no cycle."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 1), ("R1", 1))
        alloc = [[0, 1], [1, 0]]   # P0 holds R1, P1 holds R0
        need  = [[1, 0], [0, 0]]
        avail = [0, 0]
        req   = [[1, 0], [0, 0]]   # only P0 is waiting; P1 is not → no cycle
        result = check_circular_wait(procs, res, alloc, need, avail, req)
        assert result.present is False
        assert result.affected_processes == []

    def test_no_cycle_5_process_safe_scenario(self):
        """Classic 5x3 textbook safe scenario with zero requests → no cycle."""
        procs = make_processes("P0", "P1", "P2", "P3", "P4")
        res   = make_resources(("A", 10), ("B", 5), ("C", 7))
        alloc = [
            [0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]
        ]
        need = [
            [7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]
        ]
        avail = [3, 3, 2]
        req   = zero_matrix(5, 3)
        result = check_circular_wait(procs, res, alloc, need, avail, req)
        assert result.present is False

    def test_explanation_mentions_no_cycle(self):
        result = check_circular_wait(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO
        )
        lower = result.explanation.lower()
        assert "not" in lower or "no" in lower


# ===========================================================================
# Required test case 5 – All 4 conditions always return a result
# ===========================================================================

class TestAllConditionsAlwaysReturned:
    """analyze_prevention() never returns null/missing for any condition."""

    SCENARIOS = [
        # (label, procs, res, alloc, need, avail, request)
        (
            "minimal 1x1",
            make_processes("P0"),
            make_resources(("R0", 1)),
            [[1]], [[0]], [0], [[0]],
        ),
        (
            "2x2 circular deadlock",
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR,
        ),
        (
            "2x2 zero requests",
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO,
        ),
        (
            "5x3 classic",
            make_processes("P0", "P1", "P2", "P3", "P4"),
            make_resources(("A", 10), ("B", 5), ("C", 7)),
            [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
            [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]],
            [3, 3, 2],
            zero_matrix(5, 3),
        ),
        (
            "all zeros",
            make_processes("P0", "P1", "P2"),
            make_resources(("R0", 5), ("R1", 5)),
            [[0, 0], [0, 0], [0, 0]],
            [[0, 0], [0, 0], [0, 0]],
            [5, 5],
            zero_matrix(3, 2),
        ),
    ]

    @pytest.mark.parametrize("label,procs,res,alloc,need,avail,req", SCENARIOS)
    def test_all_four_conditions_present_in_result(
        self, label, procs, res, alloc, need, avail, req
    ):
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        assert isinstance(result, PreventionResult), f"[{label}] result is not PreventionResult"
        assert result.mutual_exclusion is not None,  f"[{label}] mutual_exclusion missing"
        assert result.hold_and_wait    is not None,  f"[{label}] hold_and_wait missing"
        assert result.no_preemption    is not None,  f"[{label}] no_preemption missing"
        assert result.circular_wait    is not None,  f"[{label}] circular_wait missing"

    @pytest.mark.parametrize("label,procs,res,alloc,need,avail,req", SCENARIOS)
    def test_every_condition_has_required_fields(
        self, label, procs, res, alloc, need, avail, req
    ):
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        for cond in [
            result.mutual_exclusion,
            result.hold_and_wait,
            result.no_preemption,
            result.circular_wait,
        ]:
            assert isinstance(cond, ConditionResult), \
                f"[{label}] {cond} is not ConditionResult"
            assert isinstance(cond.present, bool), \
                f"[{label}] {cond.condition_name}: present is not bool"
            assert isinstance(cond.explanation, str) and len(cond.explanation) > 0, \
                f"[{label}] {cond.condition_name}: explanation empty"
            assert isinstance(cond.prevention_strategy, str) and len(cond.prevention_strategy) > 0, \
                f"[{label}] {cond.condition_name}: prevention_strategy empty"
            assert isinstance(cond.affected_processes, list), \
                f"[{label}] {cond.condition_name}: affected_processes not a list"
            assert isinstance(cond.affected_resources, list), \
                f"[{label}] {cond.condition_name}: affected_resources not a list"

    @pytest.mark.parametrize("label,procs,res,alloc,need,avail,req", SCENARIOS)
    def test_summary_always_populated(
        self, label, procs, res, alloc, need, avail, req
    ):
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        assert isinstance(result.summary, str) and len(result.summary) > 0, \
            f"[{label}] summary is empty"

    @pytest.mark.parametrize("label,procs,res,alloc,need,avail,req", SCENARIOS)
    def test_conditions_present_count_in_range(
        self, label, procs, res, alloc, need, avail, req
    ):
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        assert 0 <= result.conditions_present <= 4, \
            f"[{label}] conditions_present={result.conditions_present} out of range"

    @pytest.mark.parametrize("label,procs,res,alloc,need,avail,req", SCENARIOS)
    def test_count_matches_individual_results(
        self, label, procs, res, alloc, need, avail, req
    ):
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        manual_count = sum([
            result.mutual_exclusion.present,
            result.hold_and_wait.present,
            result.no_preemption.present,
            result.circular_wait.present,
        ])
        assert result.conditions_present == manual_count, \
            f"[{label}] conditions_present={result.conditions_present} != manual count={manual_count}"


# ===========================================================================
# Mutual Exclusion condition
# ===========================================================================

class TestMutualExclusion:
    def test_present_when_resource_oversubscribed(self):
        """R0 has 1 instance but 2 processes both hold/need it → exclusive."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 1))
        alloc = [[1], [0]]
        need  = [[0], [1]]   # P1 still needs R0
        avail = [0]
        result = check_mutual_exclusion(procs, res, alloc, need, avail)
        assert result.present is True
        assert "R0" in result.affected_resources

    def test_absent_when_enough_instances(self):
        """R0 has 3 instances and only 2 processes are interested → no exclusion."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 3))
        alloc = [[1], [1]]
        need  = [[0], [0]]
        avail = [1]
        result = check_mutual_exclusion(procs, res, alloc, need, avail)
        assert result.present is False

    def test_condition_name(self):
        result = check_mutual_exclusion(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.condition_name == "Mutual Exclusion"

    def test_prevention_strategy_mentions_sharing(self):
        result = check_mutual_exclusion(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert "shar" in result.prevention_strategy.lower()

    def test_absent_when_no_process_interested(self):
        """No process allocates or needs a resource → it's not forcing exclusion."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 1), ("R1", 1))
        alloc = [[0, 0], [0, 0]]
        need  = [[0, 0], [0, 0]]
        avail = [1, 1]
        result = check_mutual_exclusion(procs, res, alloc, need, avail)
        assert result.present is False


# ===========================================================================
# No-Preemption condition
# ===========================================================================

class TestNoPreemption:
    def test_always_present(self):
        result = check_no_preemption(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.present is True

    def test_present_on_minimal_scenario(self):
        procs = make_processes("P0")
        res   = make_resources(("R0", 1))
        result = check_no_preemption(procs, res, [[0]], [[0]], [1])
        assert result.present is True

    def test_present_on_all_zero_scenario(self):
        procs = make_processes("P0", "P1", "P2")
        res   = make_resources(("R0", 5))
        result = check_no_preemption(procs, res, [[0],[0],[0]], [[0],[0],[0]], [5])
        assert result.present is True

    def test_condition_name(self):
        result = check_no_preemption(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.condition_name == "No Preemption"

    def test_explanation_mentions_policy(self):
        result = check_no_preemption(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        lower = result.explanation.lower()
        assert "policy" in lower or "default" in lower or "design" in lower

    def test_prevention_strategy_mentions_preemption(self):
        result = check_no_preemption(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert "preempt" in result.prevention_strategy.lower()

    def test_affected_lists_empty(self):
        """No-preemption is structural; no specific processes or resources."""
        result = check_no_preemption(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2)
        assert result.affected_processes == []
        assert result.affected_resources == []


# ===========================================================================
# analyze_prevention – summary correctness
# ===========================================================================

class TestAnalyzeSummary:
    def test_all_four_present_summary(self):
        """Circular + hold-and-wait + ME + NP all present → all-4 summary."""
        result = analyze_prevention(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_CIRCULAR
        )
        # No-preemption is always True; ME is True (1 instance each); HAW is True; CW is True
        assert result.conditions_present == 4
        assert "ALL FOUR" in result.summary or "all four" in result.summary.lower()

    def test_zero_conditions_possible_only_if_me_absent(self):
        """
        With enough resource instances, ME absent.
        With zero alloc, HAW absent.
        NP is always True.
        → minimum is 1 (NP always present), not 0.
        """
        procs = make_processes("P0")
        res   = make_resources(("R0", 10))  # plenty of instances
        alloc = [[0]]
        need  = [[0]]
        avail = [10]
        req   = [[0]]
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        # NP is always True → at least 1 condition present
        assert result.conditions_present >= 1
        assert result.no_preemption.present is True

    def test_partial_conditions_summary_mentions_absent(self):
        """When not all 4 are present, summary should mention absent condition(s)."""
        procs = make_processes("P0", "P1")
        res   = make_resources(("R0", 1), ("R1", 1))
        alloc = [[1, 0], [0, 1]]
        need  = [[0, 0], [0, 0]]   # HAW absent (holds but needs nothing)
        avail = [0, 0]
        req   = REQUEST_ZERO       # Circular wait absent
        result = analyze_prevention(procs, res, alloc, need, avail, req)
        assert result.hold_and_wait.present is False
        assert result.circular_wait.present is False
        # Summary should note that not all conditions are present
        assert result.conditions_present < 4
        assert len(result.summary) > 0

    def test_conditions_present_is_int(self):
        result = analyze_prevention(
            PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO
        )
        assert isinstance(result.conditions_present, int)


# ===========================================================================
# PreventionError – input validation
# ===========================================================================

class TestPreventionError:
    def test_empty_processes_raises(self):
        with pytest.raises(PreventionError, match="empty"):
            analyze_prevention([], RES_2, ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO)

    def test_empty_resources_raises(self):
        with pytest.raises(PreventionError, match="empty"):
            analyze_prevention(PROCS_2, [], ALLOC_2, NEED_2, AVAIL_2, REQUEST_ZERO)

    def test_allocation_row_count_mismatch_raises(self):
        bad_alloc = [[1, 0]]   # only 1 row for 2 processes
        with pytest.raises(PreventionError, match="rows"):
            analyze_prevention(PROCS_2, RES_2, bad_alloc, NEED_2, AVAIL_2, REQUEST_ZERO)

    def test_need_row_count_mismatch_raises(self):
        bad_need = [[1, 1]]    # only 1 row for 2 processes
        with pytest.raises(PreventionError, match="rows"):
            analyze_prevention(PROCS_2, RES_2, ALLOC_2, bad_need, AVAIL_2, REQUEST_ZERO)

    def test_available_length_mismatch_raises(self):
        with pytest.raises(PreventionError, match="entries"):
            analyze_prevention(PROCS_2, RES_2, ALLOC_2, NEED_2, [0], REQUEST_ZERO)

    def test_request_matrix_row_count_mismatch_raises(self):
        bad_req = [[0, 0]]   # only 1 row for 2 processes
        with pytest.raises(PreventionError, match="rows"):
            analyze_prevention(PROCS_2, RES_2, ALLOC_2, NEED_2, AVAIL_2, bad_req)

    def test_allocation_col_mismatch_raises(self):
        bad_alloc = [[1], [0]]   # 1 col but 2 resources
        with pytest.raises(PreventionError, match="columns"):
            analyze_prevention(PROCS_2, RES_2, bad_alloc, NEED_2, AVAIL_2, REQUEST_ZERO)


# ===========================================================================
# Module isolation
# ===========================================================================

class TestModuleIsolation:
    def test_prevention_does_not_import_detection(self):
        import app.algorithms.prevention as prev_module
        source_file = prev_module.__file__
        with open(source_file, encoding="utf-8") as fh:
            source = fh.read()
        assert "from app.algorithms.detection" not in source, \
            "prevention.py must not import from detection.py"
        assert "import detection" not in source, \
            "prevention.py must not import detection"

    def test_prevention_does_not_import_bankers(self):
        import app.algorithms.prevention as prev_module
        source_file = prev_module.__file__
        with open(source_file, encoding="utf-8") as fh:
            source = fh.read()
        assert "from app.algorithms.bankers" not in source, \
            "prevention.py must not import from bankers.py"
        assert "import bankers" not in source, \
            "prevention.py must not import bankers"


# ===========================================================================
# API endpoint – POST /api/prevention/analyze
# ===========================================================================

# Shared payload builder
def _make_payload(
    procs=None, res=None, alloc=None, need=None, avail=None, req=None
):
    procs = procs or [{"id": "P0", "name": "P0"}, {"id": "P1", "name": "P1"}]
    res   = res   or [
        {"id": "R0", "name": "R0", "total_instances": 1},
        {"id": "R1", "name": "R1", "total_instances": 1},
    ]
    alloc = alloc or [[1, 0], [0, 1]]
    need  = need  or [[1, 1], [1, 1]]
    avail = avail or [0, 0]
    req   = req   or [[0, 1], [1, 0]]
    return {
        "processes": procs,
        "resources": res,
        "allocation": alloc,
        "need": need,
        "available": avail,
        "request_matrix": req,
    }


class TestPreventionAPIEndpoint:
    def test_happy_path_returns_200(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        assert resp.status_code == 200

    def test_response_has_all_four_conditions(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        assert "mutual_exclusion" in body
        assert "hold_and_wait"    in body
        assert "no_preemption"    in body
        assert "circular_wait"    in body

    def test_response_has_conditions_present_and_summary(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        assert "conditions_present" in body
        assert "summary" in body
        assert isinstance(body["conditions_present"], int)
        assert len(body["summary"]) > 0

    def test_circular_deadlock_payload_all_four_present(self):
        """Full circular deadlock → all 4 Coffman conditions present."""
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        assert body["conditions_present"] == 4
        assert body["circular_wait"]["present"] is True
        assert body["hold_and_wait"]["present"] is True
        assert body["no_preemption"]["present"] is True
        assert body["mutual_exclusion"]["present"] is True

    def test_no_hold_and_wait_payload(self):
        """Send a scenario where HAW is absent → field is False."""
        payload = _make_payload(
            need=[[0, 0], [0, 0]],   # nobody needs anything
            req=[[0, 0], [0, 0]],
        )
        resp = client.post("/api/prevention/analyze", json=payload)
        body = resp.json()
        assert resp.status_code == 200
        assert body["hold_and_wait"]["present"] is False

    def test_each_condition_has_required_fields(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        for key in ["mutual_exclusion", "hold_and_wait", "no_preemption", "circular_wait"]:
            cond = body[key]
            assert "condition_name"       in cond, f"{key}: missing condition_name"
            assert "present"              in cond, f"{key}: missing present"
            assert "explanation"          in cond, f"{key}: missing explanation"
            assert "prevention_strategy"  in cond, f"{key}: missing prevention_strategy"
            assert "affected_processes"   in cond, f"{key}: missing affected_processes"
            assert "affected_resources"   in cond, f"{key}: missing affected_resources"

    def test_validation_error_missing_field_returns_422(self):
        """Omitting a required field should return 422 Unprocessable Entity."""
        bad = _make_payload()
        del bad["request_matrix"]
        resp = client.post("/api/prevention/analyze", json=bad)
        assert resp.status_code == 422

    def test_validation_error_wrong_row_count_returns_400(self):
        """Mismatched allocation rows → PreventionError → 400."""
        bad = _make_payload(alloc=[[1, 0]])   # 1 row for 2 processes
        resp = client.post("/api/prevention/analyze", json=bad)
        assert resp.status_code == 400
        body = resp.json()
        assert body["error"] == "PreventionError"
        assert len(body["detail"]) > 0

    def test_no_preemption_always_true_in_response(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        assert body["no_preemption"]["present"] is True

    def test_affected_processes_is_list_in_response(self):
        resp = client.post("/api/prevention/analyze", json=_make_payload())
        body = resp.json()
        for key in ["mutual_exclusion", "hold_and_wait", "no_preemption", "circular_wait"]:
            assert isinstance(body[key]["affected_processes"], list)
            assert isinstance(body[key]["affected_resources"], list)
