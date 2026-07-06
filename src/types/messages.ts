// ============================================================
// Message Passing Types (type-safe cross-context communication)
// src/types/messages.ts
// ============================================================

import type { ParsedResume, CandidateProfile, MatchReport } from './resume';
import type { Job, Application } from './job';
import type { ATSDetectionResult, FormField, FillResult, SubmissionResult } from './adapter';
import type { AIResponse, AIStreamChunk, ApplicationQuestion, OllamaStatus, AnswerContext } from './ai';
import type { ParsedJobDescription } from './job';
import type { ExtensionSettings } from './settings';

// ---- Message Definitions ----

export type MessageType =
  // Page / Tab
  | 'ANALYZE_PAGE'
  | 'PAGE_ANALYSIS_RESULT'
  | 'PAGE_CHANGED'

  // Autofill
  | 'START_AUTOFILL'
  | 'FILL_FIELD'
  | 'FILL_RESULT'
  | 'AUTOFILL_COMPLETE'
  | 'AUTOFILL_ERROR'
  | 'STOP_AUTOFILL'

  // Resume
  | 'PARSE_RESUME_FILE'
  | 'UPLOAD_RESUME'
  | 'RESUME_PARSED'
  | 'RESUME_PARSE_ERROR'

  // AI
  | 'GENERATE_ANSWER'
  | 'AI_RESPONSE'
  | 'AI_STREAM_CHUNK'
  | 'AI_ERROR'
  | 'GENERATE_COVER_LETTER'
  | 'TAILOR_RESUME'
  | 'MATCH_JOB'
  | 'MATCH_RESULT'

  // Ollama
  | 'CHECK_OLLAMA_STATUS'
  | 'OLLAMA_STATUS'

  // Storage
  | 'SAVE_APPLICATION'
  | 'GET_APPLICATIONS'
  | 'GET_PROFILE'
  | 'SAVE_PROFILE'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'

  // UI
  | 'OPEN_SIDE_PANEL'
  | 'SHOW_NOTIFICATION'
  | 'UPDATE_BADGE'

  // Generic
  | 'ERROR'
  | 'SUCCESS';

// Generic message envelope
export interface Message<T extends MessageType, P = unknown> {
  type: T;
  payload: P;
  requestId?: string; // for correlating responses
  tabId?: number;
  timestamp: string;
}

// Page Analysis
export interface PageAnalysis {
  url: string;
  title: string;
  ats: ATSDetectionResult;
  jobDescription?: ParsedJobDescription;
  formFields: FormField[];
  questions: ApplicationQuestion[];
  isApplicationPage: boolean;
  isJobListingPage: boolean;
}

// Typed message map
export type Messages = {
  ANALYZE_PAGE: Message<'ANALYZE_PAGE', { tabId: number }>;
  PAGE_ANALYSIS_RESULT: Message<'PAGE_ANALYSIS_RESULT', PageAnalysis>;
  PAGE_CHANGED: Message<'PAGE_CHANGED', { url: string; tabId: number }>;

  START_AUTOFILL: Message<'START_AUTOFILL', {
    profileId: string;
    jobId: string;
    mode: string;
    fieldsToFill: FormField[];
  }>;
  FILL_FIELD: Message<'FILL_FIELD', { field: FormField; value: string }>;
  FILL_RESULT: Message<'FILL_RESULT', FillResult>;
  AUTOFILL_COMPLETE: Message<'AUTOFILL_COMPLETE', { filledCount: number; failedCount: number; result?: SubmissionResult }>;
  AUTOFILL_ERROR: Message<'AUTOFILL_ERROR', { code: string; message: string; recoverable: boolean }>;
  STOP_AUTOFILL: Message<'STOP_AUTOFILL', Record<string, never>>;

  PARSE_RESUME_FILE: Message<'PARSE_RESUME_FILE', { data: ArrayBuffer; type: string; fileName: string }>;
  UPLOAD_RESUME: Message<'UPLOAD_RESUME', { data: number[]; type: string; fileName: string }>;
  RESUME_PARSED: Message<'RESUME_PARSED', ParsedResume>;
  RESUME_PARSE_ERROR: Message<'RESUME_PARSE_ERROR', { error: string }>;

  GENERATE_ANSWER: Message<'GENERATE_ANSWER', { question: ApplicationQuestion; context: AnswerContext }>;
  AI_RESPONSE: Message<'AI_RESPONSE', AIResponse>;
  AI_STREAM_CHUNK: Message<'AI_STREAM_CHUNK', AIStreamChunk>;
  AI_ERROR: Message<'AI_ERROR', { error: string; task: string }>;
  GENERATE_COVER_LETTER: Message<'GENERATE_COVER_LETTER', { profileId: string; jobId: string; tone: string }>;
  TAILOR_RESUME: Message<'TAILOR_RESUME', { resumeId: string; jobId: string }>;
  MATCH_JOB: Message<'MATCH_JOB', { resumeId: string; jobId: string }>;
  MATCH_RESULT: Message<'MATCH_RESULT', MatchReport>;

  CHECK_OLLAMA_STATUS: Message<'CHECK_OLLAMA_STATUS', Record<string, never>>;
  OLLAMA_STATUS: Message<'OLLAMA_STATUS', OllamaStatus>;

  SAVE_APPLICATION: Message<'SAVE_APPLICATION', Application>;
  GET_APPLICATIONS: Message<'GET_APPLICATIONS', { filter?: Record<string, unknown> }>;
  GET_PROFILE: Message<'GET_PROFILE', { profileId: string }>;
  SAVE_PROFILE: Message<'SAVE_PROFILE', CandidateProfile>;
  GET_SETTINGS: Message<'GET_SETTINGS', Record<string, never>>;
  SAVE_SETTINGS: Message<'SAVE_SETTINGS', Partial<ExtensionSettings>>;

  OPEN_SIDE_PANEL: Message<'OPEN_SIDE_PANEL', { tabId: number }>;
  SHOW_NOTIFICATION: Message<'SHOW_NOTIFICATION', { title: string; message: string; type: 'success' | 'error' | 'info' }>;
  UPDATE_BADGE: Message<'UPDATE_BADGE', { text: string; color: string }>;

  ERROR: Message<'ERROR', { code: string; message: string; context?: string }>;
  SUCCESS: Message<'SUCCESS', { message: string; data?: unknown }>;
};

// Helper type to extract payload of a specific message
export type MessagePayload<T extends MessageType> = Messages[T]['payload'];

// Utility function for creating typed messages
export function createMessage<T extends MessageType>(
  type: T,
  payload: Messages[T]['payload'],
  options?: { tabId?: number; requestId?: string }
): Messages[T] {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
    ...options,
  } as Messages[T];
}
