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
import { HNSWIndex } from './hnsw';

// ponytail: Map from memoryEntryId to embeddingId for removal
const entryToEmbedding = new Map<string, string>();

class VectorIndex {
  private hnsw = new HNSWIndex(16, 100);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const embeddings = await embeddingsDB.getAll();
    for (const e of embeddings) {
      if (!e.vector || e.vector.length === 0) continue;
      this.hnsw.add(e.memoryEntryId, e.vector);
      entryToEmbedding.set(e.memoryEntryId, e.id);
    }
    this.loaded = true;
  }

  async addVector(embedding: EmbeddingRecord): Promise<void> {
    if (!embedding.vector || embedding.vector.length === 0) return;
    this.hnsw.add(embedding.memoryEntryId, embedding.vector);
    entryToEmbedding.set(embedding.memoryEntryId, embedding.id);
  }

  removeByMemoryId(memoryEntryId: string): void {
    this.hnsw.remove(memoryEntryId);
    entryToEmbedding.delete(memoryEntryId);
  }

  search(queryVector: number[], topK: number, minSimilarity = 0.0): { memoryEntryId: string; similarity: number }[] {
    // ponytail: ef = max(topK * 3, 50) gives HNSW enough candidates for accurate top-K
    const ef = Math.max(topK * 3, 50);
    const raw = this.hnsw.search(queryVector, topK * 2, ef);

    const seen = new Set<string>();
    const deduped: { memoryEntryId: string; similarity: number }[] = [];
    for (const r of raw) {
      if (r.similarity < minSimilarity) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      deduped.push({ memoryEntryId: r.id, similarity: r.similarity });
      if (deduped.length >= topK) break;
    }

    return deduped;
  }

  get size(): number { return this.hnsw.size; }

  invalidate(): void {
    this.loaded = false;
    this.hnsw.clear();
    entryToEmbedding.clear();
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
