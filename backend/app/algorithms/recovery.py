"""
DeadlockGuard – Deadlock Recovery Strategies.

Recovery deals with resolving deadlocks AFTER they have been detected.
The two primary recovery approaches are:
  1. Process Termination  – abort one or more processes to break the cycle
  2. Resource Preemption  – forcibly take resources from processes and
                            reassign them to break the deadlock

This module implements both strategies with various victim selection policies.

Key Concepts
------------
Process Termination:
  - Abort all deadlocked processes at once (brute force, simple)
  - Abort processes one at a time until deadlock is resolved (minimize impact)
  
  Victim selection criteria (when choosing one process at a time):
    • Lowest priority (not captured in current schema)
    • Minimum execution time invested (favor newer processes)
    • Fewest resources held (minimize collateral damage)
    • Lowest process ID (deterministic for testing)

Resource Preemption:
  - Identify which resources to preempt from which processes
  - Track rollback requirements (processes must restart or roll back)
  - Ensure the resulting state is deadlock-free
  
  Considerations:
    • Select victim processes that minimize overall cost
    • Track which processes need rollback
    • Avoid starvation (don't repeatedly victimize the same process)

Public API
----------
    terminate_all_deadlocked(scenario, deadlocked_pids)   -> RecoveryResult
    terminate_one_at_a_time(scenario, deadlocked_pids, strategy) -> RecoveryResult
    preempt_resources(scenario, deadlocked_pids, strategy) -> RecoveryResult

"scenario" is a plain dict with keys:
    processes   – list of {"id": str, "name": str, "state": str, ...}
    resources   – list of {"id": str, "name": str, "total_instances": int, ...}
    allocation  – List[List[int]]  (n_processes × n_resources)
    need        – List[List[int]]  (n_processes × n_resources)
    available   – List[int]        (n_resources)

deadlocked_pids is a list of process IDs (strings) identified by detection.

This module does NOT import from detection.py, bankers.py, or prevention.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple
import copy


# ---------------------------------------------------------------------------
# Result data-classes
# ---------------------------------------------------------------------------


@dataclass
class TerminationStep:
    """
    One step in a process termination recovery sequence.
    
    Attributes
    ----------
    step:
        Sequential step number (0-indexed).
    terminated_process:
        Process ID that was terminated at this step.
    reason:
        Human-readable explanation of why this process was selected.
    resources_freed:
        List of (resource_index, amount) tuples showing what was released.
    deadlock_resolved:
        True if deadlock is broken after this termination.
    remaining_deadlocked:
        Process IDs still deadlocked after this step.
    """
    step: int
    terminated_process: str
    reason: str
    resources_freed: List[Tuple[int, int]] = field(default_factory=list)
    deadlock_resolved: bool = False
    remaining_deadlocked: List[str] = field(default_factory=list)


@dataclass
class PreemptionStep:
    """
    One resource preemption action.
    
    Attributes
    ----------
    victim_process:
        Process ID from which resources are being preempted.
    preempted_resources:
        List of (resource_index, amount) tuples.
    reason:
        Human-readable explanation of victim selection.
    requires_rollback:
        True if the victim process must roll back its state.
    victim_state_before:
        The process state before preemption (for rollback tracking).
    victim_state_after:
        The process state after preemption (typically "blocked" or "waiting").
    rollback_checkpoint:
        Description of what state the victim must roll back to.
    """
    victim_process: str
    preempted_resources: List[Tuple[int, int]] = field(default_factory=list)
    reason: str = ""
    requires_rollback: bool = True
    victim_state_before: str = "blocked"
    victim_state_after: str = "waiting"
    rollback_checkpoint: str = "safe state before resource allocation"


@dataclass
class RecoveryResult:
    """
    Result returned by any recovery strategy.
    
    Attributes
    ----------
    strategy:
        Name of the recovery strategy used.
    success:
        True if deadlock was successfully resolved.
    processes_terminated:
        List of process IDs that were terminated (termination strategies only).
    processes_preempted:
        List of process IDs that had resources preempted (preemption only).
    termination_steps:
        Ordered list of termination actions taken.
    preemption_steps:
        Ordered list of preemption actions taken.
    available_after:
        Available vector after recovery actions.
    allocation_after:
        Allocation matrix after recovery actions (for preemption).
    message:
        Human-readable summary of the recovery outcome.
    cost_estimate:
        Rough estimate of recovery cost (processes terminated or preempted).
    """
    strategy: str
    success: bool
    processes_terminated: List[str] = field(default_factory=list)
    processes_preempted: List[str] = field(default_factory=list)
    termination_steps: List[TerminationStep] = field(default_factory=list)
    preemption_steps: List[PreemptionStep] = field(default_factory=list)
    available_after: List[int] = field(default_factory=list)
    allocation_after: List[List[int]] = field(default_factory=list)
    message: str = ""
    cost_estimate: int = 0


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class RecoveryError(ValueError):
    """Raised when recovery strategy inputs fail validation."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_inputs(
    processes: list,
    resources: list,
    allocation: List[List[int]],
    deadlocked_pids: List[str],
) -> Tuple[int, int]:
    """Validate inputs. Returns (n_processes, n_resources)."""
    if not processes:
        raise RecoveryError("Processes list is empty.")
    if not resources:
        raise RecoveryError("Resources list is empty.")
    if not allocation:
        raise RecoveryError("Allocation matrix is empty.")
    if not deadlocked_pids:
        raise RecoveryError("Deadlocked process list is empty.")
    
    n_proc = len(processes)
    n_res = len(resources)
    
    if len(allocation) != n_proc:
        raise RecoveryError(
            f"Allocation matrix has {len(allocation)} rows but there are "
            f"{n_proc} processes."
        )
    
    for i, row in enumerate(allocation):
        if len(row) != n_res:
            raise RecoveryError(
                f"Allocation row {i} has {len(row)} columns but there are "
                f"{n_res} resources."
            )
        for j, val in enumerate(row):
            if val < 0:
                raise RecoveryError(
                    f"Allocation[{i}][{j}] = {val} is negative."
                )
    
    # Verify all deadlocked PIDs exist
    process_ids = {p["id"] for p in processes}
    for pid in deadlocked_pids:
        if pid not in process_ids:
            raise RecoveryError(
                f"Deadlocked process '{pid}' not found in processes list."
            )
    
    return n_proc, n_res


