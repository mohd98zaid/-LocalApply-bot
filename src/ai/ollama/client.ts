// ============================================================
// Ollama REST API Client
// src/ai/ollama/client.ts
// ============================================================

import type { OllamaModel, OllamaStatus, AIStreamChunk } from '../../types/ai';

export interface OllamaGenerateRequest {
  model: string;
  prompt?: string;
  system?: string;
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream?: boolean;
  format?: 'json' | Record<string, unknown>;
  options?: {
    temperature?: number;
    num_predict?: number;
    num_ctx?: number;
    top_p?: number;
    top_k?: number;
    stop?: string[];
  };
}

export interface OllamaEmbedRequest {
  model: string;
  input: string | string[];
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

type StreamCallback = (chunk: AIStreamChunk) => void;

export class OllamaClient {
  private baseUrl: string;
  private timeout: number;
  private controller: AbortController | null = null;

  constructor(baseUrl = 'http://localhost:11434', timeout = 120000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  // ---- Health & Discovery ----

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/version`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getStatus(primaryModel?: string, embeddingModel?: string): Promise<OllamaStatus> {
    try {
      const versionRes = await this.fetchWithTimeout(`${this.baseUrl}/api/version`, {
        method: 'GET',
      });

      if (!versionRes.ok) {
        return this.disconnectedStatus();
      }

      const versionData = await versionRes.json() as { version: string };
      const models = await this.listModels();
      const modelNames = models.map(m => m.name);

      return {
        connected: true,
        url: this.baseUrl,
        version: versionData.version,
        models,
        primaryModelAvailable: primaryModel
          ? modelNames.some(n => n === primaryModel || n.startsWith(primaryModel + ':'))
          : false,
        embeddingModelAvailable: embeddingModel
          ? modelNames.some(n => n === embeddingModel || n.startsWith(embeddingModel + ':'))
          : false,
        lastChecked: new Date().toISOString(),
      };
    } catch {
      return this.disconnectedStatus();
    }
  }

  private disconnectedStatus(): OllamaStatus {
    return {
      connected: false,
      url: this.baseUrl,
      models: [],
      primaryModelAvailable: false,
      embeddingModelAvailable: false,
      lastChecked: new Date().toISOString(),
      error: 'Cannot connect to Ollama. Make sure it is running on ' + this.baseUrl,
    };
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as { models: OllamaModel[] };
      return data.models || [];
    } catch {
      return [];
    }
  }

  async isModelAvailable(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.name === modelName || m.name.startsWith(modelName + ':'));
  }

  async pullModel(modelName: string, onProgress?: (status: string) => void): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!res.ok) return false;
    if (!onProgress) return true;

    const reader = res.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as { status: string };
          onProgress(data.status);
        } catch { /* ignore parse errors */ }
      }
    }
    return true;
  }

  // ---- Generation ----

  async generate(request: OllamaGenerateRequest): Promise<string> {
    const chunks: string[] = [];
    await this.stream(request, (chunk) => {
      chunks.push(chunk.content);
    });
    return chunks.join('');
  }

  async *streamGenerator(request: OllamaGenerateRequest): AsyncGenerator<AIStreamChunk> {
    this.controller = new AbortController();

    const endpoint = request.messages ? '/api/chat' : '/api/generate';
    const body: Record<string, unknown> = {
      ...request,
      stream: true,
    };

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.controller.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama request failed: ${res.status} — ${errorText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as {
              response?: string;
              message?: { content: string };
              done: boolean;
              model: string;
              eval_count?: number;
            };

            const content = data.response ?? data.message?.content ?? '';
            yield {
              content,
              done: data.done,
              model: data.model,
              tokensGenerated: data.eval_count ?? 0,
            };

            if (data.done) return;
          } catch { /* skip malformed chunks */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async stream(request: OllamaGenerateRequest, onChunk: StreamCallback): Promise<void> {
    for await (const chunk of this.streamGenerator(request)) {
      onChunk(chunk);
    }
  }

  async generateJSON<T = unknown>(request: OllamaGenerateRequest, schema?: Record<string, unknown>): Promise<T> {
    const jsonRequest: OllamaGenerateRequest = {
      ...request,
      format: schema ?? 'json',
      options: {
        ...request.options,
        temperature: request.options?.temperature ?? 0.1, // Low temp for JSON
      },
    };

    const raw = await this.generate(jsonRequest);

    // Extract JSON from response (sometimes models wrap it in markdown)
    const jsonMatch = raw.match(/```json\n?([\s\S]*?)\n?```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? raw) : raw;

    return JSON.parse(jsonStr.trim()) as T;
  }

  // ---- Embeddings ----

  async embed(model: string, text: string | string[]): Promise<number[][]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text } satisfies OllamaEmbedRequest),
    });

    if (!res.ok) {
      throw new Error(`Embedding request failed: ${res.status}`);
    }

    const data = await res.json() as OllamaEmbedResponse;
    return data.embeddings;
  }

  async embedSingle(model: string, text: string): Promise<number[]> {
    const embeddings = await this.embed(model, text);
    return embeddings[0] ?? [];
  }

  // ---- Utilities ----

  abort() {
    this.controller?.abort();
    this.controller = null;
  }

  private async fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    const timeoutId = setTimeout(() => this.controller?.abort(), this.timeout);
    try {
      return await fetch(url, options);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton for use across the extension
let _client: OllamaClient | null = null;

export function getOllamaClient(url?: string): OllamaClient {
  if (!_client) {
    _client = new OllamaClient(url ?? 'http://localhost:11434');
  } else if (url) {
    _client.setBaseUrl(url);
  }
  return _client;
}
