// ============================================================
// IndexedDB Storage Layer (typed, migration-safe)
// src/storage/indexedDB.ts
// ============================================================

import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from 'idb';
import type { CandidateProfile, ParsedResume, TailoredResume } from '../types/resume';
import type { Job, Application, CoverLetter } from '../types/job';
import type { MemoryEntry, EmbeddingRecord } from '../types/ai';

const DB_NAME = 'localapply-db';
const DB_VERSION = 1;

// Full IDB schema
interface LocalApplyDB extends DBSchema {
  profiles: {
    key: string;
    value: CandidateProfile;
    indexes: { 'by-updatedAt': string };
  };
  resumes: {
    key: string;
    value: ParsedResume;
    indexes: { 'by-profileId': string; 'by-updatedAt': string };
  };
  jobs: {
    key: string;
    value: Job;
    indexes: { 'by-source': string; 'by-savedAt': string; 'by-scrapedAt': string };
  };
  applications: {
    key: string;
    value: Application;
    indexes: { 'by-jobId': string; 'by-status': string; 'by-createdAt': string };
  };
  coverLetters: {
    key: string;
    value: CoverLetter;
    indexes: { 'by-jobId': string };
  };
  tailoredResumes: {
    key: string;
    value: TailoredResume;
    indexes: { 'by-jobId': string; 'by-baseResumeId': string };
  };
  memoryEntries: {
    key: string;
    value: MemoryEntry;
    indexes: { 'by-type': string; 'by-createdAt': string; 'by-jobId': string };
  };
  embeddings: {
    key: string;
    value: EmbeddingRecord;
    indexes: { 'by-memoryEntryId': string; 'by-model': string };
  };
}

type StoreName = StoreNames<LocalApplyDB>;

let dbInstance: IDBPDatabase<LocalApplyDB> | null = null;

async function getDB(): Promise<IDBPDatabase<LocalApplyDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LocalApplyDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ---- V1 Migration ----
      if (oldVersion < 1) {
        // Profiles
        const profileStore = db.createObjectStore('profiles', { keyPath: 'id' });
        profileStore.createIndex('by-updatedAt', 'updatedAt');

        // Resumes
        const resumeStore = db.createObjectStore('resumes', { keyPath: 'id' });
        resumeStore.createIndex('by-updatedAt', 'updatedAt');

        // Jobs
        const jobStore = db.createObjectStore('jobs', { keyPath: 'id' });
        jobStore.createIndex('by-source', 'source');
        jobStore.createIndex('by-savedAt', 'savedAt');
        jobStore.createIndex('by-scrapedAt', 'scrapedAt');

        // Applications
        const appStore = db.createObjectStore('applications', { keyPath: 'id' });
        appStore.createIndex('by-jobId', 'jobId');
        appStore.createIndex('by-status', 'status');
        appStore.createIndex('by-createdAt', 'createdAt');

        // Cover Letters
        const clStore = db.createObjectStore('coverLetters', { keyPath: 'id' });
        clStore.createIndex('by-jobId', 'jobId');

        // Tailored Resumes
        const trStore = db.createObjectStore('tailoredResumes', { keyPath: 'id' });
        trStore.createIndex('by-jobId', 'jobId');
        trStore.createIndex('by-baseResumeId', 'baseResumeId');

        // Memory Entries (RAG)
        const memStore = db.createObjectStore('memoryEntries', { keyPath: 'id' });
        memStore.createIndex('by-type', 'type');
        memStore.createIndex('by-createdAt', 'metadata.createdAt');
        memStore.createIndex('by-jobId', 'metadata.jobId');

        // Embeddings (RAG vectors)
        const embStore = db.createObjectStore('embeddings', { keyPath: 'id' });
        embStore.createIndex('by-memoryEntryId', 'memoryEntryId');
        embStore.createIndex('by-model', 'model');
      }
    },
    blocked() {
      console.warn('[LocalApply] DB upgrade blocked by another tab');
    },
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ---- Generic CRUD ----