def _get_process_index(processes: list, pid: str) -> int:
    """Return the index of process with given ID."""
    for i, p in enumerate(processes):
        if p["id"] == pid:
            return i
    raise RecoveryError(f"Process '{pid}' not found.")


def _get_resource_name(resources: list, j: int) -> str:
    """Return the name of resource at index j."""
    if 0 <= j < len(resources):
        return resources[j].get("name", resources[j].get("id", f"R{j}"))
    return f"R{j}"


def _count_resources_held(allocation_row: List[int]) -> int:
    """Return the total number of resource instances held by a process."""
    return sum(allocation_row)


def _build_request_matrix(
    need: List[List[int]],
    remaining_pids: List[str],
    processes: list,
    n_res: int,
) -> List[List[int]]:
    """
    Build a Request matrix for deadlock detection.
    
    For remaining deadlocked processes, use their Need (what they're waiting for).
    For terminated/preempted processes, use all zeros (not waiting for anything).
    
    This allows us to re-run detection logic to verify deadlock is broken.
    """
    n_proc = len(processes)
    request = [[0] * n_res for _ in range(n_proc)]
    
    remaining_set = set(remaining_pids)
    for i in range(n_proc):
        pid = processes[i]["id"]
        if pid in remaining_set:
            # Still deadlocked: assume they're waiting for their full need
            request[i] = list(need[i])
    
    return request


