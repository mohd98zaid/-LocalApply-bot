// ============================================================
// AI Types
// src/types/ai.ts
// ============================================================

export type AITask =
  | 'resume_parse'
  | 'resume_tailor'
  | 'cover_letter'
  | 'job_match'
  | 'ats_optimize'
  | 'question_answer'
  | 'skill_extract'
  | 'company_summarize'
  | 'field_classify'
  | 'application_score'
  | 'form_fill'
  | 'question_answer_v2';

export interface AIPrompt {
  id: string;
  name: string;
  task: AITask;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema?: Record<string, unknown>; // JSON Schema
  temperature: number;
  maxTokens: number;
  model?: string; // override default model
  version: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  model: string;
  tokensGenerated: number;
}

export interface AIResponse {
  id: string;
  promptId: string;
  model: string;
  content: string;
  parsedContent?: unknown;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  latencyMs: number;
  cached: boolean;
  timestamp: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

export interface OllamaStatus {
  connected: boolean;
  url: string;
  version?: string;
  models: OllamaModel[];
  primaryModelAvailable: boolean;
  embeddingModelAvailable: boolean;
  lastChecked: string;
  error?: string;
}

export type QuestionCategory =
  | 'behavioral'
  | 'salary'
  | 'technical'
  | 'availability'
  | 'visa'
  | 'relocation'
  | 'work_authorization'
  | 'education'
  | 'experience'
  | 'certifications'
  | 'cover_letter'
  | 'diversity'
  | 'custom';

export interface ApplicationQuestion {
  id: string;
  text: string;
  type: 'free_text' | 'multiple_choice' | 'yes_no' | 'numeric' | 'date' | 'file_upload';
  category: QuestionCategory;
  required: boolean;
  maxLength?: number;
  maxWords?: number;
  options?: string[];
  placeholder?: string;
  element?: HTMLElement;
  elementSelector?: string; // CSS selector for re-querying after serialization

  // AI results
  suggestedAnswer?: string;
  confidence?: number;
  alternativeAnswer?: string;
  reasoning?: string;
}

export interface AnswerContext {
  question: {
    text: string;
    category: QuestionCategory;
    maxLength?: number;
    options?: string[];
  };
  resume: {
    summary?: string;
    relevantExperience: string;
    relevantSkills: string[];
  };
  jobDescription: {
    title: string;
    company: string;
    requirements: string[];
    description: string;
  };
  companyContext?: {
    mission?: string;
    values?: string[];
    industry?: string;
    size?: string;
  };
  previousAnswers: {
    question: string;
    answer: string;
    similarity: number;
  }[];
  userPreferences: {
    tone: 'professional' | 'conversational' | 'enthusiastic';
    length: 'concise' | 'moderate' | 'detailed';
    salaryExpectation?: string;
    noticePeriod?: string;
    workAuthorization?: string;
    willingToRelocate?: boolean;
  };
}

// RAG / Memory types
export type MemoryType =
  | 'resume'
  | 'cover_letter'
  | 'job_description'
  | 'application_answer'
  | 'company_info'
  | 'recruiter_note'
  | 'skill'
  | 'interview_note'
  | 'user_note';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  metadata: {
    source: string;
    createdAt: string;
    updatedAt: string;
    accessCount: number;
    lastAccessed: string;
    tags: string[];
    relatedEntries: string[];
    jobId?: string;
    applicationId?: string;
  };
}

export interface EmbeddingRecord {
  id: string;
  memoryEntryId: string;
  vector: number[]; // Float32Array serialized as array for IndexedDB
  model: string;
  dimensions: number;
  createdAt: string;
}

export interface RAGQuery {
  query: string;
  topK: number;
  filter?: {
    types?: MemoryType[];
    dateRange?: { from: string; to: string };
    tags?: string[];
  };
  minSimilarity: number;
}

export interface RAGResult {
  entries: {
    entry: MemoryEntry;
    similarity: number;
    rank: number;
  }[];
  searchTimeMs: number;
}

