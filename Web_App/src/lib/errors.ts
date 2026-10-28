// Public messages are application-owned. Never use a transport message as an override.
const messages = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  INVALID_CREDENTIALS: 'Unable to sign in. Check your email and password and try again.',
  MFA_REQUIRED: 'Verify your authenticator code to continue.',
  MFA_INVALID_CODE: 'Unable to verify your code. Please try again.',
  AUTH_VERIFICATION_FAILED: 'We could not verify your authentication requirements. Please try signing in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  VALIDATION_ERROR: 'Check the information you entered and try again.',
  ROUTINE_NOT_FOUND: 'The requested routine could not be found.',
  PATIENT_NOT_FOUND: 'The requested patient could not be found.',
  ASSIGNMENT_NOT_FOUND: 'The requested assignment could not be found.',
  FOLLOW_UP_NOT_FOUND: 'The requested follow-up could not be found.',
  NOT_FOUND: 'The requested resource could not be found.',
  SCHEDULE_CONFLICT: 'One or more selected dates already have an active assignment. Nothing was scheduled. Explicitly cancel the existing assignment before replacing it.',
  ROUTINE_CHANGED: 'A selected routine changed. Nothing was scheduled. Review a new preview before confirming.',
  CONFLICT: 'This action conflicts with an existing record. Refresh before trying again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment before trying again.',
  NETWORK_ERROR: 'The connection was interrupted. Check your connection before trying again.',
  REQUEST_ABORTED: 'The request was interrupted. Check the result before trying again.',
  SERVICE_UNAVAILABLE: 'This service is temporarily unavailable. Please try again later.',
  OTP_UNCONFIRMED: 'The login code could not be confirmed. Check the patient page before generating another code; do not create another patient.',
  UNEXPECTED_ERROR: 'Something went wrong. Please try again or contact support.',
} as const

export type AppErrorCode = keyof typeof messages
type ValidationField = 'name' | 'email' | 'password' | 'exercises' | 'sets' | 'reps' | 'durationSeconds' | 'notes' | 'scheduledAt' | 'phone' | 'primaryConcern' | 'treatmentFocus' | 'startOfCare' | 'careStatus' | 'body'
type ValidationIssue = 'REQUIRED' | 'INVALID' | 'POSITIVE_INTEGER'
export interface ErrorPayload {
  code: AppErrorCode
  message: string
  details: { fieldErrors: Partial<Record<ValidationField, ValidationIssue>> } | null
}
export interface ErrorResponse { error: ErrorPayload }
interface ErrorOptions {
  /** Only literal, application-authored text; never an SDK/API message. */
  message?: string
  details?: ErrorPayload['details']
  cause?: unknown
  sourceCode?: string
  httpStatus?: number
}
export interface ErrorContext { operation?: string; status?: number }

