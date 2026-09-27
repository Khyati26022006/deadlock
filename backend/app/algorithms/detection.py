"""
DeadlockGuard – Matrix-based Deadlock Detection Algorithm.

This module implements the standard multi-instance resource deadlock
detection algorithm (Coffman / Holt).  It is conceptually and
architecturally separate from the Banker's Algorithm in bankers.py.

Key distinctions from the Banker's Safety Algorithm
----------------------------------------------------
1.  Inputs differ:
      Detection uses  (Allocation, Request, Available).
      Banker's uses   (Allocation, Need,    Available).
    "Request"  = what each process is *currently blocked waiting for*.
    "Need"     = the remaining maximum demand a process may ever make.
    These are not the same thing.  A process may have filed no current
    request even though its Need is large.

2.  Finish[] initialisation differs:
      Detection:  Finish[i] = True  if Allocation[i] is all zeros
                              (process holds nothing → can never be in a
                               circular wait → treat as already finished).
                  Finish[i] = False otherwise.
      Banker's:   Finish[i] = False for every process unconditionally.

3.  Interpretation of the result differs:
      Detection:  Finish[i] == False at the end → process IS DEADLOCKED
                  (confirmed circular wait, not merely "at risk").
      Banker's:   Finish[i] == False at the end → system is UNSAFE
                  (cannot guarantee completion, but deadlock has not
                   necessarily occurred yet).

This module does NOT import from bankers.py.

Public API
----------
    detect_deadlock(allocation, request, available) -> DetectionResult

All functions operate on plain Python lists.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Result data-classes
# ---------------------------------------------------------------------------


@dataclass
class DetectionSnapshot:
    """
    State of the detection algorithm at one step of the outer loop.

    Attributes
    ----------
    iteration:
        Zero-based step counter across the entire run.
    process_index:
        The process examined at this step.
    process_qualified:
        True if Request[i] ≤ Work at this step (process can proceed).
    work_before:
        Work vector before this step.
    work_after:
        Work vector after this step (unchanged when process did not qualify).
    finish_vector:
        Snapshot of the Finish array after this step.
    note:
        Plain-English explanation of what happened and why.
    """

    iteration: int
    process_index: int
    process_qualified: bool
    work_before: List[int]
    work_after: List[int]
    finish_vector: List[bool]
    note: str


@dataclass
class DetectionResult:
    """
    Result returned by :func:`detect_deadlock`.

    Attributes
    ----------
    deadlock_detected:
        True  → at least one process is confirmed deadlocked.
        False → no deadlock; all processes can eventually complete.
    deadlocked_processes:
        Indices of processes confirmed to be in a deadlock cycle.
        Empty when ``deadlock_detected`` is False.
    completed_processes:
        Indices of processes that successfully finished (Finish[i] == True).
    work_final:
        Work vector when the algorithm terminated.
    finish_final:
        Finish vector when the algorithm terminated.
    steps:
        Ordered list of :class:`DetectionSnapshot` entries — one per
        candidate process examined.  Suitable for educational display.
    message:
        One-line human-readable summary using the words NO_DEADLOCK or
        DEADLOCKED.
    """

    deadlock_detected: bool
    deadlocked_processes: List[int] = field(default_factory=list)
    completed_processes: List[int] = field(default_factory=list)
    work_final: List[int] = field(default_factory=list)
    finish_final: List[bool] = field(default_factory=list)
    steps: List[DetectionSnapshot] = field(default_factory=list)
    message: str = ""


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class DetectionError(ValueError):
    """Raised when detect_deadlock() inputs fail validation."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_detection_inputs(
    allocation: List[List[int]],
    request: List[List[int]],
    available: List[int],
) -> tuple[int, int]:
    """
    Validate all three inputs.  Returns ``(n_processes, n_resources)``.
    """
    if not allocation:
        raise DetectionError("Allocation matrix is empty.")
    if not request:
        raise DetectionError("Request matrix is empty.")
    if not available:
        raise DetectionError("Available vector is empty.")

    n_proc = len(allocation)
    n_res = len(available)

    if len(request) != n_proc:
        raise DetectionError(
            f"Request matrix has {len(request)} rows but "
            f"Allocation has {n_proc} rows. "
            "Both matrices must have one row per process."
        )

    for i, row in enumerate(allocation):
        if len(row) != n_res:
            raise DetectionError(
                f"Allocation row {i} has {len(row)} columns "
                f"but Available has {n_res} entries."
            )

    for i, row in enumerate(request):
        if len(row) != n_res:
            raise DetectionError(
                f"Request row {i} has {len(row)} columns "
                f"but Available has {n_res} entries."
            )

    for i in range(n_proc):
        for j in range(n_res):
            if allocation[i][j] < 0:
                raise DetectionError(
                    f"Allocation[{i}][{j}] = {allocation[i][j]} is negative."
                )
            if request[i][j] < 0:
                raise DetectionError(
                    f"Request[{i}][{j}] = {request[i][j]} is negative."
                )

    for j, v in enumerate(available):
        if v < 0:
            raise DetectionError(
                f"Available[{j}] = {v} is negative."
            )

    return n_proc, n_res


