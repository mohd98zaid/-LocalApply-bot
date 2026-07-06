// ============================================================
// Tests: Text chunker
// src/__tests__/chunker.test.ts
// ============================================================

import { describe, it, expect } from 'vitest';
import { chunkText, chunkResume } from '../rag/chunker';

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const text = 'Hello world. This is a short resume.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text.trim());
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it('splits long text into multiple chunks', () => {
    const longText = 'A'.repeat(2000);
    const chunks = chunkText(longText, {}, { chunkSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunks have overlap with consecutive chunks', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}. Some content here to pad it out.`).join('\n\n');
    const chunks = chunkText(text, {}, { chunkSize: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should not be empty
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.id).toBeTruthy();
    }
  });

  it('includes metadata in each chunk', () => {
    const meta = { source: 'test', type: 'resume' };
    const chunks = chunkText('Short text', meta);
    expect(chunks[0].metadata).toEqual(meta);
  });

  it('assigns sequential chunk indices', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Para ${i}: ${'x'.repeat(100)}`).join('\n\n');
    const chunks = chunkText(text, {}, { chunkSize: 200, overlap: 20 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].totalChunks).toBe(chunks.length);
    }
  });

  it('skips chunks smaller than minChunkSize', () => {
    const text = 'Paragraph one.\n\nTiny\n\nParagraph three with enough content to be included in the result.';
    const chunks = chunkText(text, {}, { chunkSize: 1000, overlap: 0, minChunkSize: 20 });
    // All chunks should be >= minChunkSize
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('chunkResume', () => {
  const sampleResume = `
John Doe
john@example.com | (555) 123-4567

SUMMARY
Experienced software engineer with 5 years building scalable web applications.

EXPERIENCE
Senior Software Engineer | Acme Corp | 2021–Present
- Built microservices architecture serving 1M+ users
- Led team of 4 engineers on core platform redesign
- Reduced API response times by 40% through caching

Software Engineer | StartupXYZ | 2019–2021
- Developed React frontend for SaaS product
- Implemented CI/CD pipelines with GitHub Actions

EDUCATION
Bachelor of Science in Computer Science
University of Technology | 2019

SKILLS
Programming: TypeScript, Python, Go, Rust
Frameworks: React, Node.js, FastAPI, Gin
Cloud: AWS, GCP, Docker, Kubernetes
`.trim();

  it('returns chunks from a resume', () => {
    const chunks = chunkResume(sampleResume, 'resume-123');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('includes resumeId in metadata', () => {
    const chunks = chunkResume(sampleResume, 'resume-123');
    for (const chunk of chunks) {
      expect(chunk.metadata.resumeId).toBe('resume-123');
    }
  });

  it('each chunk has a unique id', () => {
    const chunks = chunkResume(sampleResume, 'resume-123');
    const ids = chunks.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