export async function dbGet<T extends StoreName>(
  store: T,
  id: string
): Promise<LocalApplyDB[T]['value'] | undefined> {
  const db = await getDB();
  return db.get(store, id);
}

export async function dbGetAll<T extends StoreName>(
  store: T
): Promise<LocalApplyDB[T]['value'][]> {
  const db = await getDB();
  return db.getAll(store);
}

export async function dbGetByIndex<T extends StoreName>(
  store: T,
  indexName: string,
  value: IDBValidKey
): Promise<LocalApplyDB[T]['value'][]> {
  const db = await getDB();
  // @ts-expect-error dynamic index access
  return db.getAllFromIndex(store, indexName, value);
}

export async function dbPut<T extends StoreName>(
  store: T,
  value: LocalApplyDB[T]['value']
): Promise<string> {
  const db = await getDB();
  return db.put(store, value) as Promise<string>;
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, id);
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await getDB();
  await db.clear(store);
}

export async function dbCount(store: StoreName): Promise<number> {
  const db = await getDB();
  return db.count(store);
}

// ---- Typed convenience methods ----

export const profilesDB = {
  get: (id: string) => dbGet('profiles', id),
  getAll: () => dbGetAll('profiles'),
  save: (profile: CandidateProfile) => dbPut('profiles', profile),
  delete: (id: string) => dbDelete('profiles', id),
};

export const resumesDB = {
  get: (id: string) => dbGet('resumes', id),
  getAll: () => dbGetAll('resumes'),
  save: (resume: ParsedResume) => dbPut('resumes', resume),
  delete: (id: string) => dbDelete('resumes', id),
};

export const jobsDB = {
  get: (id: string) => dbGet('jobs', id),
  getAll: () => dbGetAll('jobs'),
  getSaved: () => dbGetAll('jobs').then(jobs => jobs.filter(j => j.saved)),
  save: (job: Job) => dbPut('jobs', job),
  delete: (id: string) => dbDelete('jobs', id),
};

export const applicationsDB = {
  get: (id: string) => dbGet('applications', id),
  getAll: () => dbGetAll('applications'),
  getByJob: (jobId: string) => dbGetByIndex('applications', 'by-jobId', jobId),
  getByStatus: (status: string) => dbGetByIndex('applications', 'by-status', status),
  save: (app: Application) => dbPut('applications', app),
  delete: (id: string) => dbDelete('applications', id),
};

export const coverLettersDB = {
  get: (id: string) => dbGet('coverLetters', id),
  getByJob: (jobId: string) => dbGetByIndex('coverLetters', 'by-jobId', jobId),
  save: (cl: CoverLetter) => dbPut('coverLetters', cl),
  delete: (id: string) => dbDelete('coverLetters', id),
};

export const memoryDB = {
  get: (id: string) => dbGet('memoryEntries', id),
  getAll: () => dbGetAll('memoryEntries'),
  getByType: (type: string) => dbGetByIndex('memoryEntries', 'by-type', type),
  save: (entry: MemoryEntry) => dbPut('memoryEntries', entry),
  delete: (id: string) => dbDelete('memoryEntries', id),
  clear: () => dbClear('memoryEntries'),
};

export const embeddingsDB = {
  get: (id: string) => dbGet('embeddings', id),
  getAll: () => dbGetAll('embeddings'),
  getByEntry: (entryId: string) => dbGetByIndex('embeddings', 'by-memoryEntryId', entryId),
  save: (emb: EmbeddingRecord) => dbPut('embeddings', emb),
  delete: (id: string) => dbDelete('embeddings', id),
  clear: () => dbClear('embeddings'),
};

// ---- Data export for privacy ----
export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const db = await getDB();
  const storeNames = db.objectStoreNames;
  const result: Record<string, unknown[]> = {};

  for (const storeName of storeNames) {
    result[storeName] = await db.getAll(storeName as StoreName);
  }

  return result;
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const storeNames = Array.from(db.objectStoreNames) as StoreName[];
  await Promise.all(storeNames.map(name => db.clear(name)));
}
