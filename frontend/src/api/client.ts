/**
 * DeadlockGuard API client.
 *
 * Every function maps 1:1 to a backend endpoint.  On success the typed
 * response is returned.  On failure an Error is thrown with a message
 * extracted from either the algorithm error envelope
 * {"error": "...", "detail": "..."} or the not-found envelope {"detail": "..."}.
 */

import type {
  DetectionRequest,
  DetectionResponse,
  HealthResponse,
  PreventionRequest,
  PreventionResponse,
  RecoveryRequest,
  RecoveryResponse,
  ResourceRequestBody,
  ResourceRequestResponse,
  SafetyRequest,
  SafetyResponse,
  ScenarioCreateRequest,
  ScenarioDetail,
  ScenarioListResponse,
} from '../types'

const BASE_URL = ''   // Requests go to /api/* and Vite proxies them to the backend.

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * Generic fetch wrapper.
 * - Parses JSON for both success and error responses.
 * - Extracts `detail` (and optionally `error`) from error envelopes.
 * - Throws an Error with a human-readable message on non-2xx status.
 */
async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(`${BASE_URL}${path}`, options)
  const json = await res.json()

  if (!res.ok) {
    // Algorithm error: {"error": "BankersError", "detail": "..."}
    // Not-found error: {"detail": "..."}
    // Pydantic validation: {"detail": [...]}
    const detail = json?.detail
    if (typeof detail === 'string') {
      const errorType = json?.error ? `[${json.error}] ` : ''
      throw new Error(`${errorType}${detail}`)
    }
    if (Array.isArray(detail)) {
      // Pydantic 422: detail is an array of validation error objects
      const messages = detail.map((e: { msg?: string }) => e.msg ?? 'Validation error').join('; ')
      throw new Error(`Validation error: ${messages}`)
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  return json as T
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('GET', '/api/health')
}

// ─── Banker's Algorithm ──────────────────────────────────────────────────────

export async function postBankerSafety(body: SafetyRequest): Promise<SafetyResponse> {
  return request<SafetyResponse>('POST', '/api/banker/safety', body)
}

export async function postBankerRequest(
  body: ResourceRequestBody,
): Promise<ResourceRequestResponse> {
  return request<ResourceRequestResponse>('POST', '/api/banker/request', body)
}

// ─── Deadlock Detection ──────────────────────────────────────────────────────

export async function postDeadlockDetect(
  body: DetectionRequest,
): Promise<DetectionResponse> {
  return request<DetectionResponse>('POST', '/api/deadlock/detect', body)
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export async function postScenario(
  body: ScenarioCreateRequest,
): Promise<ScenarioDetail> {
  return request<ScenarioDetail>('POST', '/api/scenarios', body)
}

export async function getScenarios(): Promise<ScenarioListResponse> {
  return request<ScenarioListResponse>('GET', '/api/scenarios')
}

export async function getScenario(id: string): Promise<ScenarioDetail> {
  return request<ScenarioDetail>('GET', `/api/scenarios/${encodeURIComponent(id)}`)
}

// ─── Deadlock Prevention ─────────────────────────────────────────────────────

export async function postPreventionAnalyze(
  body: PreventionRequest,
): Promise<PreventionResponse> {
  return request<PreventionResponse>('POST', '/api/prevention/analyze', body)
}

// ─── Deadlock Recovery ───────────────────────────────────────────────────────

export async function postRecoveryTerminate(
  body: RecoveryRequest,
): Promise<RecoveryResponse> {
  return request<RecoveryResponse>('POST', '/api/recovery/terminate', body)
}

export async function postRecoveryPreempt(
  body: RecoveryRequest,
): Promise<RecoveryResponse> {
  return request<RecoveryResponse>('POST', '/api/recovery/preempt', body)
}
