"""
Unit tests for the Need Matrix calculation algorithm.

Coverage
--------
Happy-path cases (required by spec):
  - Multiple processes and resources (classic 3×3 Banker's example)
  - Single process, single resource
  - All-zero allocation (Need == Maximum)
  - Allocation equals Maximum exactly (Need is all zeros)

Additional happy-path cases:
  - 1 process, multiple resources
  - Multiple processes, 1 resource
  - Large values
  - Mixed zeros and non-zeros

Validation / error cases:
  - Empty allocation matrix
  - Empty maximum matrix
  - Row count mismatch (allocation vs maximum)
  - Jagged rows in allocation
  - Jagged rows in maximum
  - Column count mismatch between allocation and maximum
  - Zero-column row in allocation
  - Zero-column row in maximum
  - Negative value in allocation
  - Negative value in maximum
  - Allocation exceeds maximum (single cell, last cell)

Integration check:
  - Result wraps cleanly into the NeedMatrix Pydantic model
"""

import pytest

from app.algorithms.need import NeedMatrixError, calculate_need_matrix
from app.models.schemas import NeedMatrix


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Classic 3-process × 3-resource Banker's example values
_ALLOC_3X3 = [
    [0, 1, 0],  # P0
    [2, 0, 0],  # P1
    [3, 0, 2],  # P2
]
_MAX_3X3 = [
    [7, 5, 3],  # P0
    [3, 2, 2],  # P1
    [9, 0, 2],  # P2
]
_NEED_3X3 = [
    [7, 4, 3],  # P0
    [1, 2, 2],  # P1
    [6, 0, 0],  # P2
]


# ---------------------------------------------------------------------------
# Happy-path: required cases
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixHappyPath:
    def test_multiple_processes_and_resources(self):
        """Classic 3×3 Banker's example — the fundamental correctness check."""
        result = calculate_need_matrix(_ALLOC_3X3, _MAX_3X3)
        assert result == _NEED_3X3

    def test_single_process_single_resource(self):
        """1×1 matrix: Need = Maximum − Allocation."""
        result = calculate_need_matrix([[2]], [[5]])
        assert result == [[3]]

    def test_all_zero_allocation(self):
        """When nothing is allocated, Need equals Maximum."""
        allocation = [[0, 0, 0], [0, 0, 0]]
        maximum = [[4, 2, 1], [3, 5, 2]]
        result = calculate_need_matrix(allocation, maximum)
        assert result == maximum

    def test_allocation_equals_maximum(self):
        """When Allocation == Maximum, Need is all zeros."""
        matrix = [[2, 3], [1, 4], [5, 0]]
        result = calculate_need_matrix(matrix, matrix)
        expected = [[0, 0], [0, 0], [0, 0]]
        assert result == expected

    # -----------------------------------------------------------------------
    # Additional happy-path cases
    # -----------------------------------------------------------------------

    def test_single_process_multiple_resources(self):
        result = calculate_need_matrix([[1, 0, 2]], [[5, 3, 4]])
        assert result == [[4, 3, 2]]

    def test_multiple_processes_single_resource(self):
        result = calculate_need_matrix([[1], [2], [0]], [[3], [2], [5]])
        assert result == [[2], [0], [5]]

    def test_all_zeros_everywhere(self):
        """Zero allocation and zero maximum yields zero need."""
        alloc = [[0, 0], [0, 0]]
        maxi = [[0, 0], [0, 0]]
        result = calculate_need_matrix(alloc, maxi)
        assert result == [[0, 0], [0, 0]]

    def test_large_values(self):
        result = calculate_need_matrix([[999]], [[1000]])
        assert result == [[1]]

    def test_partial_zeros_mixed(self):
        alloc = [[0, 3], [1, 0]]
        maxi = [[5, 3], [1, 7]]
        result = calculate_need_matrix(alloc, maxi)
        assert result == [[5, 0], [0, 7]]

    def test_cell_by_cell_correctness(self):
        """Explicitly verify every cell in a 2×4 result."""
        alloc = [[1, 0, 2, 3], [4, 1, 0, 2]]
        maxi = [[5, 3, 2, 6], [4, 4, 1, 2]]
        result = calculate_need_matrix(alloc, maxi)
        for i in range(2):
            for j in range(4):
                assert result[i][j] == maxi[i][j] - alloc[i][j], (
                    f"Cell [{i}][{j}]: expected {maxi[i][j] - alloc[i][j]}, "
                    f"got {result[i][j]}"
                )

    def test_returns_new_list(self):
        """The returned matrix must be a fresh object, not the input."""
        alloc = [[1, 2], [3, 4]]
        maxi = [[5, 6], [7, 8]]
        result = calculate_need_matrix(alloc, maxi)
        assert result is not alloc
        assert result is not maxi

    def test_result_is_list_of_lists_of_ints(self):
        result = calculate_need_matrix([[1]], [[3]])
        assert isinstance(result, list)
        assert isinstance(result[0], list)
        assert isinstance(result[0][0], int)


# ---------------------------------------------------------------------------
# Validation errors – empty inputs
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixEmptyInputs:
    def test_empty_allocation_raises(self):
        with pytest.raises(NeedMatrixError, match="Allocation matrix is empty"):
            calculate_need_matrix([], [[1, 2]])

    def test_empty_maximum_raises(self):
        with pytest.raises(NeedMatrixError, match="Maximum matrix is empty"):
            calculate_need_matrix([[1, 2]], [])

    def test_zero_columns_in_allocation_raises(self):
        with pytest.raises(NeedMatrixError, match="0 columns"):
            calculate_need_matrix([[]], [[1]])

    def test_zero_columns_in_maximum_raises(self):
        with pytest.raises(NeedMatrixError, match="0 columns"):
            calculate_need_matrix([[1]], [[]])


