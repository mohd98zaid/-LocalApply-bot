// ============================================================
// Autofill Orchestrator — Coordinates form filling
// src/content/formEngine/filler.ts
// ============================================================

import type { FormField, FillResult, AutomationError } from '../../types/adapter';
import type { CandidateProfile } from '../../types/resume';
import { EventSimulator } from './eventSimulator';

interface AutofillOptions {
  profileId: string;
  jobId: string;
  mode: string;
  fieldsToFill: FormField[];
  profile?: CandidateProfile;
}

export class AutofillOrchestrator {

  async start(options: AutofillOptions): Promise<{ filledCount: number; failed: string[] }> {
    const { fieldsToFill, profile } = options;

    if (!profile) {
      // Request profile from background
      const profileData = await chrome.runtime.sendMessage({
        type: 'GET_PROFILE',
        payload: { profileId: options.profileId },
      });
      if (!profileData?.data) throw new Error('Profile not found');
      return this.fillFields(fieldsToFill, profileData.data as CandidateProfile);
    }

    return this.fillFields(fieldsToFill, profile);
  }

  private async fillFields(
    fields: FormField[],
    profile: CandidateProfile
  ): Promise<{ filledCount: number; failed: string[] }> {
    let filledCount = 0;
    const failed: string[] = [];

    for (const field of fields) {
      if (!field.mappedProfileField || field.mappedProfileField === 'CUSTOM_QUESTION') continue;

      const value = this.resolveProfileValue(field.mappedProfileField, profile);
      if (!value) continue;

      try {
        await this.fillSingleField(field, value);
        filledCount++;

        // Report progress
        chrome.runtime.sendMessage({
          type: 'FILL_RESULT',
          payload: { fieldId: field.id, success: true, value, method: 'typing' } satisfies FillResult,
        });

        // Human-like delay between fields
        await sleep(randomBetween(250, 700));
      } catch (e) {
        failed.push(field.label);
        chrome.runtime.sendMessage({
          type: 'FILL_RESULT',
          payload: { fieldId: field.id, success: false, error: String(e), method: 'direct' } satisfies FillResult,
        });
      }
    }

    return { filledCount, failed };
  }

  private async fillSingleField(field: FormField, value: string): Promise<FillResult> {
    // Scroll to the field first
    field.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(150);

    if (field.type === 'select') {
      return EventSimulator.selectOption(field, value);
    }

    return EventSimulator.fillField(field, value);
  }

  private resolveProfileValue(mappedField: string, profile: CandidateProfile): string {
    // Resolve dot-notation field path
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
