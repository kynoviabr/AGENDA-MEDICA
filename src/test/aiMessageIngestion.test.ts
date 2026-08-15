import { describe, expect, it } from 'vitest';
import {
  AiMessageIngestionService,
  AiProviderUnavailableError,
  AudioMessageProcessor,
  DocumentMessageProcessor,
  FakeTranscriptionProvider,
  FakeVisionProvider,
  ImageMessageProcessor,
  TextMessageProcessor,
  type AiExecutionContext,
  type AiInboundMessage,
  type AiLoadedMedia,
  type AiMediaLoader,
} from '@/ai';

class FakeMediaLoader implements AiMediaLoader {
  constructor(private readonly media: AiLoadedMedia) {}
  async load() { return this.media; }
}

const context: AiExecutionContext = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp', correlationId: 'correlation-a',
};

function inbound(messageType: AiInboundMessage['messageType'], overrides: Partial<AiInboundMessage> = {}): AiInboundMessage {
  return {
    id: `message-${messageType}`, clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp',
    senderId: 'synthetic-sender', messageType, receivedAt: '2026-08-15T20:00:00.000Z', ...overrides,
  };
}

describe('AiMessageIngestionService', () => {
  it('normalizes technical text encoding without changing its meaning', async () => {
    const processor = new TextMessageProcessor();
    const service = new AiMessageIngestionService({
      text: processor, audio: processor, image: processor, document: processor,
    });
    const result = await service.ingest(inbound('text', { text: '  oi tem hr amanha dra ana?\r\n' }), context);
    expect(result.normalizedText).toBe('oi tem hr amanha dra ana?');
    expect(result.originalType).toBe('text');
  });

  it('rejects a message routed from another clinic', async () => {
    const processor = new TextMessageProcessor();
    const service = new AiMessageIngestionService({ text: processor, audio: processor, image: processor, document: processor });
    await expect(service.ingest(inbound('text', { clinicId: 'clinic-b', text: 'oi' }), context)).rejects.toMatchObject({
      code: 'AI_VALIDATION_FAILED',
    });
  });

  it('transcribes a WhatsApp voice message and does not retain its bytes in the normalized model', async () => {
    const processor = new AudioMessageProcessor(
      new FakeMediaLoader({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/ogg', size: 3, fileName: 'voice.ogg' }),
      new FakeTranscriptionProvider({
        text: 'Quero marcar com a doutora Ana pela Unimed depois das quatro', provider: 'fake_transcription',
        model: 'fake-stt', language: 'pt', durationSeconds: 4,
      }),
    );
    const result = await processor.process(inbound('audio', {
      media: { mediaId: 'media-audio', mimeType: 'audio/ogg', kind: 'audio', source: 'whatsapp' },
    }), context);
    expect(result.normalizedText).toContain('doutora Ana');
    expect(result.processingMetrics[0]).toMatchObject({ requestType: 'transcription', succeeded: true });
    expect(JSON.stringify(result)).not.toContain('[1,2,3]');
  });

  it('marks an empty transcription for clarification without inventing content', async () => {
    const processor = new AudioMessageProcessor(
      new FakeMediaLoader({ bytes: new Uint8Array([1]), mimeType: 'audio/ogg', size: 1 }),
      new FakeTranscriptionProvider({ text: '   ', provider: 'fake_transcription', model: 'fake-stt' }),
    );
    const result = await processor.process(inbound('audio', {
      media: { mediaId: 'media-empty', mimeType: 'audio/ogg', kind: 'audio', source: 'whatsapp' },
    }), context);
    expect(result.understandingMetadata.needsClarification).toBe(true);
    expect(result.normalizedText).toContain('não pôde ser compreendido');
  });

  it('normalizes transcription provider failure without exposing vendor details', async () => {
    const processor = new AudioMessageProcessor(
      new FakeMediaLoader({ bytes: new Uint8Array([1]), mimeType: 'audio/ogg', size: 1 }),
      new FakeTranscriptionProvider(new AiProviderUnavailableError(new Error('vendor secret detail'))),
      { timeoutMs: 20, maxAttempts: 1 },
    );
    await expect(processor.process(inbound('audio', {
      media: { mediaId: 'media-fail', mimeType: 'audio/ogg', kind: 'audio', source: 'whatsapp' },
    }), context)).rejects.toMatchObject({ code: 'AI_TRANSCRIPTION_FAILED', message: 'Audio transcription failed.' });
  });

  it('classifies an insurance card as administrative content', async () => {
    const processor = new ImageMessageProcessor(
      new FakeMediaLoader({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg', size: 1 }),
      new FakeVisionProvider({
        description: 'Carteirinha de convênio com dados parcialmente ocultos.', category: 'insurance_card',
        provider: 'fake_vision', model: 'fake-vision', usage: {},
      }),
    );
    const result = await processor.process(inbound('image', {
      media: { mediaId: 'media-card', mimeType: 'image/jpeg', kind: 'image', source: 'whatsapp' },
    }), context);
    expect(result.understandingMetadata).toMatchObject({ imageCategory: 'insurance_card', safetyDisposition: 'administrative_only' });
  });

  it.each([
    ['clinical_photo', 'imagem clínica'],
    ['exam_result', 'resultado de exame'],
  ] as const)('restricts %s and discards any vendor clinical interpretation', async (category, expected) => {
    const processor = new ImageMessageProcessor(
      new FakeMediaLoader({ bytes: new Uint8Array([1]), mimeType: 'image/png', size: 1 }),
      new FakeVisionProvider({
        description: 'Vendor attempted diagnosis: sensitive clinical interpretation.', category,
        provider: 'fake_vision', model: 'fake-vision', usage: {},
      }),
    );
    const result = await processor.process(inbound('image', {
      media: { mediaId: `media-${category}`, mimeType: 'image/png', kind: 'image', source: 'whatsapp' },
    }), context);
    expect(result.normalizedText).toContain(expected);
    expect(result.normalizedText).not.toContain('diagnosis');
    expect(result.understandingMetadata.safetyDisposition).toBe('clinical_content_restricted');
  });

  it('keeps a PDF as a safe document foundation without parsing or downloading it', async () => {
    const result = await new DocumentMessageProcessor().process(inbound('document', {
      media: { mediaId: 'synthetic-pdf', mimeType: 'application/pdf', kind: 'document', source: 'whatsapp', size: 100 },
    }), context);
    expect(result.attachments[0]).toMatchObject({ kind: 'document', processingStatus: 'unsupported' });
    expect(result.understandingMetadata.needsClarification).toBe(true);
  });
});
