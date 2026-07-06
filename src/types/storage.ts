// ============================================================
// Storage & Automation Types
// src/types/storage.ts + automation.ts combined
// ============================================================

// ---- STORAGE ----
export interface StorageSchema {
  // Chrome storage keys
  settings: import('./settings').ExtensionSettings;
  activeProfileId: string;
  ollamaUrl: string;
  sessionTabAnalysis: Record<number, import('./messages').PageAnalysis>;
}

export interface DBCollections {
  profiles: import('./resume').CandidateProfile;
  resumes: import('./resume').ParsedResume;
  jobs: import('./job').Job;
  applications: import('./job').Application;
  coverLetters: import('./job').CoverLetter;
  memoryEntries: import('./ai').MemoryEntry;
  embeddings: import('./ai').EmbeddingRecord;
  tailoredResumes: import('./resume').TailoredResume;
}

export type CollectionName = keyof DBCollections;

// ---- AUTOMATION ----
export type AutomationState =
  | 'idle'
  | 'detecting'
  | 'parsing_jd'
  | 'matching'
  | 'generating_answers'
  | 'filling_fields'
  | 'awaiting_review'
  | 'submitting'
  | 'completed'
  | 'error'
  | 'paused';

export interface AutomationSession {
  id: string;
  tabId: number;
  jobId: string;
  profileId: string;
  state: AutomationState;

  progress: {
    currentStep: string;
    totalFields: number;
    filledFields: number;
    totalQuestions: number;
    answeredQuestions: number;
  };

  errors: import('./adapter').AutomationError[];
  log: import('./job').AutomationLogEntry[];

  startedAt: string;
  updatedAt: string;
}

export interface AutomationResult {
  sessionId: string;
  adapterId: string;
  jobId: string;

  status: 'success' | 'partial' | 'failed' | 'cancelled';

  fieldsFilled: number;
  fieldsTotal: number;
  fieldsSkipped: number;
  fieldsFailed: number;

  questionsAnswered: number;
  questionsTotal: number;

  errors: import('./adapter').AutomationError[];
  warnings: string[];

  startTime: string;
  endTime: string;
  durationMs: number;
}
