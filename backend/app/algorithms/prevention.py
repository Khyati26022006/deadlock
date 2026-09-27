"""
DeadlockGuard – Deadlock Prevention Analysis.

Prevention is fundamentally different from Detection and Avoidance:
  - Detection  asks "is a deadlock happening RIGHT NOW?"
  - Avoidance  asks "would granting this request RISK a future deadlock?"
  - Prevention asks "does the system STRUCTURE allow the four Coffman
                     conditions that are necessary for deadlock to exist?"

The Four Coffman Conditions (all four must hold simultaneously for deadlock):
  1. Mutual Exclusion  – resources are non-sharable; only one process at a time.
  2. Hold and Wait     – a process holds ≥1 resource while waiting for more.
  3. No Preemption     – resources can only be released voluntarily by the holder.
  4. Circular Wait     – there exists a circular chain P0→P1→…→Pk→P0 in the
                         wait-for graph.

Eliminating ANY ONE of these conditions prevents deadlock.
This module analyses which conditions are present in a given scenario and
describes the standard prevention strategy for each one found.

Public API
----------
    check_mutual_exclusion(scenario)              -> ConditionResult
    check_hold_and_wait(scenario)                 -> ConditionResult
    check_no_preemption(scenario)                 -> ConditionResult
    check_circular_wait(scenario, request_matrix) -> ConditionResult
    analyze_prevention(scenario, request_matrix)  -> PreventionResult

"scenario" is a plain dict with keys:
    processes   – list of {"id": str, ...}
    resources   – list of {"id": str, "total_instances": int, ...}
    allocation  – List[List[int]]  (n_processes × n_resources)
    need        – List[List[int]]  (n_processes × n_resources)
    available   – List[int]        (n_resources)

request_matrix is List[List[int]] (n_processes × n_resources):
    request_matrix[i][j] = instances of resource j that process i is
    CURRENTLY waiting for (not the worst-case need).

All functions operate on plain Python lists/dicts — no Pydantic models
so that the algorithm layer stays independent of the API layer.

This module does NOT import from detection.py or bankers.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


# ---------------------------------------------------------------------------
# Result data-classes
# ---------------------------------------------------------------------------


@dataclass
class ConditionResult:
    """
    Analysis result for one Coffman condition.

    Attributes
    ----------
    condition_name:
        The standard name of the Coffman condition.
    present:
        True  → the condition is currently present in the scenario.
        False → the condition is NOT present; this avenue for deadlock
                is already blocked.
    explanation:
        Plain-language description of what was found in this scenario's
        data.  Generated from actual matrix values — never hardcoded per
        scenario.
    prevention_strategy:
        The standard OS technique to deny this condition and thereby
        prevent deadlock.  Describes what would need to change in the
        system design.
    affected_processes:
        For conditions where specific processes are implicated (e.g.
        Hold-and-Wait), the list of their IDs.  Empty otherwise.
    affected_resources:
        For Mutual Exclusion: resource IDs that could force exclusive use.
        Empty for other conditions.
    """

    condition_name: str
    present: bool
    explanation: str
    prevention_strategy: str
    affected_processes: List[str] = field(default_factory=list)
    affected_resources: List[str] = field(default_factory=list)


@dataclass
class PreventionResult:
    """
    Combined result of analyze_prevention().

    Attributes
    ----------
    mutual_exclusion:
        Analysis of the Mutual Exclusion condition.
    hold_and_wait:
        Analysis of the Hold-and-Wait condition.
    no_preemption:
        Analysis of the No-Preemption condition.
    circular_wait:
        Analysis of the Circular Wait condition.
    conditions_present:
        Count of how many of the 4 conditions are present.
        Deadlock is possible only when all 4 are present simultaneously.
    summary:
        Human-readable overall conclusion.
    """

    mutual_exclusion: ConditionResult
    hold_and_wait: ConditionResult
    no_preemption: ConditionResult
    circular_wait: ConditionResult
    conditions_present: int = 0
    summary: str = ""


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class PreventionError(ValueError):
    """Raised when prevention analysis inputs fail validation."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_inputs(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
    request_matrix: Optional[List[List[int]]] = None,
) -> tuple[int, int]:
    """Validate shared inputs. Returns (n_processes, n_resources)."""
    if not processes:
        raise PreventionError("Processes list is empty.")
    if not resources:
        raise PreventionError("Resources list is empty.")

    n_proc = len(processes)
    n_res  = len(resources)

    if len(allocation) != n_proc:
        raise PreventionError(
            f"Allocation has {len(allocation)} rows but there are {n_proc} processes."
        )
    for i, row in enumerate(allocation):
        if len(row) != n_res:
            raise PreventionError(
                f"Allocation row {i} has {len(row)} columns but there are {n_res} resources."
            )

    if len(need) != n_proc:
        raise PreventionError(
            f"Need matrix has {len(need)} rows but there are {n_proc} processes."
        )
    for i, row in enumerate(need):
        if len(row) != n_res:
            raise PreventionError(
                f"Need row {i} has {len(row)} columns but there are {n_res} resources."
            )

    if len(available) != n_res:
        raise PreventionError(
            f"Available vector has {len(available)} entries but there are {n_res} resources."
        )

    if request_matrix is not None:
        if len(request_matrix) != n_proc:
            raise PreventionError(
                f"Request matrix has {len(request_matrix)} rows but there are {n_proc} processes."
            )
        for i, row in enumerate(request_matrix):
            if len(row) != n_res:
                raise PreventionError(
                    f"Request matrix row {i} has {len(row)} columns but there are {n_res} resources."
                )

    return n_proc, n_res


