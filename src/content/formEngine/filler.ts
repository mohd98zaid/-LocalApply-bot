// ============================================================
// Autofill Orchestrator — Coordinates form filling
// Uploads resume, generates cover letter, fills fields with AI
// src/content/formEngine/filler.ts
// ============================================================

import type { FormField, FillResult } from '../../types/adapter';
import type { CandidateProfile } from '../../types/resume';
import { EventSimulator } from './eventSimulator';
import { sleep, randomBetween } from '../../utils/shared';

interface AutofillOptions {
  profileId: string;
  jobId: string;
  mode: string;
  fieldsToFill: FormField[];
  profile?: CandidateProfile;
  jobTitle?: string;
  companyName?: string;
}

export class AutofillOrchestrator {

  async start(options: AutofillOptions): Promise<{ filledCount: number; failed: string[] }> {
    const { fieldsToFill, profile } = options;

    const resolvedFields = this.resolveElements(fieldsToFill);

    let resolvedProfile = profile;

    if (!resolvedProfile) {
      let profileData = null;
      try {
        profileData = await chrome.runtime.sendMessage({
          type: 'GET_PROFILE',
          payload: { profileId: options.profileId },
        });
      } catch (e) {
        console.warn('[AutofillOrchestrator] Failed to fetch profile:', e);
      }
      if (!profileData?.success || !profileData?.data) throw new Error('Profile not found');
      resolvedProfile = profileData.data as CandidateProfile;
    }

    const jobTitle = options.jobTitle ?? document.querySelector('h1')?.textContent?.trim() ?? '';
    const companyName = options.companyName
      ?? document.title.split(/\s*[|–—-]\s*/)[0]?.trim()
      ?? document.title.split(/\s*\|/)[0]?.trim()
      ?? '';

    // Step 1: Upload resume to file inputs
    await this.uploadResumeToFields(resolvedFields, options.profileId);

    // Step 2: Generate and fill cover letter fields
    await this.fillCoverLetterFields(resolvedFields, options.profileId, jobTitle, companyName);

    // Step 3: Fill all other fields (profile + AI)
    return this.fillFields(resolvedFields, resolvedProfile, options.profileId, jobTitle, companyName);
  }