# ---------------------------------------------------------------------------
# Validation errors – dimension mismatches
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixDimensionErrors:
    def test_row_count_mismatch_more_alloc(self):
        """Allocation has more rows than Maximum."""
        with pytest.raises(NeedMatrixError, match="Row count mismatch"):
            calculate_need_matrix(
                [[1, 0], [2, 1], [0, 3]],   # 3 rows
                [[5, 2], [4, 3]],            # 2 rows
            )

    def test_row_count_mismatch_more_max(self):
        """Maximum has more rows than Allocation."""
        with pytest.raises(NeedMatrixError, match="Row count mismatch"):
            calculate_need_matrix(
                [[1, 0]],                    # 1 row
                [[5, 2], [4, 3]],            # 2 rows
            )

    def test_column_count_mismatch(self):
        """Allocation has 2 columns, Maximum has 3."""
        with pytest.raises(NeedMatrixError, match="Column count mismatch"):
            calculate_need_matrix(
                [[1, 0], [2, 1]],
                [[5, 2, 1], [4, 3, 0]],
            )

    def test_jagged_allocation_rows(self):
        with pytest.raises(NeedMatrixError, match="Allocation matrix row"):
            calculate_need_matrix(
                [[1, 2], [3]],       # row 1 is shorter
                [[5, 6], [7, 8]],
            )

    def test_jagged_allocation_row_longer(self):
        with pytest.raises(NeedMatrixError, match="Allocation matrix row"):
            calculate_need_matrix(
                [[1, 2], [3, 4, 5]],   # row 1 is longer
                [[5, 6], [7, 8, 9]],
            )

    def test_jagged_maximum_rows(self):
        with pytest.raises(NeedMatrixError, match="Maximum matrix row"):
            calculate_need_matrix(
                [[1, 2], [3, 4]],
                [[5, 6], [7]],         # row 1 is shorter
            )


# ---------------------------------------------------------------------------
# Validation errors – negative values
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixNegativeValues:
    def test_negative_in_allocation_first_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Allocation\[0\]\[0\].*negative"):
            calculate_need_matrix([[-1, 0]], [[5, 3]])

    def test_negative_in_allocation_interior_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Allocation\[1\]\[2\].*negative"):
            calculate_need_matrix(
                [[0, 1, 0], [2, 0, -3]],
                [[5, 5, 5], [5, 5, 5]],
            )

    def test_negative_in_maximum_first_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Maximum\[0\]\[0\].*negative"):
            calculate_need_matrix([[0, 1]], [[-1, 3]])

    def test_negative_in_maximum_last_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Maximum\[1\]\[1\].*negative"):
            calculate_need_matrix(
                [[0, 0], [0, 0]],
                [[5, 5], [5, -1]],
            )


# ---------------------------------------------------------------------------
# Validation errors – allocation exceeds maximum
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixAllocationExceedsMaximum:
    def test_exceeds_in_first_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Allocation\[0\]\[0\].*exceeds"):
            calculate_need_matrix([[6]], [[5]])

    def test_exceeds_in_last_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Allocation\[2\]\[2\].*exceeds"):
            calculate_need_matrix(
                [[0, 1, 0], [2, 0, 0], [3, 0, 3]],
                [[7, 5, 3], [3, 2, 2], [9, 0, 2]],
            )

    def test_exceeds_in_middle_cell(self):
        with pytest.raises(NeedMatrixError, match=r"Allocation\[1\]\[1\].*exceeds"):
            calculate_need_matrix(
                [[0, 0], [0, 5]],
                [[5, 5], [5, 3]],
            )

    def test_one_over_maximum_raises(self):
        """Edge: allocation is exactly one more than maximum."""
        with pytest.raises(NeedMatrixError, match="exceeds"):
            calculate_need_matrix([[4]], [[3]])

    def test_equal_to_maximum_does_not_raise(self):
        """Edge: allocation == maximum is valid (need == 0)."""
        result = calculate_need_matrix([[3]], [[3]])
        assert result == [[0]]


# ---------------------------------------------------------------------------
# Integration: result integrates with NeedMatrix Pydantic model
# ---------------------------------------------------------------------------


class TestCalculateNeedMatrixIntegration:
    def test_result_wraps_in_need_matrix_model(self):
        """The raw list result can be wrapped in NeedMatrix without error."""
        result = calculate_need_matrix(_ALLOC_3X3, _MAX_3X3)
        nm = NeedMatrix(matrix=result)
        assert nm.matrix == _NEED_3X3

    def test_single_process_result_wraps(self):
        result = calculate_need_matrix([[0]], [[7]])
        nm = NeedMatrix(matrix=result)
        assert nm.matrix == [[7]]

    def test_all_zero_need_wraps(self):
        result = calculate_need_matrix([[5, 3]], [[5, 3]])
        nm = NeedMatrix(matrix=result)
        assert nm.matrix == [[0, 0]]

    def test_result_is_valid_need_matrix_error_would_catch_corrupt_data(self):
        """
        Sanity: if we manually corrupt the result to contain a negative
        value, NeedMatrix rejects it, proving the Pydantic model still
        guards downstream consumers.
        """
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="negative"):
            NeedMatrix(matrix=[[-1, 0]])
