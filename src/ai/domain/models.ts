export type AiChannel = 'whatsapp' | 'web' | 'internal';
export type AiMessageType = 'text' | 'audio' | 'image' | 'document';
export type AiMediaKind = Exclude<AiMessageType, 'text'>;
export type AiMediaSource = 'whatsapp' | 'upload' | 'internal';

export interface AiExecutionContext {
  clinicId: string;
  conversationId: string;
  channel: AiChannel;
  correlationId: string;
  patientId?: string;
  leadId?: string;
}

export interface AiMediaReference {
  mediaId: string;
  mimeType: string;
  size?: number;
  kind: AiMediaKind;
  source: AiMediaSource;
  fileName?: string;
}

export interface AiInboundMessage {
  id: string;
  clinicId: string;
  conversationId: string;
  channel: AiChannel;
  senderId: string;
  messageType: AiMessageType;
  receivedAt: string;
  text?: string;
  media?: AiMediaReference;
}

export type AiImageCategory =
  | 'administrative_document'
  | 'insurance_card'
  | 'appointment_document'
  | 'medical_order'
  | 'exam_result'
  | 'clinical_photo'
  | 'unrelated'
  | 'unknown';

export type AiSafetyDisposition =
  | 'allowed'
  | 'administrative_only'
  | 'clinical_content_restricted'
  | 'requires_handoff';

export interface AiProcessingMetric {
  requestType: 'transcription' | 'vision' | 'document_preprocessing';
  provider: string;
  model?: string;
  latencyMs: number;
  inputUnits?: number;
  outputUnits?: number;
  totalUnits?: number;
  succeeded: boolean;
  errorCode?: string;
}

export interface AiNormalizedAttachment {
  mediaId: string;
  mimeType: string;
  size?: number;
  kind: AiMediaKind;
  category?: AiImageCategory;
  processingStatus: 'processed' | 'unsupported' | 'failed';
}

export interface AiNormalizedMessage {
  clinicId: string;
  conversationId: string;
  originalMessageId: string;
  originalType: AiMessageType;
  normalizedText: string;
  attachments: readonly AiNormalizedAttachment[];
  understandingMetadata: Readonly<{
    detectedLanguage?: string;
    imageCategory?: AiImageCategory;
    safetyDisposition?: AiSafetyDisposition;
    needsClarification: boolean;
  }>;
  processingMetrics: readonly AiProcessingMetric[];
  preprocessingLatencyMs: number;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiResponse {
  text: string;
  provider: string;
  model: string;
  finishReason?: string;
  usage: AiUsage;
  latencyMs: number;
  safetyDisposition: AiSafetyDisposition;
  detectedLanguage?: string;
  requiresClarification: boolean;
  requiresHandoff: boolean;
}

export interface AiConversationMessage {
  clinicId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AiClinicConfig {
  clinicId: string;
  clinicName: string;
  enabled: boolean;
  preferredLanguage: string;
  responseStyle: string;
  administrativeContext?: readonly string[];
}
