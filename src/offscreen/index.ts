// ============================================================
// Offscreen Document — Resume parsing in a sandboxed context
// src/offscreen/index.ts
// Chrome's Offscreen API allows DOM access in a background document
// ============================================================

import { parseResumeWithPdfjs } from './pdfParser';
import { parseResumeWithMammoth } from './docxParser';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'PARSE_RESUME_FILE') {
    return false;
  }
  handleOffscreenMessage(message)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(err => sendResponse({ success: false, error: String(err) }));
  return true; // async
});

// ponytail: 30s timeout prevents corrupted files from hanging the offscreen document
const PARSE_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function handleOffscreenMessage(message: {
  type: string;
  payload: { data: number[]; type: string; fileName: string };
}) {
  const { type, payload } = message;

  if (type === 'PARSE_RESUME_FILE') {
    const { data, type: mimeType, fileName } = payload;
    const buffer = new Uint8Array(data).buffer;

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return withTimeout(parseResumeWithPdfjs(buffer, fileName), PARSE_TIMEOUT_MS, 'PDF parse');
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      return withTimeout(parseResumeWithMammoth(buffer, fileName), PARSE_TIMEOUT_MS, 'DOCX parse');
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  throw new Error(`Unknown offscreen message type: ${type}`);
}
