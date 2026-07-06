// ============================================================
// PDF.js Resume Parser
// src/offscreen/pdfParser.ts
// Uses pdfjs-dist to extract text from PDF resumes
// ============================================================

import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Configure PDF.js worker
// In a Chrome Extension, we use the bundled fake worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface ParsedText {
  text: string;
  pages: number;
  fileName: string;
}

export async function parseResumeWithPdfjs(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ParsedText> {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const pages = pdf.numPages;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Reconstruct text with layout awareness
    const items = content.items as TextItem[];
    let pageText = '';
    let lastY: number | null = null;

    for (const item of items) {
      if (!item.str?.trim()) continue;

      const y = item.transform[5]; // Y position
      // New line when Y changes significantly
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      }

      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      lastY = y;
    }

    pageTexts.push(pageText.trim());
  }

  return {
    text: pageTexts.join('\n\n--- PAGE BREAK ---\n\n'),
    pages,
    fileName,
  };
}
