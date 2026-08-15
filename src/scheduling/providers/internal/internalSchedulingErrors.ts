import {
  SchedulingError,
  SchedulingNotFoundError,
  SchedulingProviderError,
  SchedulingProviderUnavailableError,
  SchedulingSlotConflictError,
  SchedulingUnauthorizedError,
  SchedulingValidationError,
} from '../../errors/SchedulingError.ts';

interface InternalErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return String(error || '');
  const payload = error as InternalErrorPayload;
  return [payload.code, payload.message, payload.details, payload.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

export function mapInternalSchedulingError(error: unknown): SchedulingError {
  if (error instanceof SchedulingError) return error;

  const payload = error && typeof error === 'object' ? error as InternalErrorPayload : {};
  const code = typeof payload.code === 'string' ? payload.code : '';
  const status = typeof payload.status === 'number' ? payload.status : undefined;
  const text = getErrorText(error).toUpperCase();

  if (code === '23P01' || text.includes('AGENDA_SLOT_CONFLICT') || text.includes('EXCLUSION_VIOLATION')) {
    return new SchedulingSlotConflictError('internal', error);
  }

  if (code === 'P0002' || code === 'PGRST116' || text.includes('AGENDA_APPOINTMENT_NOT_FOUND')) {
    return new SchedulingNotFoundError('The requested internal scheduling resource was not found.', 'internal', error);
  }

  if (
    code === '42501'
    || code === 'PGRST301'
    || code === 'PGRST302'
    || status === 401
    || status === 403
    || text.includes('AGENDA_FORBIDDEN')
    || text.includes('PERMISSION DENIED')
    || text.includes('ROW-LEVEL SECURITY')
    || text.includes('JWT')
  ) {
    return new SchedulingUnauthorizedError('internal', error);
  }

  if (
    code === '22023'
    || code === '23503'
    || code === '23514'
    || text.includes('AGENDA_INVALID')
    || text.includes('AGENDA_INSURANCE_REQUIRED')
    || text.includes('AGENDA_DURATION_MISMATCH')
    || text.includes('AGENDA_OUTSIDE_AVAILABILITY')
    || text.includes('AGENDA_BLOCKED')
    || text.includes('AGENDA_TREATMENT_NOT_OFFERED')
    || text.includes('AGENDA_PROFESSIONAL_NOT_AT_LOCATION')
    || text.includes('AGENDA_APPOINTMENT_NOT_ACTIVE')
  ) {
    return new SchedulingValidationError(
      'The internal scheduling operation is invalid for the current agenda rules.',
      'internal',
      error,
    );
  }

  if (
    status === 0
    || (status !== undefined && status >= 500)
    || text.includes('FAILED TO FETCH')
    || text.includes('NETWORK')
    || text.includes('ECONNREFUSED')
    || text.includes('TIMEOUT')
  ) {
    return new SchedulingProviderUnavailableError('internal', error);
  }

  return new SchedulingProviderError('internal', error);
}
