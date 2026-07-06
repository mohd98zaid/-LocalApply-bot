// ============================================================
// Extension Settings Types
// src/types/settings.ts
// ============================================================

export type AutomationMode = 'manual' | 'review' | 'semi_auto' | 'copilot';
export type UITheme = 'light' | 'dark' | 'system';
export type AnswerTone = 'professional' | 'conversational' | 'enthusiastic';
export type AnswerLength = 'concise' | 'moderate' | 'detailed';

export interface ExtensionSettings {
  version: string;

  ai: {
    ollamaUrl: string;
    primaryModel: string;
    embeddingModel: string;
    temperature: number;
    maxTokens: number;
    contextLength: number;
    streamResponses: boolean;
    timeout: number;
    maxRetries: number;
  };

  automation: {
    defaultMode: AutomationMode;
    typingDelay: { min: number; max: number };
    fieldDelay: { min: number; max: number };
    pageDelay: { min: number; max: number };
    autoSaveProgress: boolean;
    maxRetries: number;
    humanLikeTyping: boolean;
    scrollToField: boolean;
  };

  privacy: {
    encryptLocalData: boolean;
    clearDataOnUninstall: boolean;
    telemetry: false; // Always false — no telemetry
    allowRemoteAI: boolean;
  };

  ui: {
    theme: UITheme;
    showFloatingOverlay: boolean;
    openSidePanelOnJobPage: boolean;
    notifications: boolean;
    language: string;
    showMatchScoreBadge: boolean;
  };

  answers: {
    tone: AnswerTone;
    length: AnswerLength;
    autoGenerateForKnownCategories: boolean;
    saveAllAnswers: boolean;
    showConfidenceScore: boolean;
  };

  activeProfileId: string;
  firstTimeSetup: boolean;
  setupCompletedAt?: string;
  lastUpdated: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: '0.1.0',

  ai: {
    ollamaUrl: 'http://localhost:11434',
    primaryModel: 'gemma4:31b-cloud',
    embeddingModel: 'nomic-embed-text',
    temperature: 0.7,
    maxTokens: 4096,
    contextLength: 8192,
    streamResponses: true,
    timeout: 120000,
    maxRetries: 3,
  },

  automation: {
    defaultMode: 'review',
    typingDelay: { min: 30, max: 120 },
    fieldDelay: { min: 200, max: 600 },
    pageDelay: { min: 1000, max: 2500 },
    autoSaveProgress: true,
    maxRetries: 3,
    humanLikeTyping: true,
    scrollToField: true,
  },

  privacy: {
    encryptLocalData: false,
    clearDataOnUninstall: false,
    telemetry: false,
    allowRemoteAI: false,
  },

  ui: {
    theme: 'system',
    showFloatingOverlay: true,
    openSidePanelOnJobPage: false,
    notifications: true,
    language: 'en',
    showMatchScoreBadge: true,
  },

  answers: {
    tone: 'professional',
    length: 'moderate',
    autoGenerateForKnownCategories: true,
    saveAllAnswers: true,
    showConfidenceScore: true,
  },

  activeProfileId: '',
  firstTimeSetup: true,
  lastUpdated: new Date().toISOString(),
};
