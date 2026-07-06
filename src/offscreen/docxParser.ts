// ============================================================
// mammoth.js DOCX Parser
// src/offscreen/docxParser.ts
// Converts DOCX resumes to clean text for AI processing
// ============================================================

import mammoth from 'mammoth';
import type { ParsedText } from './pdfParser';

export async function parseResumeWithMammoth(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ParsedText> {
  // Extract raw text (preserving structure better than HTML conversion for resumes)
  const result = await mammoth.extractRawText({ arrayBuffer });

  if (result.messages.some(m => m.type === 'error')) {
    console.warn('[LocalApply DOCX] Parsing warnings:', result.messages);
  }

  const text = result.value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive blank lines
    .trim();

  // Count approximate "pages" (every ~3000 chars ≈ 1 page)
  const pages = Math.max(1, Math.ceil(text.length / 3000));

  return { text, pages, fileName };
}
