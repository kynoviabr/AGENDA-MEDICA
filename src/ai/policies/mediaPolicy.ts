import type { AiMediaKind } from '../domain/models.ts';
import { AiMediaProcessingError } from '../errors/AiError.ts';

export const AI_MEDIA_POLICY = {
  audio: {
    maxBytes: 16 * 1024 * 1024,
    allowedMimeTypes: ['audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'],
  },
  image: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
  },
  document: {
    maxBytes: 12 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'text/plain'],
  },
} as const;

export function validateAiMedia(kind: AiMediaKind, mimeType: string, size: number): void {
  const policy = AI_MEDIA_POLICY[kind];
  if (!(policy.allowedMimeTypes as readonly string[]).includes(mimeType)) {
    throw new AiMediaProcessingError(`Unsupported ${kind} MIME type.`);
  }
  if (!Number.isFinite(size) || size <= 0 || size > policy.maxBytes) {
    throw new AiMediaProcessingError(`${kind} exceeds the allowed size.`);
  }
}
