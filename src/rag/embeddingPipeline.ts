// ============================================================
// Embedding Pipeline — coordinates chunking + Ollama embeddings + storage
// src/rag/embeddingPipeline.ts
// ============================================================

import { getSettings } from '../storage/chromeStorage';
import { getOllamaClient } from '../ai/ollama/client';
import { chunkText, chunkResume } from './chunker';
import { addMemory, searchMemory } from './vectorStore';
import type { ParsedResume } from '../types/resume';
import type { MemoryType, RAGQuery, RAGResult, AnswerContext } from '../types/ai';

// ---- Embed and Store ----

/**
 * Embed a piece of text and store it in the RAG memory.
 */
export async function embedAndStore(
  content: string,
  type: MemoryType,
  metadata: {
    source: string;
    tags?: string[];
    jobId?: string;
    applicationId?: string;
  }
): Promise<void> {
  const settings = await getSettings();
  const client = getOllamaClient(settings.ai.ollamaUrl);

  // Chunk the text
  const chunks = chunkText(content, { type, source: metadata.source });

  // Embed all chunks in batch
  const texts = chunks.map(c => c.text);

  try {
    const embeddings = await client.embed(settings.ai.embeddingModel, texts);

    // Store each chunk
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i];
      if (!embedding || embedding.length === 0) continue;

      await addMemory(
        chunks[i].text,
        type,
        {
          source: metadata.source,
          tags: [...(metadata.tags ?? []), `chunk-${i}`, type],
          jobId: metadata.jobId,
          applicationId: metadata.applicationId,
        },
        embedding,
        settings.ai.embeddingModel
      );
    }
  } catch (e) {
    console.error('[LocalApply RAG] Embedding failed:', e);
    // Fail gracefully — RAG is optional enhancement
  }
}

/**
 * Index a parsed resume into RAG memory for semantic search.
 */
export async function indexResume(resume: ParsedResume): Promise<void> {
  const settings = await getSettings();
  const client = getOllamaClient(settings.ai.ollamaUrl);

  const chunks = chunkResume(resume.rawText, resume.id);
  if (chunks.length === 0) return;

  const texts = chunks.map(c => c.text);

  try {
    const embeddings = await client.embed(settings.ai.embeddingModel, texts);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i];
      if (!embedding) continue;

      await addMemory(
        chunks[i].text,
        'resume',
        {
          source: `resume:${resume.id}`,
          tags: ['resume', chunks[i].metadata.sectionType ?? 'general', resume.id],
        },
        embedding,
        settings.ai.embeddingModel
      );
    }

    console.log(`[LocalApply RAG] Indexed ${chunks.length} chunks for resume: ${resume.name}`);
  } catch (e) {
    console.error('[LocalApply RAG] Resume indexing failed:', e);
  }
}

/**
 * Index a past application answer for reuse.
 */
export async function indexAnswer(
  question: string,
  answer: string,
  jobId?: string,
  applicationId?: string
): Promise<void> {
  const combined = `Question: ${question}\n\nAnswer: ${answer}`;
  await embedAndStore(combined, 'application_answer', {
    source: 'user_answer',
    tags: ['answer', jobId ?? ''],
    jobId,
    applicationId,
  });
}

// ---- Semantic Search ----

/**
 * Find the most relevant memories for a query.
 */
export async function semanticSearch(
  query: string,
  options: {
    topK?: number;
    types?: MemoryType[];
    minSimilarity?: number;
  } = {}
): Promise<RAGResult> {
  const settings = await getSettings();
  const client = getOllamaClient(settings.ai.ollamaUrl);

  const queryEmbedding = await client.embedSingle(settings.ai.embeddingModel, query);

  const ragQuery: RAGQuery = {
    query,
    topK: options.topK ?? 5,
    minSimilarity: options.minSimilarity ?? 0.5,
    filter: options.types ? { types: options.types } : undefined,
  };

  return searchMemory(ragQuery, queryEmbedding);
}

// ---- Context Builder ----

/**
 * Build the answer context for a job application question.
 * Searches RAG for relevant resume excerpts and past answers.
 */
export async function buildAnswerContext(
  questionText: string,
  resume: ParsedResume,
  jobDescription: { title: string; company: string; requirements: string[]; description: string },
  userPreferences: AnswerContext['userPreferences']
): Promise<AnswerContext> {
  // Search for relevant resume content
  const resumeResults = await semanticSearch(questionText, {
    topK: 3,
    types: ['resume'],
    minSimilarity: 0.4,
  });

  // Search for similar past answers
  const answerResults = await semanticSearch(questionText, {
    topK: 3,
    types: ['application_answer'],
    minSimilarity: 0.6,
  });

  // Build relevant experience summary from RAG results
  const relevantExperience = resumeResults.entries
    .map(r => r.entry.content)
    .join('\n\n')
    || resume.experience.slice(0, 2).map(e => `${e.title} at ${e.company}: ${e.bullets.slice(0, 3).join('; ')}`).join('\n');

  const relevantSkills = resume.skills
    .flatMap(s => s.skills.map(sk => sk.name))
    .slice(0, 20);

  const previousAnswers = answerResults.entries.map(r => {
    const content = r.entry.content;
    const parts = content.split('\n\nAnswer: ');
    return {
      question: parts[0]?.replace('Question: ', '') ?? '',
      answer: parts[1] ?? content,
      similarity: r.similarity,
    };
  });

  return {
    question: {
      text: questionText,
      category: 'custom',
    },
    resume: {
      summary: resume.summary,
      relevantExperience,
      relevantSkills,
    },
    jobDescription,
    previousAnswers,
    userPreferences,
  };
}
