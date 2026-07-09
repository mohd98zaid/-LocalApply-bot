// ============================================================
// Resume Parser Service — orchestrates offscreen + AI parsing
// src/background/resumeParser.ts
// ============================================================

import { getSettings } from '../storage/chromeStorage';
import { getOllamaClient } from '../ai/ollama/client';
import { RESUME_PARSER_PROMPT, interpolatePrompt } from '../ai/prompts/index';
import { resumesDB } from '../storage/indexedDB';
import type { ParsedResume } from '../types/resume';

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Parse PDF and DOCX resume files using pdf.js and mammoth.js',
    });
  }
}

export async function parseResumeFile(
  data: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<ParsedResume> {
  // Step 1: Extract raw text via Offscreen Document
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: 'PARSE_RESUME_FILE',
    payload: {
      data: Array.from(new Uint8Array(data)),
      type: mimeType,
      fileName,
    },
  }) as { success: boolean; data?: { text: string; pages: number }; error?: string };

  if (!response.success || !response.data) {
    throw new Error(response.error ?? 'Resume extraction failed');
  }

  const { text } = response.data;

  // Step 2: Use Ollama to parse the text into structured JSON
  const settings = await getSettings();
  const client = getOllamaClient(settings.ai.ollamaUrl);

  const userPrompt = interpolatePrompt(RESUME_PARSER_PROMPT.userPromptTemplate, {
    resumeText: text.slice(0, 12000), // Limit to context window
  });

  const parsed = await client.generateJSON<Omit<ParsedResume, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'rawText' | 'source' | 'fileName' | 'name'>>(
    {
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: RESUME_PARSER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: RESUME_PARSER_PROMPT.temperature,
        num_predict: RESUME_PARSER_PROMPT.maxTokens,
        num_ctx: 16384,
      },
    }
  );

  // Step 3: Build full ParsedResume object
  const now = new Date().toISOString();
  const resume: ParsedResume = {
    id: crypto.randomUUID(),
    version: 1,
    name: fileName.replace(/\.(pdf|docx)$/i, ''),
    createdAt: now,
    updatedAt: now,
    rawText: text,
    source: mimeType.includes('pdf') ? 'pdf' : 'docx',
    fileName,
    fileData: Array.from(new Uint8Array(data)), // Store original file for re-upload
    fileMimeType: mimeType,

    contact: parsed.contact ?? {
      fullName: '', firstName: '', lastName: '',
      email: '', phone: '',
      location: { city: '', state: '', country: '', zipCode: '' },
    },
    summary: parsed.summary,
    objectiveStatement: undefined,
    experience: parsed.experience ?? [],
    education: parsed.education ?? [],
    skills: parsed.skills ?? [],
    certifications: parsed.certifications ?? [],
    projects: parsed.projects ?? [],
    awards: parsed.awards ?? [],
    publications: parsed.publications ?? [],
    languages: parsed.languages ?? [],
    volunteerWork: [],
    metadata: parsed.metadata ?? {
      totalYearsExperience: 0,
      highestEducation: '',
      primaryIndustry: '',
      seniorityLevel: 'mid',
      atsScore: 0,
      lastAnalyzed: now,
      parsingConfidence: 0,
    },
  };

  resume.metadata.lastAnalyzed = now;

  // Step 4: Save to IndexedDB
  await resumesDB.save(resume);

  return resume;
}
