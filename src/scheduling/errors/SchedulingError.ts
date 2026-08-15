import type { SchedulingProviderCapability } from '../domain/capabilities';
import type { SchedulingProviderType } from '../domain/models';

export type SchedulingErrorCode =
  | 'SCHEDULING_PROVIDER_UNAVAILABLE'
  | 'SCHEDULING_CAPABILITY_NOT_SUPPORTED'
  | 'SCHEDULING_SLOT_CONFLICT'
  | 'SCHEDULING_NOT_FOUND'
  | 'SCHEDULING_VALIDATION_ERROR'
  | 'SCHEDULING_UNAUTHORIZED'
  | 'SCHEDULING_PROVIDER_ERROR';

interface SchedulingErrorOptions {
  code: SchedulingErrorCode;
  provider?: SchedulingProviderType;
  originalError?: unknown;
}

export class SchedulingError extends Error {
  readonly code: SchedulingErrorCode;
  readonly provider?: SchedulingProviderType;
  readonly originalError?: unknown;

  constructor(message: string, options: SchedulingErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.provider = options.provider;
    this.originalError = options.originalError;
  }
}

export class SchedulingProviderUnavailableError extends SchedulingError {
  constructor(provider: SchedulingProviderType, originalError?: unknown) {
    super(`Scheduling provider "${provider}" is unavailable.`, {
      code: 'SCHEDULING_PROVIDER_UNAVAILABLE',
      provider,
      originalError,
    });
  }
}

export class SchedulingCapabilityNotSupportedError extends SchedulingError {
  readonly capability: SchedulingProviderCapability;

  constructor(provider: SchedulingProviderType, capability: SchedulingProviderCapability) {
    super(`Scheduling provider "${provider}" does not support capability "${capability}".`, {
      code: 'SCHEDULING_CAPABILITY_NOT_SUPPORTED',
      provider,
    });
    this.capability = capability;
  }
}

export class SchedulingSlotConflictError extends SchedulingError {
  constructor(provider?: SchedulingProviderType, originalError?: unknown) {
    super('The requested scheduling slot is no longer available.', {
      code: 'SCHEDULING_SLOT_CONFLICT',
      provider,
      originalError,
    });
  }
}

export class SchedulingNotFoundError extends SchedulingError {
  constructor(message = 'The requested scheduling resource was not found.', provider?: SchedulingProviderType, originalError?: unknown) {
    super(message, { code: 'SCHEDULING_NOT_FOUND', provider, originalError });
  }
}

export class SchedulingValidationError extends SchedulingError {
  constructor(message: string, provider?: SchedulingProviderType, originalError?: unknown) {
    super(message, { code: 'SCHEDULING_VALIDATION_ERROR', provider, originalError });
  }
}

export class SchedulingUnauthorizedError extends SchedulingError {
  constructor(provider?: SchedulingProviderType, originalError?: unknown) {
    super('The scheduling operation is not authorized.', {
      code: 'SCHEDULING_UNAUTHORIZED',
      provider,
      originalError,
    });
  }
}

export class SchedulingProviderError extends SchedulingError {
  constructor(provider: SchedulingProviderType, originalError?: unknown) {
    super(`Scheduling provider "${provider}" failed to execute the operation.`, {
      code: 'SCHEDULING_PROVIDER_ERROR',
      provider,
      originalError,
    });
  }
}

export function normalizeSchedulingError(
  error: unknown,
  provider: SchedulingProviderType,
): SchedulingError {
  return error instanceof SchedulingError
    ? error
    : new SchedulingProviderError(provider, error);
}