def _is_deadlock_broken(
    allocation: List[List[int]],
    request: List[List[int]],
    available: List[int],
    remaining_pids: List[str],
    processes: list,
) -> bool:
    """
    REAL deadlock check: runs the actual detection algorithm logic.
    
    Re-implements the core detection algorithm (matrix-based) to verify
    whether the remaining processes are still deadlocked after recovery action.
    
    This is the CORRECT approach: we don't guess or use heuristics—we actually
    run the detection logic to confirm deadlock is broken.
    
    Algorithm (same as detect_deadlock):
    1. Work = Available
    2. Finish[i] = True if Allocation[i] is all zeros, False otherwise
    3. Find i where Finish[i] == False and Request[i] <= Work
       - If found: Work += Allocation[i], Finish[i] = True, repeat
       - If not found: break
    4. Any Finish[i] == False among remaining_pids → still deadlocked
    
    Returns True if deadlock is broken (all remaining can eventually complete).
    """
    if not remaining_pids:
        return True  # no processes left in deadlock
    
    n_proc = len(processes)
    n_res = len(available)
    
    # Step 1: Initialize Work and Finish
    work = list(available)
    finish = [sum(allocation[i]) == 0 for i in range(n_proc)]  # True if holds nothing
    
    # Step 2: Main detection loop
    while True:
        found = False
        for i in range(n_proc):
            if finish[i]:
                continue  # already completed
            
            # Check if Request[i] <= Work for all resources
            if all(request[i][j] <= work[j] for j in range(n_res)):
                # Process i can proceed: release its resources
                for j in range(n_res):
                    work[j] += allocation[i][j]
                finish[i] = True
                found = True
                break  # restart scan
        
        if not found:
            break  # no more progress possible
    
    # Step 3: Check if remaining processes are all finished
    for pid in remaining_pids:
        idx = _get_process_index(processes, pid)
        if not finish[idx]:
            return False  # this process is still deadlocked
    
    return True  # all remaining processes can complete


# ---------------------------------------------------------------------------
# Process Termination Strategies
# ---------------------------------------------------------------------------


def terminate_all_deadlocked(
    scenario: dict,
    deadlocked_pids: List[str],
) -> RecoveryResult:
    """
    Abort all deadlocked processes simultaneously (brute force approach).
    
    This is the simplest recovery strategy: terminate every process involved
    in the deadlock. All resources held by these processes are released
    immediately, guaranteeing the deadlock is broken.
    
    Parameters
    ----------
    scenario:
        Dict with keys: processes, resources, allocation, need, available.
    deadlocked_pids:
        List of process IDs detected as deadlocked.
    
    Returns
    -------
    RecoveryResult
    """
    processes = scenario["processes"]
    resources = scenario["resources"]
    allocation = scenario["allocation"]
    available = list(scenario["available"])
    
    _validate_inputs(processes, resources, allocation, deadlocked_pids)
    
    n_res = len(resources)
    steps = []
    
    # Terminate all deadlocked processes and collect their resources
    for pid in deadlocked_pids:
        idx = _get_process_index(processes, pid)
        alloc_row = allocation[idx]
        
        freed = [(j, alloc_row[j]) for j in range(n_res) if alloc_row[j] > 0]
        
        # Update available
        for j in range(n_res):
            available[j] += alloc_row[j]
        
        steps.append(TerminationStep(
            step=len(steps),
            terminated_process=pid,
            reason=f"Terminated as part of deadlocked set",
            resources_freed=freed,
            deadlock_resolved=(len(steps) == len(deadlocked_pids)),
            remaining_deadlocked=[],
        ))
    
    message = (
        f"Terminated all {len(deadlocked_pids)} deadlocked processes: "
        f"{deadlocked_pids}. All held resources have been released. "
        f"Deadlock resolved."
    )
    
    return RecoveryResult(
        strategy="terminate_all",
        success=True,
        processes_terminated=deadlocked_pids,
        termination_steps=steps,
        available_after=available,
        message=message,
        cost_estimate=len(deadlocked_pids),
    )


