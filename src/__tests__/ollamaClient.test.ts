// ============================================================
// Tests: Ollama Client (mocked HTTP)
// src/__tests__/ollamaClient.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOllamaClient } from '../ai/ollama/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeMockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

describe('OllamaClient', () => {
  const BASE_URL = 'http://localhost:11434';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('healthCheck', () => {
    it('returns true when Ollama responds OK', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse({ status: 'ok' }, true));
      const client = getOllamaClient(BASE_URL);
      const result = await client.healthCheck();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/version'),
        expect.any(Object)
      );
    });

    it('returns false when Ollama is offline', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const client = getOllamaClient(BASE_URL);
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });

    it('returns false on non-OK HTTP status', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse(null, false, 503));
      const client = getOllamaClient(BASE_URL);
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('listModels', () => {
    it('returns model list on success', async () => {
      const models = [
        { name: 'gemma4:31b-cloud', size: 4887999488, details: { parameter_size: '31B' } },
        { name: 'nomic-embed-text', size: 274877906944 },
      ];
      mockFetch.mockResolvedValueOnce(makeMockResponse({ models }, true));
      const client = getOllamaClient(BASE_URL);
      const result = await client.listModels();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('gemma4:31b-cloud');
    });

    it('returns empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const client = getOllamaClient(BASE_URL);
      const result = await client.listModels();
      expect(result).toEqual([]);
    });
  });

  describe('getOllamaStatus', () => {
    it('detects primary model availability', async () => {
      const models = [
        { name: 'gemma4:31b-cloud', size: 0, details: {} },
        { name: 'nomic-embed-text', size: 0, details: {} },
      ];
      // First call for healthCheck
      mockFetch.mockResolvedValueOnce(makeMockResponse({ status: 'ok' }, true));
      // Second call for listModels
      mockFetch.mockResolvedValueOnce(makeMockResponse({ models }, true));

      const client = getOllamaClient(BASE_URL);
      const status = await client.getStatus('gemma4:31b-cloud', 'nomic-embed-text');

      expect(status.connected).toBe(true);
      expect(status.primaryModelAvailable).toBe(true);
      expect(status.embeddingModelAvailable).toBe(true);
    });

    it('sets connected=false when offline', async () => {
      mockFetch.mockRejectedValue(new Error('offline'));
      const client = getOllamaClient(BASE_URL);
      const status = await client.getStatus('gemma4:31b-cloud', 'nomic-embed-text');
      expect(status.connected).toBe(false);
    });
  });
});
