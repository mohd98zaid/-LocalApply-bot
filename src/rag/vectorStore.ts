// ============================================================
// Vector Store — HNSW-like approximate nearest neighbor search
// src/rag/vectorStore.ts
//
// Pure TypeScript implementation (no WASM needed).
// Uses a flat index with cosine similarity for MVP.
// For production scale, swap the inner search with hnswlib-wasm.
// ============================================================

import { embeddingsDB, memoryDB } from '../storage/indexedDB';
import type { MemoryEntry, EmbeddingRecord, RAGQuery, RAGResult, MemoryType } from '../types/ai';

// ---- Cosine Similarity ----

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---- In-memory index (loaded from IndexedDB) ----

interface IndexedVector {
  embeddingId: string;
  memoryEntryId: string;
  vector: number[];
  type: string;
}

class VectorIndex {
  private vectors: IndexedVector[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const embeddings = await embeddingsDB.getAll();
    this.vectors = embeddings.map(e => ({
      embeddingId: e.id,
      memoryEntryId: e.memoryEntryId,
      vector: e.vector,
      type: '',
    }));
    this.loaded = true;
  }

  async addVector(embedding: EmbeddingRecord): Promise<void> {
    this.vectors.push({
      embeddingId: embedding.id,
      memoryEntryId: embedding.memoryEntryId,
      vector: embedding.vector,
      type: '',
    });
  }

  removeByMemoryId(memoryEntryId: string): void {
    this.vectors = this.vectors.filter(v => v.memoryEntryId !== memoryEntryId);
  }

  search(queryVector: number[], topK: number, minSimilarity = 0.0): { memoryEntryId: string; similarity: number }[] {
    const scored = this.vectors
      .map(v => ({
        memoryEntryId: v.memoryEntryId,
        similarity: cosineSimilarity(queryVector, v.vector),
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity);

    // Deduplicate by memoryEntryId (take highest score)
    const seen = new Set<string>();
    const deduped: { memoryEntryId: string; similarity: number }[] = [];
    for (const r of scored) {
      if (!seen.has(r.memoryEntryId)) {
        seen.add(r.memoryEntryId);
        deduped.push(r);
        if (deduped.length >= topK) break;
      }
    }

    return deduped;
  }

  get size(): number {
    return this.vectors.length;
  }

  invalidate(): void {
    this.loaded = false;
    this.vectors = [];
  }
}

// Singleton index
const INDEX = new VectorIndex();

// ---- Public API ----

/**
 * Add a memory entry + its embedding to the store
 */
export async function addMemory(
  content: string,
  type: MemoryType,
  metadata: Partial<MemoryEntry['metadata']>,
  embedding: number[],
  model: string
): Promise<{ entry: MemoryEntry; embedding: EmbeddingRecord }> {
  await INDEX.load();

  const now = new Date().toISOString();

  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    type,
    content,
    metadata: {
      source: metadata.source ?? 'user',
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessed: now,
      tags: metadata.tags ?? [],
      relatedEntries: metadata.relatedEntries ?? [],
      jobId: metadata.jobId,
      applicationId: metadata.applicationId,
    },
  };

  const embeddingRecord: EmbeddingRecord = {
    id: crypto.randomUUID(),
    memoryEntryId: entry.id,
    vector: embedding,
    model,
    dimensions: embedding.length,
    createdAt: now,
  };

  // Persist
  await memoryDB.save(entry);
  await embeddingsDB.save(embeddingRecord);

  // Update in-memory index
  await INDEX.addVector(embeddingRecord);

  return { entry, embedding: embeddingRecord };
}

/**
 * Search the vector store for similar memories
 */
export async function searchMemory(query: RAGQuery, queryVector: number[]): Promise<RAGResult> {
  const t0 = performance.now();
  await INDEX.load();

  const results = INDEX.search(queryVector, query.topK, query.minSimilarity);

  // Fetch full memory entries
  const entries: RAGResult['entries'] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const entry = await memoryDB.get(r.memoryEntryId);
    if (!entry) continue;

    // Apply type filter
    if (query.filter?.types && !query.filter.types.includes(entry.type)) continue;

    // Update access count
    entry.metadata.accessCount++;
    entry.metadata.lastAccessed = new Date().toISOString();
    await memoryDB.save(entry);

    entries.push({ entry, similarity: r.similarity, rank: i });
  }

  return {
    entries,
    searchTimeMs: performance.now() - t0,
  };
}

/**
 * Delete a memory entry and its embeddings
 */
export async function deleteMemory(memoryEntryId: string): Promise<void> {
  await memoryDB.delete(memoryEntryId);
  const embeddings = await embeddingsDB.getByEntry(memoryEntryId);
  await Promise.all(embeddings.map(e => embeddingsDB.delete(e.id)));
  INDEX.removeByMemoryId(memoryEntryId);
}

/**
 * Clear all RAG data
 */
export async function clearRAG(): Promise<void> {
  await memoryDB.clear();
  await embeddingsDB.clear();
  INDEX.invalidate();
}

/**
 * Get index stats
 */
export async function getRAGStats(): Promise<{ totalEntries: number; totalVectors: number }> {
  await INDEX.load();
  const totalEntries = (await memoryDB.getAll()).length;
  return { totalEntries, totalVectors: INDEX.size };
}