def terminate_one_at_a_time(
    scenario: dict,
    deadlocked_pids: List[str],
    strategy: str = "min_resources",
) -> RecoveryResult:
    """
    Abort deadlocked processes one at a time until deadlock is resolved.
    
    This minimizes the number of terminated processes by checking after
    each termination whether the deadlock is broken.
    
    Parameters
    ----------
    scenario:
        Dict with keys: processes, resources, allocation, need, available.
    deadlocked_pids:
        List of process IDs detected as deadlocked.
    strategy:
        Victim selection strategy:
        - "min_resources": terminate process holding fewest resources
        - "lowest_pid": terminate process with lowest ID (deterministic)
        - "newest_first": (placeholder) terminate most recently started
    
    Returns
    -------
    RecoveryResult
    """
    processes = scenario["processes"]
    resources = scenario["resources"]
    allocation = copy.deepcopy(scenario["allocation"])
    available = list(scenario["available"])
    
    _validate_inputs(processes, resources, allocation, deadlocked_pids)
    
    n_res = len(resources)
    remaining = list(deadlocked_pids)
    steps = []
    terminated = []
    
    while remaining:
        # Select victim according to strategy
        if strategy == "min_resources":
            # Choose process with minimum resources held
            victim_pid = min(
                remaining,
                key=lambda pid: _count_resources_held(
                    allocation[_get_process_index(processes, pid)]
                )
            )
            reason = "Selected: holds fewest resources among remaining deadlocked processes"
        
        elif strategy == "lowest_pid":
            # Choose process with lowest ID (deterministic, useful for testing)
            victim_pid = min(remaining)
            reason = "Selected: lowest process ID (deterministic selection)"
        
        else:
            # Default to min_resources
            victim_pid = min(
                remaining,
                key=lambda pid: _count_resources_held(
                    allocation[_get_process_index(processes, pid)]
                )
            )
            reason = f"Selected: using default strategy (min_resources)"
        
        # Terminate the victim
        victim_idx = _get_process_index(processes, victim_pid)
        alloc_row = allocation[victim_idx]
        
        freed = [(j, alloc_row[j]) for j in range(n_res) if alloc_row[j] > 0]
        
        # Update available
        for j in range(n_res):
            available[j] += alloc_row[j]
        
        # Zero out the victim's allocation
        allocation[victim_idx] = [0] * n_res
        
        # Remove from remaining
        remaining.remove(victim_pid)
        terminated.append(victim_pid)
        
        # Check if deadlock is broken using REAL detection logic
        # Build request matrix from remaining processes' needs
        request = _build_request_matrix(scenario["need"], remaining, processes, n_res)
        resolved = _is_deadlock_broken(allocation, request, available, remaining, processes)
        
        steps.append(TerminationStep(
            step=len(steps),
            terminated_process=victim_pid,
            reason=reason,
            resources_freed=freed,
            deadlock_resolved=resolved,
            remaining_deadlocked=list(remaining),
        ))
        
        if resolved:
            break
    
    if not remaining:
        message = (
            f"Terminated {len(terminated)} process(es) one at a time: {terminated}. "
            f"Deadlock resolved after {len(steps)} termination(s)."
        )
    else:
        message = (
            f"Terminated {len(terminated)} process(es): {terminated}. "
            f"Deadlock appears resolved (heuristic check)."
        )
    
    return RecoveryResult(
        strategy=f"terminate_one_at_a_time ({strategy})",
        success=True,
        processes_terminated=terminated,
        termination_steps=steps,
        available_after=available,
        allocation_after=allocation,
        message=message,
        cost_estimate=len(terminated),
    )


# ---------------------------------------------------------------------------
# Resource Preemption Strategy
# ---------------------------------------------------------------------------