  private resolveElements(fields: FormField[]): FormField[] {
    return fields.map(field => {
      if (field.element) return field;
      const selector = field.elementSelector;
      if (!selector) return field;
      try {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) return { ...field, element };
      } catch { /* Invalid selector */ }
      return field;
    });
  }

  // ---- Resume Upload ----

  private async uploadResumeToFields(fields: FormField[], profileId: string): Promise<void> {
    const fileFields = fields.filter(f => f.type === 'file');
    if (fileFields.length === 0) return;

    // Get resume file from background
    let fileData: number[] | null = null;
    let mimeType = 'application/pdf';
    let fileName = 'resume.pdf';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RESUME_FILE',
        payload: { profileId },
      });
      if (response?.success && response.data) {
        fileData = response.data.fileData;
        mimeType = response.data.mimeType;
        fileName = response.data.fileName;
      }
    } catch (e) {
      console.warn('[AutofillOrchestrator] Failed to get resume file:', e);
    }

    if (!fileData) {
      console.warn('[AutofillOrchestrator] No resume file stored — re-upload your resume');
      return;
    }

    const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    for (const field of fileFields) {
      try {
        const result = await EventSimulator.uploadFile(field, file);
        if (result.success) {
          console.log(`[AutofillOrchestrator] Uploaded ${fileName} to ${field.label}`);
        }
      } catch (e) {
        console.warn(`[AutofillOrchestrator] Upload failed for ${field.label}:`, e);
      }
      await sleep(500);
    }
  }

  // ---- Cover Letter ----

  private async fillCoverLetterFields(
    fields: FormField[], profileId: string, jobTitle: string, companyName: string
  ): Promise<void> {
    // Find cover letter related fields
    const coverFields = fields.filter(f => {
      const label = f.label.toLowerCase();
      return (
        label.includes('cover letter') ||
        label.includes('coverletter') ||
        label.includes('cover_letter') ||
        (f.type === 'file' && (label.includes('cover') || label.includes('letter')))
      );
    });

    if (coverFields.length === 0) return;

    console.log(`[AutofillOrchestrator] Generating cover letter for ${companyName}...`);

    // Generate cover letter via AI
    let coverLetter = '';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COVER_LETTER_TEXT',
        payload: { profileId, jobTitle, companyName, tone: 'professional' },
      });
      if (response?.success && response.data?.coverLetter) {
        coverLetter = response.data.coverLetter;
      }
    } catch (e) {
      console.warn('[AutofillOrchestrator] Cover letter generation failed:', e);
    }

    if (!coverLetter) return;

    for (const field of coverFields) {
      try {
        if (field.type === 'file') {
          // Create a text file from the cover letter
          const blob = new Blob([coverLetter], { type: 'text/plain' });
          const file = new File([blob], 'cover-letter.txt', { type: 'text/plain' });
          await EventSimulator.uploadFile(field, file);
        } else {
          // Fill textarea/input with cover letter text
          await EventSimulator.fillField(field, coverLetter);
        }
        console.log(`[AutofillOrchestrator] Filled cover letter field: ${field.label}`);
      } catch (e) {
        console.warn(`[AutofillOrchestrator] Cover letter fill failed for ${field.label}:`, e);
      }
      await sleep(500);
    }
  }

  // ---- Main Field Filling ----

  private async fillFields(
    fields: FormField[],
    profile: CandidateProfile,
    profileId: string,
    jobTitle: string,
    companyName: string
  ): Promise<{ filledCount: number; failed: string[] }> {
    let filledCount = 0;
    const failed: string[] = [];
    const filledData: { label: string; value: string; mappedField: string }[] = [];

    for (const field of fields) {
      // Skip file inputs (already handled), disabled fields, and cover letter fields (already handled)
      if (field.type === 'file' || field.disabled) continue;
      const labelLower = field.label.toLowerCase();
      if (labelLower.includes('cover letter') || labelLower.includes('coverletter')) continue;

      let value = '';

      // Strategy 1: Use mapped profile field (rule-based)
      if (field.mappedProfileField && field.mappedProfileField !== 'CUSTOM_QUESTION') {
        value = this.resolveProfileValue(field.mappedProfileField, profile);
      }

      // Strategy 2: If no profile value, use AI
      if (!value && field.label) {
        value = await this.aiFillField(field, profileId, jobTitle, companyName);
      }

      // ponytail: Check explicit emptiness, not truthiness — "0" and "false" are valid values
      if (value === undefined || value === null || value === '') continue;

      try {
        await this.fillSingleField(field, value);
        filledCount++;
        filledData.push({ label: field.label, value, mappedField: field.mappedProfileField ?? 'ai_generated' });

        try {
          chrome.runtime.sendMessage({
            type: 'FILL_RESULT',
            payload: { fieldId: field.id, success: true, value, method: 'typing' } satisfies FillResult,
          }).catch(() => {});
        } catch (e) {}

        await sleep(randomBetween(300, 800));
      } catch (e) {
        failed.push(field.label);
        try {
          chrome.runtime.sendMessage({
            type: 'FILL_RESULT',
            payload: { fieldId: field.id, success: false, error: String(e), method: 'direct' } satisfies FillResult,
          }).catch(() => {});
        } catch(e) {}
      }
    }

    if (filledData.length > 0) {
      try {
        chrome.runtime.sendMessage({
          type: 'SAVE_FILL_TO_RAG',
          payload: { filledData, url: window.location.href },
        }).catch(() => {});
      } catch (e) {}
    }

    try {
      chrome.runtime.sendMessage({
        type: 'AUTOFILL_COMPLETE',
        payload: { filledCount, failed, jobId: 'current' },
      }).catch(() => {});
    } catch (e) {}

    return { filledCount, failed };
  }

  private async aiFillField(
    field: FormField, profileId: string, jobTitle: string, companyName: string
  ): Promise<string> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_FILL_FIELD',
        payload: {
          label: field.label,
          fieldType: field.type,
          options: field.options,
          jobTitle,
          companyName,
          profileId,
        },
      });
      if (response?.success && response.data?.value) {
        return response.data.value;
      }
    } catch (e) {
      console.warn('[AutofillOrchestrator] AI fill failed for', field.label, e);
    }
    return '';
  }

  private async fillSingleField(field: FormField, value: string): Promise<FillResult> {
    const element = field.element ?? document.querySelector<HTMLElement>(field.elementSelector ?? '');
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(150);

    if (field.type === 'select') {
      return EventSimulator.selectOption(field, value);
    }

    return EventSimulator.fillField(field, value);
  }

  private resolveProfileValue(mappedField: string, profile: CandidateProfile): string {
    const value = mappedField.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, profile as unknown);

    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;

    return '';
  }
}
