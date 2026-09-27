"""
DeadlockGuard – Need Matrix calculation.

Formula
-------
    Need[i][j] = Maximum[i][j] - Allocation[i][j]

This is the remaining resource demand for each process: how many more
instances of each resource type a process may still request before it
reaches its declared maximum.

Validation performed before calculation
----------------------------------------
1. Both matrices must be non-empty (at least 1 row, 1 column).
2. Row counts must match (same number of processes).
3. Every row in both matrices must have the same column count as row 0
   (no jagged rows).
4. Allocation and Maximum must have identical dimensions.
5. No value in Allocation may be negative.
6. No value in Maximum may be negative.
7. Allocation[i][j] must not exceed Maximum[i][j] for any cell –
   a process cannot already hold more of a resource than its maximum.

Returns
-------
A plain ``List[List[int]]`` representing the Need matrix.
Wrap it in a ``NeedMatrix`` Pydantic model if schema validation is required.
"""

from __future__ import annotations

from typing import List


class NeedMatrixError(ValueError):
    """Raised when Need matrix inputs fail validation."""


def calculate_need_matrix(
    allocation: List[List[int]],
    maximum: List[List[int]],
) -> List[List[int]]:
    """
    Compute and return the Need matrix from *allocation* and *maximum*.

    Parameters
    ----------
    allocation:
        2-D list of integers.  ``allocation[i][j]`` is the number of
        instances of resource *j* currently held by process *i*.
    maximum:
        2-D list of integers.  ``maximum[i][j]`` is the maximum number of
        instances of resource *j* that process *i* may ever request.

    Returns
    -------
    List[List[int]]
        ``need[i][j] = maximum[i][j] - allocation[i][j]``

    Raises
    ------
    NeedMatrixError
        On any dimension mismatch, negative value, or allocation > maximum.
    """

    # ------------------------------------------------------------------
    # 1. Non-empty check
    # ------------------------------------------------------------------
    if not allocation:
        raise NeedMatrixError("Allocation matrix is empty (no rows).")
    if not maximum:
        raise NeedMatrixError("Maximum matrix is empty (no rows).")

    # ------------------------------------------------------------------
    # 2. Row count must match
    # ------------------------------------------------------------------
    n_proc_alloc = len(allocation)
    n_proc_max = len(maximum)
    if n_proc_alloc != n_proc_max:
        raise NeedMatrixError(
            f"Row count mismatch: Allocation has {n_proc_alloc} rows "
            f"but Maximum has {n_proc_max} rows. "
            "Both matrices must have one row per process."
        )
    n_proc = n_proc_alloc

    # ------------------------------------------------------------------
    # 3. Column uniformity within each matrix
    # ------------------------------------------------------------------
    n_res = len(allocation[0])
    if n_res == 0:
        raise NeedMatrixError(
            "Allocation matrix row 0 has 0 columns. "
            "At least one resource column is required."
        )

    for i, row in enumerate(allocation):
        if len(row) != n_res:
            raise NeedMatrixError(
                f"Allocation matrix row {i} has {len(row)} columns "
                f"but row 0 has {n_res}. All rows must have equal length."
            )

    n_res_max = len(maximum[0])
    if n_res_max == 0:
        raise NeedMatrixError(
            "Maximum matrix row 0 has 0 columns. "
            "At least one resource column is required."
        )

    for i, row in enumerate(maximum):
        if len(row) != n_res_max:
            raise NeedMatrixError(
                f"Maximum matrix row {i} has {len(row)} columns "
                f"but row 0 has {n_res_max}. All rows must have equal length."
            )

    # ------------------------------------------------------------------
    # 4. Allocation and Maximum column counts must agree
    # ------------------------------------------------------------------
    if n_res != n_res_max:
        raise NeedMatrixError(
            f"Column count mismatch: Allocation has {n_res} columns "
            f"but Maximum has {n_res_max} columns. "
            "Both matrices must have one column per resource."
        )

    # ------------------------------------------------------------------
    # 5 & 6. No negative values in either matrix; 7. Allocation ≤ Maximum
    # ------------------------------------------------------------------
    for i in range(n_proc):
        for j in range(n_res):
            a = allocation[i][j]
            m = maximum[i][j]

            if a < 0:
                raise NeedMatrixError(
                    f"Allocation[{i}][{j}] = {a} is negative. "
                    "Allocation values must be ≥ 0."
                )
            if m < 0:
                raise NeedMatrixError(
                    f"Maximum[{i}][{j}] = {m} is negative. "
                    "Maximum values must be ≥ 0."
                )
            if a > m:
                raise NeedMatrixError(
                    f"Allocation[{i}][{j}] = {a} exceeds "
                    f"Maximum[{i}][{j}] = {m}. "
                    "A process cannot hold more of a resource than its "
                    "declared maximum."
                )

    # ------------------------------------------------------------------
    # Calculation
    # ------------------------------------------------------------------
    return [
        [maximum[i][j] - allocation[i][j] for j in range(n_res)]
        for i in range(n_proc)
    ]