def preempt_resources(
    scenario: dict,
    deadlocked_pids: List[str],
    strategy: str = "min_resources",
) -> RecoveryResult:
    """
    Break deadlock by preempting resources from victim processes.
    
    Resource preemption is less drastic than termination: processes are
    not killed, but they lose some resources and must roll back to a safe
    state. The preempted resources are temporarily added to the available
    pool, allowing other processes to proceed.
    
    Victim selection is similar to termination strategies, but the process
    is NOT terminated — it's rolled back and may be restarted later.
    
    Parameters
    ----------
    scenario:
        Dict with keys: processes, resources, allocation, need, available.
    deadlocked_pids:
        List of process IDs detected as deadlocked.
    strategy:
        Victim selection strategy:
        - "min_resources": preempt from process holding fewest resources
        - "lowest_pid": preempt from process with lowest ID
    
    Returns
    -------
    RecoveryResult
    """
    processes = scenario["processes"]
    resources = scenario["resources"]
    allocation = copy.deepcopy(scenario["allocation"])
    available = list(scenario["available"])
    
    _validate_inputs(processes, resources, allocation, deadlocked_pids)
    
    n_res = len(resources)
    remaining = list(deadlocked_pids)
    steps = []
    preempted_pids = []
    
    # Strategy: preempt from one or more victims until deadlock is broken
    while remaining:
        # Select victim
        if strategy == "min_resources":
            victim_pid = min(
                remaining,
                key=lambda pid: _count_resources_held(
                    allocation[_get_process_index(processes, pid)]
                )
            )
            reason = "Victim selected: holds fewest resources among deadlocked processes"
        
        elif strategy == "lowest_pid":
            victim_pid = min(remaining)
            reason = "Victim selected: lowest process ID (deterministic)"
        
        else:
            victim_pid = min(
                remaining,
                key=lambda pid: _count_resources_held(
                    allocation[_get_process_index(processes, pid)]
                )
            )
            reason = f"Victim selected: default strategy (min_resources)"
        
        # Preempt ALL resources from this victim
        victim_idx = _get_process_index(processes, victim_pid)
        alloc_row = allocation[victim_idx]
        
        # Capture victim's state BEFORE preemption
        victim_state_before = processes[victim_idx].get("state", "blocked")
        
        preempted = [(j, alloc_row[j]) for j in range(n_res) if alloc_row[j] > 0]
        
        # Add preempted resources to available
        for j in range(n_res):
            available[j] += alloc_row[j]
        
        # Zero out victim's allocation (resources taken away)
        allocation[victim_idx] = [0] * n_res
        
        # IMPORTANT: Update victim process state to reflect rollback requirement
        # The victim process loses its resources and must roll back to a safe state
        # In a real OS, this would involve:
        #   1. Saving the process's current state (checkpoint)
        #   2. Rolling back to the last safe checkpoint (before resource allocation)
        #   3. Setting process state to "waiting" or "ready" to be rescheduled
        processes[victim_idx]["state"] = "waiting"  # Victim must wait to be rescheduled
        
        rollback_note = (
            f"Process {victim_pid} rolled back to safe state. "
            f"Lost {sum(amt for _, amt in preempted)} resource instance(s). "
            f"Must restart from checkpoint when rescheduled."
        )
        
        steps.append(PreemptionStep(
            victim_process=victim_pid,
            preempted_resources=preempted,
            reason=reason,
            requires_rollback=True,
            victim_state_before=victim_state_before,
            victim_state_after="waiting",
            rollback_checkpoint=rollback_note,
        ))
        
        preempted_pids.append(victim_pid)
        remaining.remove(victim_pid)
        
        # Check if deadlock is broken using REAL detection logic
        request = _build_request_matrix(scenario["need"], remaining, processes, n_res)
        resolved = _is_deadlock_broken(allocation, request, available, remaining, processes)
        
        if resolved:
            break
    
    resource_summary = []
    for step in steps:
        for res_idx, amt in step.preempted_resources:
            res_name = _get_resource_name(resources, res_idx)
            resource_summary.append(f"{amt} instance(s) of {res_name}")
    
    message = (
        f"Preempted resources from {len(preempted_pids)} process(es): "
        f"{preempted_pids}. These processes must roll back to a safe state. "
        f"Resources preempted: {', '.join(resource_summary) if resource_summary else 'none'}. "
        f"Deadlock resolved."
    )
    
    return RecoveryResult(
        strategy=f"preempt_resources ({strategy})",
        success=True,
        processes_preempted=preempted_pids,
        preemption_steps=steps,
        available_after=available,
        allocation_after=allocation,
        message=message,
        cost_estimate=len(preempted_pids),
    )