function safeDetails(value: ErrorPayload['details']): ErrorPayload['details'] {
  const fields = ['name', 'email', 'password', 'exercises', 'sets', 'reps', 'durationSeconds', 'notes', 'scheduledAt', 'phone', 'primaryConcern', 'treatmentFocus', 'startOfCare', 'careStatus', 'body'] as const
  const fieldErrors: Partial<Record<ValidationField, ValidationIssue>> = {}
  for (const field of fields) {
    const issue = value?.fieldErrors?.[field]
    if (issue === 'REQUIRED' || issue === 'INVALID' || issue === 'POSITIVE_INTEGER') fieldErrors[field] = issue
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : null
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details: ErrorPayload['details']
  declare readonly sourceCode?: string
  declare readonly httpStatus?: number

  constructor(code: AppErrorCode, options: ErrorOptions = {}) {
    super(options.message ?? messages[code], { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.details = code === 'VALIDATION_ERROR' ? safeDetails(options.details ?? null) : null
    // Keep diagnostics out of object spreads and JSON payloads.
    Object.defineProperties(this, {
      sourceCode: { value: options.sourceCode },
      httpStatus: { value: options.httpStatus },
    })
  }

  toJSON(): ErrorResponse { return toErrorResponse(this) }
}

export function normalizeError(error: unknown, context: ErrorContext = {}): AppError {
  if (error instanceof AppError) return error
  const native = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const sourceCode = typeof native.code === 'string' ? native.code : undefined
  const statusValue = context.status ?? native.status ?? native.statusCode
  const status = typeof statusValue === 'number' ? statusValue
    : typeof statusValue === 'string' && /^\d{3}$/.test(statusValue) ? Number(statusValue) : undefined
  const operation = context.operation ?? ''
  const scheduling = ['assign_routine_schedule', 'preview_routine_schedule', 'schedule', 'assignRoutine'].includes(operation)
  let code: AppErrorCode = 'UNEXPECTED_ERROR'
  if (sourceCode === 'invalid_credentials') code = 'INVALID_CREDENTIALS'
  else if (['refresh_token_not_found', 'refresh_token_already_used', 'session_expired', 'session_not_found'].includes(sourceCode ?? '')) code = 'SESSION_EXPIRED'
  else if (sourceCode === 'insufficient_aal') code = 'MFA_REQUIRED'
  else if (['mfa_verification_failed', 'mfa_challenge_expired'].includes(sourceCode ?? '')) code = 'MFA_INVALID_CODE'
  else if (native.name === 'AuthSessionMissingError' || ['no_authorization', 'PGRST301', 'PGRST302', 'PGRST303', 'bad_jwt'].includes(sourceCode ?? '') || status === 401) code = 'AUTH_REQUIRED'
  else if (status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'].includes(sourceCode ?? '')) code = 'RATE_LIMITED'
  else if (sourceCode === '42501' || status === 403) code = 'FORBIDDEN'
  else if (native.name === 'AbortError') code = 'REQUEST_ABORTED'
  // Supabase also uses AuthRetryableFetchError for HTTP 5xx responses.
  else if (status === 0 || (native.name === 'AuthRetryableFetchError' && status === undefined)
    || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(sourceCode ?? '')
    || (native.name === 'TypeError' && typeof native.message === 'string' && /fetch|network|load failed/i.test(native.message))) code = 'NETWORK_ERROR'
  else if (sourceCode === 'P0002') {
    code = ['saveRoutine', 'deleteRoutine'].includes(operation) ? 'ROUTINE_NOT_FOUND'
      : ['dischargePatient', 'updatePatientDetails'].includes(operation) ? 'PATIENT_NOT_FOUND'
        : operation === 'cancelRoutineAssignment' ? 'ASSIGNMENT_NOT_FOUND'
          : /FollowUp/.test(operation) ? 'FOLLOW_UP_NOT_FOUND' : 'NOT_FOUND'
  } else if (['PGRST202', 'PGRST204', 'PGRST205', '42883', '42703', '42P01', '55000'].includes(sourceCode ?? '')) code = 'SERVICE_UNAVAILABLE'
  else if (sourceCode === '23505' || status === 409) code = scheduling ? 'SCHEDULE_CONFLICT' : 'CONFLICT'
  else if (sourceCode === '40001' && scheduling) code = 'ROUTINE_CHANGED'
  else if (['22023', '22007', '22P02', 'weak_password', 'email_address_invalid'].includes(sourceCode ?? '') || status === 422 || (status === 400 && operation === 'inviteExistingPatient')) code = 'VALIDATION_ERROR'
  else if (status === 404) code = operation === 'inviteExistingPatient' ? 'PATIENT_NOT_FOUND' : 'NOT_FOUND'
  else if (status !== undefined && status >= 500) code = 'SERVICE_UNAVAILABLE'
  // A code-generation failure is distinct from patient creation. Do not retry automatically.
  if (operation === 'inviteExistingPatient' && status === 502) code = 'OTP_UNCONFIRMED'
  return new AppError(code, { cause: error, sourceCode, httpStatus: status })
}

export function toErrorResponse(error: unknown): ErrorResponse {
  const normalized = normalizeError(error)
  return { error: { code: normalized.code, message: normalized.message, details: safeDetails(normalized.details) } }
}

// Keep the existing signature and operation-specific fallbacks; never trust arbitrary messages.
export function errorMessage(error: unknown, fallback: string): string {
  const normalized = normalizeError(error)
  return normalized.code === 'UNEXPECTED_ERROR' && normalized.message === messages.UNEXPECTED_ERROR ? fallback : normalized.message
}