def _all_zeros(row: List[int]) -> bool:
    return all(v == 0 for v in row)


def _resource_id(resources: list, j: int) -> str:
    return resources[j].get("id", f"R{j}") if isinstance(resources[j], dict) else f"R{j}"


def _process_id(processes: list, i: int) -> str:
    return processes[i].get("id", f"P{i}") if isinstance(processes[i], dict) else f"P{i}"


# ---------------------------------------------------------------------------
# Condition 1 – Mutual Exclusion
# ---------------------------------------------------------------------------


def check_mutual_exclusion(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> ConditionResult:
    """
    Analyse the Mutual Exclusion Coffman condition.

    A resource enforces mutual exclusion when its total number of instances
    is less than the number of processes that could simultaneously want it —
    meaning not all interested processes can hold a copy at once.

    We detect this by comparing total_instances against the count of
    processes with a nonzero entry in their allocation OR need row for
    that resource (i.e., processes that currently hold it or may still
    need it).

    Mutual exclusion is nearly always structurally present for physical
    resources (printers, disk drives, locks).  The explanation therefore
    notes that this condition is often unavoidable and that the realistic
    prevention strategy is to use sharable resources where possible.

    Parameters
    ----------
    processes, resources, allocation, need, available:
        Standard scenario data.

    Returns
    -------
    ConditionResult
    """
    n_proc = len(processes)
    n_res  = len(resources)

    exclusive_resources: List[str] = []   # resource IDs that force exclusive use

    for j in range(n_res):
        res        = resources[j]
        total_inst = res.get("total_instances", 1) if isinstance(res, dict) else 1
        res_id     = _resource_id(resources, j)

        # Count processes that currently hold OR still need this resource
        interested = sum(
            1 for i in range(n_proc)
            if (allocation[i][j] > 0 or need[i][j] > 0)
        )

        # If total_instances < number of concurrently-interested processes,
        # not all can be served simultaneously → exclusive use is forced.
        if interested > 0 and total_inst < interested:
            exclusive_resources.append(res_id)

    present = len(exclusive_resources) > 0

    if present:
        res_list = ", ".join(exclusive_resources)
        explanation = (
            f"Mutual exclusion is present. "
            f"Resource(s) [{res_list}] have fewer total instances than the number of "
            f"processes that could simultaneously need them, forcing exclusive access. "
            f"This condition is structurally unavoidable for physical resources such as "
            f"printers, disk drives, and hardware locks — a resource that cannot be "
            f"shared by its nature will always impose mutual exclusion."
        )
    else:
        explanation = (
            f"Mutual exclusion does not appear to be a limiting factor in this scenario. "
            f"Every resource has enough instances to serve all potentially interested "
            f"processes concurrently, so no resource forces exclusive access right now. "
            f"Note: mutual exclusion is inherent to many physical devices and hardware "
            f"resources; this analysis reflects only the current scenario data."
        )

    prevention_strategy = (
        "Use sharable resources wherever possible. For example, read-only files and "
        "reentrant code segments can be shared by multiple processes simultaneously. "
        "For truly non-sharable hardware resources (printers, physical locks), mutual "
        "exclusion cannot be eliminated — focus prevention efforts on the other three "
        "Coffman conditions instead."
    )

    return ConditionResult(
        condition_name="Mutual Exclusion",
        present=present,
        explanation=explanation,
        prevention_strategy=prevention_strategy,
        affected_resources=exclusive_resources,
    )


# ---------------------------------------------------------------------------
# Condition 2 – Hold and Wait
# ---------------------------------------------------------------------------


def check_hold_and_wait(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> ConditionResult:
    """
    Analyse the Hold-and-Wait Coffman condition.

    A process exhibits Hold-and-Wait if it currently holds at least one
    resource (has a nonzero entry in its Allocation row) AND still has
    outstanding need (has a nonzero entry in its Need row) — meaning it
    is holding something while waiting or preparing to wait for something
    else.

    We use the Need matrix (Maximum − Allocation) rather than the runtime
    Request matrix because Need represents the worst-case future demand:
    a process that holds resources and has nonzero remaining need COULD
    enter a hold-and-wait state in the future even if it is not blocked
    right now.

    Parameters
    ----------
    processes, resources, allocation, need, available:
        Standard scenario data.

    Returns
    -------
    ConditionResult
    """
    n_proc = len(processes)
    implicated: List[str] = []   # process IDs that exhibit hold-and-wait

    for i in range(n_proc):
        holds    = not _all_zeros(allocation[i])   # holds ≥1 resource
        has_need = not _all_zeros(need[i])         # has ≥1 outstanding need

        if holds and has_need:
            implicated.append(_process_id(processes, i))

    present = len(implicated) > 0

    if present:
        proc_list = ", ".join(implicated)
        explanation = (
            f"Hold-and-Wait is present. "
            f"Process(es) [{proc_list}] currently hold at least one resource "
            f"and have a nonzero remaining need — they are holding resources "
            f"while potentially waiting for additional ones. "
            f"This creates the necessary condition for a circular hold-and-wait chain."
        )
    else:
        n_holding = sum(1 for i in range(n_proc) if not _all_zeros(allocation[i]))
        n_needing = sum(1 for i in range(n_proc) if not _all_zeros(need[i]))
        explanation = (
            f"Hold-and-Wait is NOT present in this scenario. "
            f"{n_holding} process(es) currently hold resources, and "
            f"{n_needing} process(es) have outstanding need, but no single "
            f"process both holds resources AND has remaining need simultaneously. "
            f"This condition is already effectively prevented in this state."
        )

    prevention_strategy = (
        "Prevent Hold-and-Wait using one of two standard techniques: "
        "(1) Request-all-upfront: require each process to request ALL resources "
        "it will ever need before it begins execution. The process starts only "
        "when all requested resources are available simultaneously. "
        "(2) Release-before-request: require a process to release ALL currently "
        "held resources before it may request any additional ones. "
        "Trade-off: both techniques can cause low resource utilisation and "
        "starvation of processes with large upfront requirements."
    )

    return ConditionResult(
        condition_name="Hold and Wait",
        present=present,
        explanation=explanation,
        prevention_strategy=prevention_strategy,
        affected_processes=implicated,
    )


# ---------------------------------------------------------------------------
# Condition 3 – No Preemption
# ---------------------------------------------------------------------------


def check_no_preemption(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> ConditionResult:
    """
    Analyse the No-Preemption Coffman condition.

    Whether preemption is possible is a POLICY decision, not something
    derivable purely from the allocation/need matrix data.  A system that
    does not implement resource preemption always has this condition present
    by design.  This is the norm for most OS resource managers (locks,
    printers, disk I/O — you cannot forcibly take them from a process).

    We therefore return a fixed explanatory result rather than trying to
    infer preemption policy from matrix data.  The result is always
    present=True with a description of what preemption as a prevention
    strategy would entail.

    Parameters
    ----------
    processes, resources, allocation, need, available:
        Standard scenario data (accepted for API consistency; not used
        beyond computing process/resource counts for the explanation).

    Returns
    -------
    ConditionResult
        Always present=True with a full explanation and strategy.
    """
    n_proc = len(processes)
    n_res  = len(resources)

    explanation = (
        f"No-Preemption is present by default in this system. "
        f"Resources are not forcibly reclaimed from processes — a process "
        f"holding a resource retains it until it voluntarily releases it. "
        f"This is the standard policy for {n_proc} process(es) managing "
        f"{n_res} resource type(s) in this scenario, as it is for most "
        f"OS-managed hardware resources (I/O devices, locks, semaphores). "
        f"Preemptability is a system design choice that cannot be read "
        f"from allocation matrices alone."
    )

    prevention_strategy = (
        "Introduce resource preemption: if a process is holding resources "
        "and requests additional ones that cannot be granted immediately, "
        "the OS may forcibly reclaim (preempt) some of the process's currently "
        "held resources. The preempted resources are added back to the available "
        "pool and the process is restarted or rolled back when its resources "
        "become available again. "
        "This technique works well for CPU and memory (via context switching and "
        "page swapping) but is impractical for resources whose state cannot be "
        "saved and restored (e.g. a printer mid-job, a mutex protecting a "
        "critical section)."
    )

    return ConditionResult(
        condition_name="No Preemption",
        present=True,   # always present unless the system explicitly implements preemption
        explanation=explanation,
        prevention_strategy=prevention_strategy,
    )


# ---------------------------------------------------------------------------
# Condition 4 – Circular Wait
# ---------------------------------------------------------------------------


def check_circular_wait(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
    request_matrix: List[List[int]],
) -> ConditionResult:
    """
    Analyse the Circular Wait Coffman condition.

    Build a wait-for graph (WFG) from the request matrix and detect whether
    any cycle exists.  In the WFG, a directed edge Pi → Pj means:
        Pi is waiting for a resource that is fully held by Pj
        (i.e. Pi requests resource Rk, and Rk's total supply is entirely
         consumed by allocations across all processes, with Pj holding ≥1).

    This is framed as "could this current wait ordering cause a circular wait"
    — it detects whether the wait-for structure contains a cycle RIGHT NOW,
    not whether one is inevitable in the future.

    Implementation note: this function does NOT import from detection.py.
    It independently builds the WFG and runs DFS cycle detection.

    Parameters
    ----------
    processes, resources, allocation, need, available:
        Standard scenario data.
    request_matrix:
        n_processes × n_resources matrix of CURRENT pending requests.

    Returns
    -------
    ConditionResult
    """
    n_proc = len(processes)
    n_res  = len(resources)

    # ------------------------------------------------------------------
    # Step 1: Build the wait-for graph as an adjacency list.
    #
    # For each process Pi that is waiting for resource Rk:
    #   Find every process Pj (j ≠ i) that holds ≥1 instance of Rk.
    #   Check whether the total supply of Rk is exhausted (available[k] == 0
    #   AND sum of allocation[*][k] == total_instances of Rk — meaning Pi
    #   genuinely cannot get Rk right now without Pj releasing it).
    #   If so, add edge Pi → Pj to the WFG.
    # ------------------------------------------------------------------

    # adjacency list: wfg[i] = set of process indices that Pi is waiting for
    wfg: List[set] = [set() for _ in range(n_proc)]

    for i in range(n_proc):
        for k in range(n_res):
            if request_matrix[i][k] == 0:
                continue   # Pi is not waiting for Rk

            # Pi needs Rk. Check whether Rk is fully held (unavailable).
            # Use available[k] == 0 as a simple proxy — if any copies are
            # free, Pi is not blocked on Rk.
            if available[k] > 0:
                continue   # Rk has free instances; Pi is not blocked here

            # Pi is blocked on Rk. Add WFG edges Pi → Pj for every Pj≠Pi
            # that holds ≥1 instance of Rk.
            for j in range(n_proc):
                if j != i and allocation[j][k] > 0:
                    wfg[i].add(j)

    # ------------------------------------------------------------------
    # Step 2: DFS cycle detection on the WFG.
    #
    # Three-colour DFS (WHITE=0, GREY=1, BLACK=2).
    # A back-edge (to a GREY node) indicates a cycle.
    # ------------------------------------------------------------------
    WHITE, GREY, BLACK = 0, 1, 2
    colour = [WHITE] * n_proc
    cycle_nodes: List[int] = []    # process indices involved in the detected cycle

    def dfs(u: int, path: List[int]) -> bool:
        """Return True if a cycle is found starting from u."""
        colour[u] = GREY
        path.append(u)
        for v in sorted(wfg[u]):   # sorted for deterministic output
            if colour[v] == GREY:
                # Back edge found → cycle detected.
                # Capture the cycle: from the first occurrence of v in path.
                cycle_start = path.index(v)
                cycle_nodes.extend(path[cycle_start:])
                return True
            if colour[v] == WHITE:
                if dfs(v, path):
                    return True
        path.pop()
        colour[u] = BLACK
        return False

    cycle_found = False
    for start in range(n_proc):
        if colour[start] == WHITE:
            if dfs(start, []):
                cycle_found = True
                break

    present = cycle_found

    # Build human-readable cycle description
    if present and cycle_nodes:
        cycle_ids = " → ".join(_process_id(processes, idx) for idx in cycle_nodes)
        # Identify which resources are part of the cycle
        cycle_set = set(cycle_nodes)
        cycle_resources: List[str] = []
        for i in cycle_set:
            for k in range(n_res):
                if request_matrix[i][k] > 0 and available[k] == 0:
                    rk_id = _resource_id(resources, k)
                    if rk_id not in cycle_resources:
                        cycle_resources.append(rk_id)

        res_desc = f" involving resource(s) [{', '.join(cycle_resources)}]" if cycle_resources else ""
        explanation = (
            f"Circular Wait is present. "
            f"A cycle exists in the wait-for graph: {cycle_ids}{res_desc}. "
            f"Each process in this chain holds a resource that the next process "
            f"is waiting for, and the last process waits for a resource held by "
            f"an earlier one — forming a closed loop that cannot resolve without "
            f"external intervention."
        )
    elif present:
        explanation = (
            "Circular Wait is present. A cycle was detected in the wait-for graph, "
            "but the exact cycle path could not be fully reconstructed."
        )
    else:
        # Count how many processes are actually waiting for anything
        n_waiting = sum(1 for i in range(n_proc) if not _all_zeros(request_matrix[i]))
        if n_waiting == 0:
            explanation = (
                "Circular Wait is NOT present. No process has any current pending "
                "requests, so no wait-for edges exist and no cycle is possible."
            )
        else:
            explanation = (
                f"Circular Wait is NOT present. "
                f"{n_waiting} process(es) have pending requests, but the wait-for "
                f"graph contains no cycle — no circular chain of dependencies exists "
                f"in the current system state."
            )

    prevention_strategy = (
        "Prevent Circular Wait by enforcing a total ordering on resource types and "
        "requiring processes to request resources ONLY in strictly increasing order "
        "of that global ordering (e.g. a process must always request R0 before R1, "
        "R1 before R2, etc.). "
        "Alternatively, use a hierarchy-based protocol: assign a numeric priority "
        "to every resource type; a process may only request a resource whose "
        "priority is higher than all resources it currently holds. "
        "This ordering guarantee breaks the 'last link' in any potential circular "
        "chain and makes circular wait structurally impossible."
    )

    # Deduplicate cycle_nodes for the affected_processes list
    seen: dict = {}
    unique_cycle: List[str] = []
    for idx in cycle_nodes:
        pid = _process_id(processes, idx)
        if pid not in seen:
            seen[pid] = True
            unique_cycle.append(pid)

    return ConditionResult(
        condition_name="Circular Wait",
        present=present,
        explanation=explanation,
        prevention_strategy=prevention_strategy,
        affected_processes=unique_cycle,
    )


# ---------------------------------------------------------------------------
# Combined analysis entry point
# ---------------------------------------------------------------------------


def analyze_prevention(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
    request_matrix: List[List[int]],
) -> PreventionResult:
    """
    Run all four Coffman condition checks and return a combined result.

    Parameters
    ----------
    processes:
        List of process dicts, each with at least {"id": str}.
    resources:
        List of resource dicts, each with at least
        {"id": str, "total_instances": int}.
    allocation:
        n_processes × n_resources matrix of currently held resources.
    need:
        n_processes × n_resources matrix of remaining demand
        (Maximum − Allocation).
    available:
        1-D vector of length n_resources (currently free instances).
    request_matrix:
        n_processes × n_resources matrix of CURRENT pending requests.
        Pass a zero matrix if no process is currently waiting.

    Returns
    -------
    PreventionResult
    """
    # Validate all inputs once, upfront
    _validate_inputs(processes, resources, allocation, need, available, request_matrix)

    me  = check_mutual_exclusion(processes, resources, allocation, need, available)
    haw = check_hold_and_wait(processes, resources, allocation, need, available)
    np_ = check_no_preemption(processes, resources, allocation, need, available)
    cw  = check_circular_wait(processes, resources, allocation, need, available, request_matrix)

    conditions = [me, haw, np_, cw]
    n_present  = sum(1 for c in conditions if c.present)

    # Build summary
    present_names  = [c.condition_name for c in conditions if c.present]
    absent_names   = [c.condition_name for c in conditions if not c.present]

    if n_present == 4:
        summary = (
            "ALL FOUR Coffman conditions are present simultaneously. "
            "The system is at risk of deadlock if a circular wait forms or "
            "is already forming. Eliminating any one of the four conditions "
            "will prevent deadlock. Recommended first target: Hold-and-Wait "
            "or Circular Wait, as these are the most tractable in software."
        )
    elif n_present == 0:
        summary = (
            "None of the four Coffman conditions are currently present. "
            "Deadlock is structurally impossible in this state."
        )
    else:
        absent_str  = ", ".join(absent_names)  if absent_names  else "none"
        present_str = ", ".join(present_names) if present_names else "none"
        summary = (
            f"{n_present} of 4 Coffman condition(s) present: [{present_str}]. "
            f"Condition(s) already absent: [{absent_str}]. "
            f"Deadlock requires ALL four conditions to hold simultaneously — "
            f"since [{absent_str}] is/are absent, deadlock cannot occur in "
            f"this state. Maintaining the absence of even one condition is "
            f"sufficient to prevent deadlock."
        )

    return PreventionResult(
        mutual_exclusion=me,
        hold_and_wait=haw,
        no_preemption=np_,
        circular_wait=cw,
        conditions_present=n_present,
        summary=summary,
    )