def _request_le_work(request_row: List[int], work: List[int]) -> bool:
    """Return True if request_row[j] <= work[j] for every resource j."""
    return all(request_row[j] <= work[j] for j in range(len(work)))


def _all_zeros(row: List[int]) -> bool:
    """Return True if every element of row is 0."""
    return all(v == 0 for v in row)


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------


def detect_deadlock(
    allocation: List[List[int]],
    request: List[List[int]],
    available: List[int],
) -> DetectionResult:
    """
    Run the matrix-based deadlock detection algorithm.

    Algorithm (standard textbook logic)
    ------------------------------------
    Inputs
        Allocation[i][j] – instances of resource j held by process i.
        Request[i][j]    – instances of resource j process i is waiting for.
        Available[j]     – currently free instances of resource j.

    Step 1 – Initialise
        Work[j]   = Available[j]   for all j
        Finish[i] = True   if Allocation[i] is all zeros
                           (process holds nothing, cannot be deadlocked)
                  = False  otherwise

    Step 2 – Main loop (repeat until no progress)
        Find index i such that:
            Finish[i] == False
            AND Request[i][j] ≤ Work[j]  for all j
        If found:
            Work[j]   += Allocation[i][j]   for all j
            Finish[i]  = True
            (restart scan from i = 0)
        Else:
            break

    Step 3 – Classify
        Finish[i] == False → process i IS DEADLOCKED
        All Finish[i] == True → NO_DEADLOCK

    Parameters
    ----------
    allocation:
        n_processes × n_resources matrix of currently held resources.
    request:
        n_processes × n_resources matrix of pending resource requests.
        A row of all zeros means the process is not waiting for anything.
    available:
        1-D vector of length n_resources.

    Returns
    -------
    DetectionResult
    """
    n_proc, n_res = _validate_detection_inputs(allocation, request, available)

    # ------------------------------------------------------------------
    # Step 1 – Initialise
    # ------------------------------------------------------------------
    work: List[int] = list(available)

    # Finish[i] = True if process i holds no resources at all.
    # Such a process cannot be part of a circular hold-and-wait chain.
    finish: List[bool] = [
        _all_zeros(allocation[i]) for i in range(n_proc)
    ]

    steps: List[DetectionSnapshot] = []
    iteration = 0

    # ------------------------------------------------------------------
    # Step 2 – Main loop
    # ------------------------------------------------------------------
    while True:
        found = False

        for i in range(n_proc):
            if finish[i]:
                continue  # already done — skip

            work_before = list(work)
            qualifies = _request_le_work(request[i], work)

            if qualifies:
                # Simulate process i completing: release its resources.
                work = [work[j] + allocation[i][j] for j in range(n_res)]
                finish[i] = True
                found = True

                steps.append(DetectionSnapshot(
                    iteration=iteration,
                    process_index=i,
                    process_qualified=True,
                    work_before=work_before,
                    work_after=list(work),
                    finish_vector=list(finish),
                    note=(
                        f"P{i} can proceed: "
                        f"Request{request[i]} ≤ Work{work_before}. "
                        f"Work updated to {list(work)} after P{i} "
                        f"releases Allocation{allocation[i]}. "
                        f"P{i} marked finished."
                    ),
                ))
                iteration += 1
                break  # restart scan from P0

            else:
                steps.append(DetectionSnapshot(
                    iteration=iteration,
                    process_index=i,
                    process_qualified=False,
                    work_before=work_before,
                    work_after=list(work),
                    finish_vector=list(finish),
                    note=(
                        f"P{i} cannot proceed: "
                        f"Request{request[i]} not ≤ Work{work_before}."
                    ),
                ))
                iteration += 1

        if not found:
            break  # no further progress possible

    # ------------------------------------------------------------------
    # Step 3 – Classify
    # ------------------------------------------------------------------
    deadlocked = [i for i, f in enumerate(finish) if not f]
    completed  = [i for i, f in enumerate(finish) if f]
    deadlock_detected = len(deadlocked) > 0

    if deadlock_detected:
        message = (
            f"DEADLOCKED. "
            f"Processes {[f'P{i}' for i in deadlocked]} are deadlocked — "
            f"they hold resources and are waiting for resources that can "
            f"never be granted in the current system state."
        )
    else:
        message = (
            "NO_DEADLOCK. "
            "All processes can eventually complete with the currently "
            "available resources."
        )

    return DetectionResult(
        deadlock_detected=deadlock_detected,
        deadlocked_processes=deadlocked,
        completed_processes=completed,
        work_final=work,
        finish_final=finish,
        steps=steps,
        message=message,
    )
