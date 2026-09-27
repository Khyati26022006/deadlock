"""
DeadlockGuard – Banker's Algorithm for deadlock avoidance.

Public API
----------
    calculate_need(allocation, maximum)  -> List[List[int]]
    safety_algorithm(allocation, need, available) -> SafetyResult
    is_safe_state(allocation, need, available) -> bool
    resource_request(process_index, request, allocation, need, available)
                                         -> RequestResult

All functions operate on plain Python lists.  Wrap inputs/outputs in
Pydantic models (AllocationMatrix, NeedMatrix, etc.) at the API layer.

Terminology note
----------------
  "UNSAFE" means the system *cannot guarantee* that all processes will
  eventually complete – it does not mean a deadlock has already occurred.
  The word "deadlock" is intentionally absent from all output messages
  produced by this module; only the caller (detection algorithms) may
  use that term.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import List, Optional

from app.algorithms.need import NeedMatrixError, calculate_need_matrix


# ---------------------------------------------------------------------------
# Result data-classes
# ---------------------------------------------------------------------------


@dataclass
class IterationSnapshot:
    """State of the Safety Algorithm at one step of the outer loop."""

    iteration: int
    process_index: int
    process_qualified: bool      # True if Need[i] <= Work at this step
    work_before: List[int]       # Work vector before this iteration
    work_after: List[int]        # Work vector after (unchanged if not qualified)
    finish_vector: List[bool]    # Finish[] snapshot after this step
    note: str                    # Human-readable explanation of what happened


@dataclass
class SafetyResult:
    """
    Result returned by :func:`safety_algorithm`.

    Attributes
    ----------
    is_safe:
        ``True``  → every process can eventually complete (SAFE state).
        ``False`` → at least one process may be permanently blocked (UNSAFE state).
    safe_sequence:
        Ordered list of process indices in the order they were granted
        resources and finished.  Empty when ``is_safe`` is ``False``.
    work_final:
        The Work vector when the algorithm terminated.
    finish_final:
        The Finish vector when the algorithm terminated.
        All ``True`` iff ``is_safe`` is ``True``.
    steps:
        Detailed per-iteration trace, one entry per candidate process
        examined.  Suitable for step-by-step educational display.
    message:
        One-line human-readable summary.
    """

    is_safe: bool
    safe_sequence: List[int] = field(default_factory=list)
    work_final: List[int] = field(default_factory=list)
    finish_final: List[bool] = field(default_factory=list)
    steps: List[IterationSnapshot] = field(default_factory=list)
    message: str = ""


@dataclass
class RequestResult:
    """
    Result returned by :func:`resource_request`.

    Attributes
    ----------
    granted:
        ``True`` → request was granted; the returned matrices reflect
        the new state.
        ``False`` → request was denied; all matrices are unchanged
        (original state rolled back).
    reason:
        Human-readable explanation of why the request was granted or denied.
    allocation:
        The allocation matrix after the decision (new if granted, original
        if denied).
    need:
        The need matrix after the decision.
    available:
        The available vector after the decision.
    safety_result:
        The :class:`SafetyResult` of the hypothetical state that was tested.
        Always populated so the caller can inspect the full trace.
    """

    granted: bool
    reason: str
    allocation: List[List[int]]
    need: List[List[int]]
    available: List[int]
    safety_result: Optional[SafetyResult] = None


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class BankersError(ValueError):
    """Raised when Banker's Algorithm inputs fail validation."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_inputs(
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> tuple[int, int]:
    """
    Validate the three core inputs shared by safety_algorithm and
    resource_request.  Returns ``(n_processes, n_resources)``.
    """
    if not allocation:
        raise BankersError("Allocation matrix is empty.")
    if not need:
        raise BankersError("Need matrix is empty.")
    if not available:
        raise BankersError("Available vector is empty.")

    n_proc = len(allocation)
    n_res = len(available)

    if len(need) != n_proc:
        raise BankersError(
            f"Need matrix has {len(need)} rows but Allocation has {n_proc} rows."
        )

    for i, row in enumerate(allocation):
        if len(row) != n_res:
            raise BankersError(
                f"Allocation row {i} has {len(row)} columns "
                f"but Available has {n_res} entries."
            )

    for i, row in enumerate(need):
        if len(row) != n_res:
            raise BankersError(
                f"Need row {i} has {len(row)} columns "
                f"but Available has {n_res} entries."
            )

    for i in range(n_proc):
        for j in range(n_res):
            if allocation[i][j] < 0:
                raise BankersError(
                    f"Allocation[{i}][{j}] = {allocation[i][j]} is negative."
                )
            if need[i][j] < 0:
                raise BankersError(
                    f"Need[{i}][{j}] = {need[i][j]} is negative."
                )

    for j, v in enumerate(available):
        if v < 0:
            raise BankersError(
                f"Available[{j}] = {v} is negative."
            )

    return n_proc, n_res


