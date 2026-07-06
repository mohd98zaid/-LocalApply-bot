// ============================================================
// Text Chunker — splits documents into overlapping chunks for RAG
// src/rag/chunker.ts
// ============================================================

export interface TextChunk {
  id: string;
  text: string;
  startChar: number;
  endChar: number;
  chunkIndex: number;
  totalChunks: number;
  metadata: Record<string, string>;
}

export interface ChunkerOptions {
  chunkSize: number;     // target characters per chunk
  overlap: number;       // overlap between chunks in characters
  minChunkSize: number;  // skip chunks smaller than this
}

const DEFAULTS: ChunkerOptions = {
  chunkSize: 512,
  overlap: 64,
  minChunkSize: 64,
};

/**
 * Split text into overlapping chunks with paragraph-awareness.
 * Tries to break on sentence/paragraph boundaries.
 */
export function chunkText(
  text: string,
  metadata: Record<string, string> = {},
  options: Partial<ChunkerOptions> = {}
): TextChunk[] {
  const opts = { ...DEFAULTS, ...options };
  const chunks: TextChunk[] = [];

  if (text.length <= opts.chunkSize) {
    return [{
      id: crypto.randomUUID(),
      text: text.trim(),
      startChar: 0,
      endChar: text.length,
      chunkIndex: 0,
      totalChunks: 1,
      metadata,
    }];
  }

  // Split on paragraphs first
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);

  let buffer = '';
  let bufferStart = 0;
  let charPos = 0;
  const rawChunks: { text: string; start: number; end: number }[] = [];

  for (const para of paragraphs) {
    const paraWithNewline = para + '\n\n';
    const paraStart = charPos;

    if (buffer.length + paraWithNewline.length > opts.chunkSize && buffer.length > opts.minChunkSize) {
      // Flush buffer as a chunk
      rawChunks.push({ text: buffer.trim(), start: bufferStart, end: charPos });
      // Keep overlap
      const overlapText = buffer.slice(-opts.overlap);
      buffer = overlapText + paraWithNewline;
      bufferStart = charPos - overlapText.length;
    } else {
      if (buffer.length === 0) bufferStart = paraStart;
      buffer += paraWithNewline;
    }

    charPos += paraWithNewline.length;
  }

  // Flush remaining
  if (buffer.trim().length >= opts.minChunkSize) {
    rawChunks.push({ text: buffer.trim(), start: bufferStart, end: charPos });
  }

  // If text had no paragraph boundaries or single large block, use sliding window
  const needsSlidingWindow = rawChunks.length === 0 ||
    (rawChunks.length === 1 && text.length > opts.chunkSize * 1.5);

  if (needsSlidingWindow) {
    rawChunks.length = 0; // clear
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + opts.chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk.length >= opts.minChunkSize) {
        rawChunks.push({ text: chunk, start, end });
      }
      if (end === text.length) break;
      start += opts.chunkSize - opts.overlap;
    }
  }

  const total = rawChunks.length;
  return rawChunks.map((raw, idx) => ({
    id: crypto.randomUUID(),
    text: raw.text,
    startChar: raw.start,
    endChar: raw.end,
    chunkIndex: idx,
    totalChunks: total,
    metadata,
  }));
}

/**
 * Chunk a resume into meaningful segments for embedding.
 * Respects resume sections (Experience, Education, Skills, etc.)
 */
export function chunkResume(resumeText: string, resumeId: string): TextChunk[] {
  // Detect section boundaries
  const sectionPattern = /^(experience|education|skills|projects|certifications|summary|objective|awards|publications|languages|volunteer)/im;

  const sections = resumeText.split(/\n(?=\s*(?:experience|education|skills|projects|certifications|summary|objective|awards|publications|languages|volunteer)\s*[:|\n])/i);

  const allChunks: TextChunk[] = [];
  let globalOffset = 0;

  for (const section of sections) {
    if (!section.trim()) continue;

    // Detect section type
    const match = section.match(sectionPattern);
    const sectionType = match ? match[1].toLowerCase() : 'general';

    const sectionChunks = chunkText(
      section,
      { resumeId, sectionType },
      { chunkSize: 600, overlap: 80 }
    );

    // Adjust offsets
    for (const chunk of sectionChunks) {
      chunk.startChar += globalOffset;
      chunk.endChar += globalOffset;
    }

    allChunks.push(...sectionChunks);
    globalOffset += section.length;
  }

  return allChunks;
}
