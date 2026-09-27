"""
DeadlockGuard – Pydantic data models.

All OS-simulation concepts are represented here:

  Process          – a simulated OS process with a state
  Resource         – a resource type with a fixed number of instances
  ProcessState     – enumeration of possible process lifecycle states
  AllocationMatrix – how many instances of each resource each process holds
  MaximumMatrix    – the maximum demand each process may ever claim
  NeedMatrix       – remaining need (Maximum − Allocation), derived & validated
  AvailableVector  – currently free instances of each resource
  ResourceRequest  – a runtime request by one process for some resources
  Scenario         – a complete simulation snapshot (all of the above together)
  AlgorithmResult  – the result returned by any deadlock algorithm

Validation rules enforced:
  - No negative resource values anywhere
  - Allocation[i][j] <= Maximum[i][j] for all i, j
  - All matrices must be n_processes × n_resources
  - NeedMatrix values must equal Maximum − Allocation
  - AvailableVector length must equal n_resources
  - Process / resource IDs referenced in matrices must exist in the scenario
  - ResourceRequest amounts must be non-negative
  - total_instances of every resource must be ≥ 1
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class ProcessState(str, Enum):
    """Lifecycle state of a simulated process."""
    RUNNING = "running"
    WAITING = "waiting"
    BLOCKED = "blocked"
    TERMINATED = "terminated"


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------


class Process(BaseModel):
    """A simulated OS process."""

    id: str = Field(..., description="Unique process identifier, e.g. 'P0'")
    name: str = Field(..., description="Human-readable process name")
    state: ProcessState = Field(
        default=ProcessState.RUNNING,
        description="Current lifecycle state of the process",
    )

    model_config = {"frozen": False}


class Resource(BaseModel):
    """A resource type with a fixed total number of instances."""

    id: str = Field(..., description="Unique resource identifier, e.g. 'R0'")
    name: str = Field(..., description="Human-readable resource name, e.g. 'Printer'")
    total_instances: int = Field(
        ..., ge=1, description="Total instances of this resource type (must be ≥ 1)"
    )

    model_config = {"frozen": False}


# ---------------------------------------------------------------------------
# Matrix / vector models
# ---------------------------------------------------------------------------


class AllocationMatrix(BaseModel):
    """
    Allocation matrix  A[i][j] = number of instances of resource j
    currently held by process i.

    Rows correspond to processes (in the same order as the process list).
    Columns correspond to resources (in the same order as the resource list).
    All values must be ≥ 0.
    """

    matrix: List[List[int]] = Field(
        ..., description="2-D matrix: rows = processes, columns = resources"
    )

    @field_validator("matrix")
    @classmethod
    def no_negative_values(cls, matrix: List[List[int]]) -> List[List[int]]:
        for i, row in enumerate(matrix):
            for j, val in enumerate(row):
                if val < 0:
                    raise ValueError(
                        f"AllocationMatrix[{i}][{j}] = {val} is negative. "
                        "Allocation values must be ≥ 0."
                    )
        return matrix

    @field_validator("matrix")
    @classmethod
    def uniform_row_lengths(cls, matrix: List[List[int]]) -> List[List[int]]:
        if not matrix:
            return matrix
        expected = len(matrix[0])
        for i, row in enumerate(matrix):
            if len(row) != expected:
                raise ValueError(
                    f"AllocationMatrix row {i} has length {len(row)}, "
                    f"expected {expected}. All rows must have equal length."
                )
        return matrix


class MaximumMatrix(BaseModel):
    """
    Maximum demand matrix  M[i][j] = maximum number of instances of resource j
    that process i may ever request during its lifetime.

    All values must be ≥ 0.
    """

    matrix: List[List[int]] = Field(
        ..., description="2-D matrix: rows = processes, columns = resources"
    )

    @field_validator("matrix")
    @classmethod
    def no_negative_values(cls, matrix: List[List[int]]) -> List[List[int]]:
        for i, row in enumerate(matrix):
            for j, val in enumerate(row):
                if val < 0:
                    raise ValueError(
                        f"MaximumMatrix[{i}][{j}] = {val} is negative. "
                        "Maximum values must be ≥ 0."
                    )
        return matrix

    @field_validator("matrix")
    @classmethod
    def uniform_row_lengths(cls, matrix: List[List[int]]) -> List[List[int]]:
        if not matrix:
            return matrix
        expected = len(matrix[0])
        for i, row in enumerate(matrix):
            if len(row) != expected:
                raise ValueError(
                    f"MaximumMatrix row {i} has length {len(row)}, "
                    f"expected {expected}. All rows must have equal length."
                )
        return matrix


class NeedMatrix(BaseModel):
    """
    Need matrix  N[i][j] = M[i][j] − A[i][j]
    (the remaining resource demand of each process).

    This model is typically *derived* from Maximum and Allocation. When
    supplied directly it is validated to be non-negative and internally
    consistent if the corresponding allocation and maximum matrices are
    also provided.
    """

    matrix: List[List[int]] = Field(
        ..., description="2-D matrix: rows = processes, columns = resources"
    )

    @field_validator("matrix")
    @classmethod
    def no_negative_values(cls, matrix: List[List[int]]) -> List[List[int]]:
        for i, row in enumerate(matrix):
            for j, val in enumerate(row):
                if val < 0:
                    raise ValueError(
                        f"NeedMatrix[{i}][{j}] = {val} is negative. "
                        "Need values must be ≥ 0 (Maximum must be ≥ Allocation)."
                    )
        return matrix

    @field_validator("matrix")
    @classmethod
    def uniform_row_lengths(cls, matrix: List[List[int]]) -> List[List[int]]:
        if not matrix:
            return matrix
        expected = len(matrix[0])
        for i, row in enumerate(matrix):
            if len(row) != expected:
                raise ValueError(
                    f"NeedMatrix row {i} has length {len(row)}, "
                    f"expected {expected}. All rows must have equal length."
                )
        return matrix


class AvailableVector(BaseModel):
    """
    Available vector  V[j] = total instances of resource j minus the sum of
    allocations across all processes.

    All values must be ≥ 0.
    """

    vector: List[int] = Field(
        ..., description="1-D vector: one entry per resource type"
    )

    @field_validator("vector")
    @classmethod
    def no_negative_values(cls, vector: List[int]) -> List[int]:
        for j, val in enumerate(vector):
            if val < 0:
                raise ValueError(
                    f"AvailableVector[{j}] = {val} is negative. "
                    "Available counts must be ≥ 0."
                )
        return vector


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class ResourceRequest(BaseModel):
    """
    A runtime resource request: process ``process_id`` asks for
    ``amounts[j]`` additional instances of resource j.
    """

    process_id: str = Field(..., description="ID of the requesting process")
    amounts: List[int] = Field(
        ..., description="Requested amount of each resource (one per resource type)"
    )

    @field_validator("amounts")
    @classmethod
    def no_negative_amounts(cls, amounts: List[int]) -> List[int]:
        for j, val in enumerate(amounts):
            if val < 0:
                raise ValueError(
                    f"ResourceRequest.amounts[{j}] = {val} is negative. "
                    "Request amounts must be ≥ 0."
                )
        return amounts


# ---------------------------------------------------------------------------
# Scenario – the full simulation state
# ---------------------------------------------------------------------------


class Scenario(BaseModel):
    """
    A complete simulation snapshot.

    Contains all processes, resources, and the four Banker's-Algorithm
    data structures.  Cross-field validation enforces:
      - Consistent matrix dimensions (n_processes × n_resources)
      - AvailableVector length == n_resources
      - Allocation[i][j] ≤ Maximum[i][j] for every cell
      - NeedMatrix == Maximum − Allocation for every cell
    """

    id: str = Field(..., description="Unique scenario identifier")
    name: str = Field(..., description="Human-readable scenario name")
    description: str = Field(default="", description="Optional description")

    processes: List[Process] = Field(...)
    resources: List[Resource] = Field(...)

    @field_validator("processes")
    @classmethod
    def at_least_one_process(cls, v: List[Process]) -> List[Process]:
        if len(v) == 0:
            raise ValueError("Scenario must have at least one process.")
        return v

    @field_validator("resources")
    @classmethod
    def at_least_one_resource(cls, v: List[Resource]) -> List[Resource]:
        if len(v) == 0:
            raise ValueError("Scenario must have at least one resource.")
        return v

    allocation: AllocationMatrix
    maximum: MaximumMatrix
    need: NeedMatrix
    available: AvailableVector

    # ------------------------------------------------------------------
    # Cross-field validation
    # ------------------------------------------------------------------

    @model_validator(mode="after")
    def validate_dimensions(self) -> "Scenario":
        n_proc = len(self.processes)
        n_res = len(self.resources)

        # --- allocation dimensions ---
        alloc = self.allocation.matrix
        if len(alloc) != n_proc:
            raise ValueError(
                f"AllocationMatrix has {len(alloc)} rows but there are "
                f"{n_proc} processes."
            )
        for i, row in enumerate(alloc):
            if len(row) != n_res:
                raise ValueError(
                    f"AllocationMatrix row {i} has {len(row)} columns but "
                    f"there are {n_res} resources."
                )

        # --- maximum dimensions ---
        maxi = self.maximum.matrix
        if len(maxi) != n_proc:
            raise ValueError(
                f"MaximumMatrix has {len(maxi)} rows but there are "
                f"{n_proc} processes."
            )
        for i, row in enumerate(maxi):
            if len(row) != n_res:
                raise ValueError(
                    f"MaximumMatrix row {i} has {len(row)} columns but "
                    f"there are {n_res} resources."
                )

        # --- need dimensions ---
        need = self.need.matrix
        if len(need) != n_proc:
            raise ValueError(
                f"NeedMatrix has {len(need)} rows but there are "
                f"{n_proc} processes."
            )
        for i, row in enumerate(need):
            if len(row) != n_res:
                raise ValueError(
                    f"NeedMatrix row {i} has {len(row)} columns but "
                    f"there are {n_res} resources."
                )

        # --- available length ---
        if len(self.available.vector) != n_res:
            raise ValueError(
                f"AvailableVector has length {len(self.available.vector)} but "
                f"there are {n_res} resources."
            )

        return self

    @model_validator(mode="after")
    def validate_allocation_le_maximum(self) -> "Scenario":
        alloc = self.allocation.matrix
        maxi = self.maximum.matrix
        for i in range(len(self.processes)):
            for j in range(len(self.resources)):
                if alloc[i][j] > maxi[i][j]:
                    raise ValueError(
                        f"Allocation[{i}][{j}] = {alloc[i][j]} exceeds "
                        f"Maximum[{i}][{j}] = {maxi[i][j]}. "
                        "A process cannot hold more of a resource than its "
                        "declared maximum."
                    )
        return self

    @model_validator(mode="after")
    def validate_need_equals_maximum_minus_allocation(self) -> "Scenario":
        alloc = self.allocation.matrix
        maxi = self.maximum.matrix
        need = self.need.matrix
        for i in range(len(self.processes)):
            for j in range(len(self.resources)):
                expected = maxi[i][j] - alloc[i][j]
                if need[i][j] != expected:
                    raise ValueError(
                        f"NeedMatrix[{i}][{j}] = {need[i][j]} but "
                        f"Maximum[{i}][{j}] − Allocation[{i}][{j}] = "
                        f"{maxi[i][j]} − {alloc[i][j]} = {expected}. "
                        "Need must equal Maximum minus Allocation."
                    )
        return self


# ---------------------------------------------------------------------------
# Algorithm result
# ---------------------------------------------------------------------------


class AlgorithmResult(BaseModel):
    """
    Generic result returned by any deadlock algorithm.

    Fields:
      algorithm   – name/identifier of the algorithm that was run
      is_safe     – True if the system is in a safe state (or no deadlock),
                    False otherwise  (None if not applicable)
      safe_sequence – ordered list of process IDs in the safe execution
                      sequence (Banker's Algorithm only, else empty)
      deadlocked_processes – IDs of processes involved in a deadlock
                             (detection only, else empty)
      message     – human-readable explanation of the result
      steps       – optional ordered list of step-by-step narrative strings
                    for educational display
      metadata    – arbitrary extra data (algorithm-specific)
    """

    algorithm: str = Field(..., description="Algorithm name, e.g. 'bankers'")
    is_safe: Optional[bool] = Field(
        default=None, description="True = safe state, False = unsafe/deadlock"
    )
    safe_sequence: List[str] = Field(
        default_factory=list,
        description="Safe execution order (process IDs)",
    )
    deadlocked_processes: List[str] = Field(
        default_factory=list,
        description="Process IDs involved in deadlock",
    )
    message: str = Field(default="", description="Human-readable result summary")
    steps: List[str] = Field(
        default_factory=list,
        description="Step-by-step explanation for educational display",
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Algorithm-specific extra data",
    )


# ---------------------------------------------------------------------------
# API response wrappers (kept from Phase 1)
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str
    message: str
    version: str


class SimulationState(BaseModel):
    """Top-level simulation state – wraps an optional active scenario."""

    scenario: Optional[Scenario] = None
