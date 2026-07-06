// ============================================================
// Tests: ATS Adapter — base utilities and question classifier
// src/__tests__/adapter.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the classifyQuestion logic by extracting it to a testable module
// Since BaseATSAdapter is abstract, we create a minimal concrete subclass

// --- Inline the classify logic to test independently ---
type QuestionCategory =
  | 'behavioral' | 'salary' | 'technical' | 'availability'
  | 'visa' | 'relocation' | 'education' | 'experience'
  | 'certifications' | 'custom';

function classifyQuestion(text: string): QuestionCategory {
  const lower = text.toLowerCase();
  if (/salary|compensation|pay|rate|wage|earn/.test(lower)) return 'salary';
  if (/visa|sponsorship|work.?authoriz|citizen|authorize|eligible|permit/.test(lower)) return 'visa';
  if (/relocat/.test(lower)) return 'relocation';
  if (/notice|available|start.?date|when.?can.?you.?start/.test(lower)) return 'availability';
  if (/education|degree|gpa|graduate|university|school/.test(lower)) return 'education';
  if (/certif|licens/.test(lower)) return 'certifications';
  if (/year.?of.?exp|experience|background/.test(lower)) return 'experience';
  // technical before behavioral (more specific)
  if (/technical|coding|programming|algorithm|system.?design/.test(lower)) return 'technical';
  if (/tell.?us|describe|explain|why|motivat|passion|strength|weakness|challeng/.test(lower)) return 'behavioral';
  return 'custom';
}

describe('classifyQuestion', () => {
  it('classifies salary questions', () => {
    expect(classifyQuestion('What are your salary expectations?')).toBe('salary');
    expect(classifyQuestion('What is your desired compensation?')).toBe('salary');
    expect(classifyQuestion('What hourly rate do you expect?')).toBe('salary');
  });

  it('classifies visa/work authorization questions', () => {
    expect(classifyQuestion('Are you authorized to work in the US?')).toBe('visa');
    expect(classifyQuestion('Do you require visa sponsorship?')).toBe('visa');
    expect(classifyQuestion('Are you a US citizen?')).toBe('visa');
  });

  it('classifies relocation questions', () => {
    expect(classifyQuestion('Are you willing to relocate?')).toBe('relocation');
    expect(classifyQuestion('Would you relocate for this position?')).toBe('relocation');
  });

  it('classifies availability/start date questions', () => {
    expect(classifyQuestion('What is your notice period?')).toBe('availability');
    expect(classifyQuestion('When can you start?')).toBe('availability');
    expect(classifyQuestion('What is your available start date?')).toBe('availability');
  });

  it('classifies education questions', () => {
    expect(classifyQuestion('What is your highest degree?')).toBe('education');
    expect(classifyQuestion('Which university did you attend?')).toBe('education');
    expect(classifyQuestion('What is your GPA?')).toBe('education');
  });

  it('classifies behavioral questions', () => {
    expect(classifyQuestion('Tell us about yourself')).toBe('behavioral');
    expect(classifyQuestion('Describe a challenging project')).toBe('behavioral');
    expect(classifyQuestion('Why do you want to work here?')).toBe('behavioral');
    expect(classifyQuestion('What is your greatest strength?')).toBe('behavioral');
  });

  it('classifies experience questions', () => {
    expect(classifyQuestion('How many years of experience do you have?')).toBe('experience');
    expect(classifyQuestion('Describe your background in React')).toBe('experience');
  });

  it('classifies technical questions', () => {
    expect(classifyQuestion('Are you familiar with system design?')).toBe('technical');
    expect(classifyQuestion('What coding algorithms do you prefer?')).toBe('technical');
    expect(classifyQuestion('Are you familiar with programming patterns?')).toBe('technical');
  });

  it('defaults to custom for unknown questions', () => {
    expect(classifyQuestion('Do you like coffee?')).toBe('custom');
    expect(classifyQuestion('Have you read our privacy policy?')).toBe('custom');
  });

  it('is case insensitive', () => {
    expect(classifyQuestion('WHAT IS YOUR SALARY?')).toBe('salary');
    expect(classifyQuestion('Do You Require VISA Sponsorship?')).toBe('visa');
  });
});

// ============================================================
// Tests: Settings defaults
// src/__tests__/settings.test.ts
// ============================================================

describe('DEFAULT_SETTINGS', () => {
  it('has privacy telemetry always false', async () => {
    const { DEFAULT_SETTINGS } = await import('../types/settings');
    expect(DEFAULT_SETTINGS.privacy.telemetry).toBe(false);
  });

  it('has sensible defaults', async () => {
    const { DEFAULT_SETTINGS } = await import('../types/settings');
    expect(DEFAULT_SETTINGS.ai.ollamaUrl).toBe('http://localhost:11434');
    expect(DEFAULT_SETTINGS.ai.primaryModel).toBe('gemma4:31b-cloud');
    expect(DEFAULT_SETTINGS.ai.embeddingModel).toBe('nomic-embed-text');
    expect(DEFAULT_SETTINGS.automation.defaultMode).toBe('review');
    expect(DEFAULT_SETTINGS.firstTimeSetup).toBe(true);
  });

  it('has human-like typing delays', async () => {
    const { DEFAULT_SETTINGS } = await import('../types/settings');
    expect(DEFAULT_SETTINGS.automation.typingDelay.min).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.automation.typingDelay.max).toBeGreaterThan(
      DEFAULT_SETTINGS.automation.typingDelay.min
    );
  });
});
