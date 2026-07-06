// ============================================================
// Tests: AI Prompt interpolation
// src/__tests__/prompts.test.ts
// ============================================================

import { describe, it, expect } from 'vitest';
import { interpolatePrompt, RESUME_PARSER_PROMPT, QUESTION_ANSWERER_PROMPT, PROMPT_REGISTRY } from '../ai/prompts/index';

describe('interpolatePrompt', () => {
  it('replaces simple placeholders', () => {
    const template = 'Hello {{name}}, you are {{age}} years old';
    const result = interpolatePrompt(template, { name: 'Alice', age: '30' });
    expect(result).toBe('Hello Alice, you are 30 years old');
  });

  it('leaves missing placeholders as [key]', () => {
    const result = interpolatePrompt('Hello {{name}}', {});
    expect(result).toBe('Hello [name]');
  });

  it('handles undefined values as [key]', () => {
    const result = interpolatePrompt('Val: {{val}}', { val: undefined });
    expect(result).toBe('Val: [val]');
  });

  it('replaces all occurrences of the same placeholder', () => {
    const template = '{{x}} and {{x}} again';
    expect(interpolatePrompt(template, { x: 'foo' })).toBe('foo and foo again');
  });

  it('handles empty string values', () => {
    expect(interpolatePrompt('{{a}}{{b}}', { a: 'hello', b: '' })).toBe('hello');
  });
});

describe('PROMPT_REGISTRY', () => {
  it('contains all 10 expected prompts', () => {
    const keys = Object.keys(PROMPT_REGISTRY);
    expect(keys).toHaveLength(10);
  });

  it('each prompt has required fields', () => {
    for (const prompt of Object.values(PROMPT_REGISTRY)) {
      expect(prompt.id).toBeTruthy();
      expect(prompt.name).toBeTruthy();
      expect(prompt.task).toBeTruthy();
      expect(prompt.systemPrompt).toBeTruthy();
      expect(prompt.userPromptTemplate).toBeTruthy();
      expect(typeof prompt.temperature).toBe('number');
      expect(prompt.temperature).toBeGreaterThanOrEqual(0);
      expect(prompt.temperature).toBeLessThanOrEqual(1);
      expect(prompt.maxTokens).toBeGreaterThan(0);
    }
  });

  it('resume parser prompt has correct task', () => {
    expect(RESUME_PARSER_PROMPT.task).toBe('resume_parse');
    expect(RESUME_PARSER_PROMPT.temperature).toBeLessThanOrEqual(0.3);
  });

  it('question answerer has moderate temperature', () => {
    expect(QUESTION_ANSWERER_PROMPT.task).toBe('question_answer');
    expect(QUESTION_ANSWERER_PROMPT.temperature).toBeGreaterThan(0.3);
  });
});