def _need_le_work(need_row: List[int], work: List[int]) -> bool:
    """Return True if need_row[j] <= work[j] for every j."""
    return all(need_row[j] <= work[j] for j in range(len(work)))


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def calculate_need(
    allocation: List[List[int]],
    maximum: List[List[int]],
) -> List[List[int]]:
    """
    Compute the Need matrix as ``Maximum − Allocation``.

    Thin wrapper around :func:`~app.algorithms.need.calculate_need_matrix`
    so callers only need to import from this module.

    Raises
    ------
    NeedMatrixError
        Propagated from the underlying function on any validation failure.
    """
    return calculate_need_matrix(allocation, maximum)


def safety_algorithm(
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> SafetyResult:
    """
    Run the Banker's Safety Algorithm on the given system state.

    Algorithm (exact textbook logic)
    ---------------------------------
    1.  Work  = copy of Available
        Finish[i] = False  for every i

    2.  Loop:
          Find i such that Finish[i] == False
                       AND Need[i] <= Work  (element-wise)
          If found:
            Work    = Work + Allocation[i]
            Finish[i] = True
            (record i in safe sequence)
          Else:
            break

    3.  If all Finish[i] == True → SAFE, return safe_sequence
        Else                     → UNSAFE, return empty safe_sequence

    Parameters
    ----------
    allocation:
        n_processes × n_resources matrix.
    need:
        n_processes × n_resources matrix.  Must equal Maximum − Allocation.
    available:
        1-D vector of length n_resources.

    Returns
    -------
    SafetyResult
    """
    n_proc, n_res = _validate_inputs(allocation, need, available)

    # Step 1 – initialise
    work: List[int] = list(available)           # mutable working copy
    finish: List[bool] = [False] * n_proc
    safe_sequence: List[int] = []
    steps: List[IterationSnapshot] = []
    iteration = 0

    # Step 2 – main loop
    while True:
        found = False
        for i in range(n_proc):
            if finish[i]:
                continue  # already finished

            work_before = list(work)
            qualifies = _need_le_work(need[i], work)

            if qualifies:
                # Grant resources hypothetically: Work += Allocation[i]
                work = [work[j] + allocation[i][j] for j in range(n_res)]
                finish[i] = True
                safe_sequence.append(i)
                found = True

                steps.append(IterationSnapshot(
                    iteration=iteration,
                    process_index=i,
                    process_qualified=True,
                    work_before=work_before,
                    work_after=list(work),
                    finish_vector=list(finish),
                    note=(
                        f"P{i} qualifies: Need{need[i]} ≤ Work{work_before}. "
                        f"Work updated to {work}. P{i} marked finished."
                    ),
                ))
                iteration += 1
                break  # restart scan from P0 (textbook: find ANY i each pass)

            else:
                steps.append(IterationSnapshot(
                    iteration=iteration,
                    process_index=i,
                    process_qualified=False,
                    work_before=work_before,
                    work_after=list(work),
                    finish_vector=list(finish),
                    note=(
                        f"P{i} does not qualify: Need{need[i]} "
                        f"not ≤ Work{work_before}."
                    ),
                ))
                iteration += 1

        if not found:
            break  # no progress possible this pass → stop

    # Step 3 – determine safety
    is_safe = all(finish)

    if is_safe:
        message = (
            f"System is in a SAFE state. "
            f"Safe sequence: {[f'P{i}' for i in safe_sequence]}."
        )
    else:
        blocked = [i for i, f in enumerate(finish) if not f]
        message = (
            f"System is in an UNSAFE state. "
            f"Processes {[f'P{i}' for i in blocked]} cannot be guaranteed "
            f"to complete — the system cannot guarantee all processes "
            f"will finish with current resource availability."
        )

    return SafetyResult(
        is_safe=is_safe,
        safe_sequence=safe_sequence,
        work_final=work,
        finish_final=finish,
        steps=steps,
        message=message,
    )


def is_safe_state(
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> bool:
    """
    Convenience predicate: return ``True`` iff the current state is safe.

    Thin wrapper around :func:`safety_algorithm` for callers that only
    need a boolean answer.
    """
    return safety_algorithm(allocation, need, available).is_safe


def resource_request(
    process_index: int,
    request: List[int],
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> RequestResult:
    """
    Attempt to grant a resource request using the Banker's Algorithm.

    Steps (exact textbook logic)
    ----------------------------
    1. Validate process_index and request vector length.
    2. Check Request[i] ≤ Need[i]  (element-wise).
       If violated → DENY immediately (process exceeds its declared maximum).
    3. Check Request[i] ≤ Available (element-wise).
       If violated → DENY immediately (resources not currently available).
    4. Tentatively apply the request:
         Available      -= Request
         Allocation[i]  += Request
         Need[i]        -= Request
    5. Run safety_algorithm() on the resulting hypothetical state.
    6. If SAFE  → keep the new state, return GRANTED.
       If UNSAFE → roll back to original state, return DENIED.

    Parameters
    ----------
    process_index:
        Index (0-based) of the requesting process in the allocation/need
        matrices.
    request:
        1-D vector of length n_resources: how many additional instances
        of each resource the process is requesting.
    allocation:
        Current allocation matrix (will be deep-copied; originals unchanged
        if the request is denied).
    need:
        Current need matrix.
    available:
        Current available vector.

    Returns
    -------
    RequestResult
    """
    n_proc, n_res = _validate_inputs(allocation, need, available)

    # --- validate process_index ---
    if not (0 <= process_index < n_proc):
        raise BankersError(
            f"process_index {process_index} is out of range "
            f"(0..{n_proc - 1})."
        )

    # --- validate request vector ---
    if len(request) != n_res:
        raise BankersError(
            f"Request vector has length {len(request)} "
            f"but there are {n_res} resources."
        )
    for j, v in enumerate(request):
        if v < 0:
            raise BankersError(
                f"Request[{j}] = {v} is negative. "
                "Request amounts must be ≥ 0."
            )

    # Step 2 – Request ≤ Need?
    for j in range(n_res):
        if request[j] > need[process_index][j]:
            return RequestResult(
                granted=False,
                reason=(
                    f"Request[{j}] = {request[j]} exceeds "
                    f"Need[P{process_index}][{j}] = {need[process_index][j]}. "
                    f"P{process_index} is asking for more resources than it "
                    f"declared as its maximum demand."
                ),
                allocation=copy.deepcopy(allocation),
                need=copy.deepcopy(need),
                available=list(available),
            )

    # Step 3 – Request ≤ Available?
    for j in range(n_res):
        if request[j] > available[j]:
            return RequestResult(
                granted=False,
                reason=(
                    f"Request[{j}] = {request[j]} exceeds "
                    f"Available[{j}] = {available[j]}. "
                    f"P{process_index} must wait — insufficient resources "
                    f"are currently available."
                ),
                allocation=copy.deepcopy(allocation),
                need=copy.deepcopy(need),
                available=list(available),
            )

    # Step 4 – tentatively apply the request (work on deep copies)
    new_allocation = copy.deepcopy(allocation)
    new_need = copy.deepcopy(need)
    new_available = list(available)

    for j in range(n_res):
        new_available[j] -= request[j]
        new_allocation[process_index][j] += request[j]
        new_need[process_index][j] -= request[j]

    # Step 5 – test safety on the hypothetical state
    safety = safety_algorithm(new_allocation, new_need, new_available)

    # Step 6 – grant or roll back
    if safety.is_safe:
        return RequestResult(
            granted=True,
            reason=(
                f"Request by P{process_index} GRANTED. "
                f"System remains in a safe state. "
                f"Safe sequence: "
                f"{[f'P{i}' for i in safety.safe_sequence]}."
            ),
            allocation=new_allocation,
            need=new_need,
            available=new_available,
            safety_result=safety,
        )
    else:
        # Roll back: return originals (copies so the caller's data is untouched)
        return RequestResult(
            granted=False,
            reason=(
                f"Request by P{process_index} DENIED. "
                f"Granting it would leave the system in an UNSAFE state — "
                f"the system cannot guarantee all processes will complete. "
                f"P{process_index} must wait."
            ),
            allocation=copy.deepcopy(allocation),
            need=copy.deepcopy(need),
            available=list(available),
            safety_result=safety,
        )
