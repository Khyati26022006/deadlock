# DeadlockGuard algorithm package.
# Each algorithm lives in its own module; import from here for convenience.

from app.algorithms.need import NeedMatrixError, calculate_need_matrix
from app.algorithms.bankers import (
    BankersError,
    IterationSnapshot,
    RequestResult,
    SafetyResult,
    calculate_need,
    is_safe_state,
    resource_request,
    safety_algorithm,
)
from app.algorithms.detection import (
    DetectionError,
    DetectionResult,
    DetectionSnapshot,
    detect_deadlock,
)
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
from app.algorithms.recovery import (
    PreemptionStep,
    RecoveryError,
    RecoveryResult,
    TerminationStep,
    preempt_resources,
    terminate_all_deadlocked,
    terminate_one_at_a_time,
)

__all__ = [
    # need
    "calculate_need_matrix",
    "NeedMatrixError",
    # bankers
    "BankersError",
    "IterationSnapshot",
    "RequestResult",
    "SafetyResult",
    "calculate_need",
    "is_safe_state",
    "resource_request",
    "safety_algorithm",
    # detection
    "DetectionError",
    "DetectionResult",
    "DetectionSnapshot",
    "detect_deadlock",
    # prevention
    "ConditionResult",
    "PreventionError",
    "PreventionResult",
    "analyze_prevention",
    "check_circular_wait",
    "check_hold_and_wait",
    "check_mutual_exclusion",
    "check_no_preemption",
    # recovery
    "PreemptionStep",
    "RecoveryError",
    "RecoveryResult",
    "TerminationStep",
    "preempt_resources",
    "terminate_all_deadlocked",
    "terminate_one_at_a_time",
]
