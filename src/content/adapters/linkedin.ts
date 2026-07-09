// ============================================================
// LinkedIn Adapter
// src/content/adapters/linkedin.ts
// ============================================================

import { BaseATSAdapter } from './base';
import type { ATSDetectionResult, FormField } from '../../types/adapter';
import type { ParsedJobDescription } from '../../types/job';
import type { ApplicationQuestion } from '../../types/ai';

export class LinkedInAdapter extends BaseATSAdapter {
  readonly name = 'linkedin' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['linkedin.com'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isLinkedIn = url.includes('linkedin.com');
    if (!isLinkedIn) return { detected: false, atsName: 'linkedin', confidence: 0, pageType: 'unknown', metadata: {} };

    // Easy Apply modal — multiple selector strategies
    const isAppForm = !!(
      doc.querySelector('.jobs-easy-apply-modal') ||
      doc.querySelector('.artdeco-modal__content') ||
      doc.querySelector('[data-test="jobs-apply-button-modal"]') ||
      doc.querySelector('div[role="dialog"] form') ||
      doc.querySelector('.jobs-easy-apply-content')
    );

    // Search results page
    const isSearchPage = url.includes('/jobs/search/') && !isAppForm;

    // Job listing
    const isJobPage = url.includes('/jobs/view/') ||
      (url.includes('/jobs/search/') && !!(
        doc.querySelector('.job-view-layout') ||
        doc.querySelector('.jobs-search__job-details--container') ||
        doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
        doc.querySelector('[data-test="job-details"]')
      ));

    return {
      detected: isLinkedIn,
      atsName: 'linkedin',
      confidence: isLinkedIn ? 0.95 : 0,
      pageType: isAppForm ? 'application_form' : isJobPage ? 'job_listing' : isSearchPage ? 'search_results' : 'unknown',
      metadata: {
        url,
      },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, [
      '.jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.t-24.t-bold',
    ]);

    const company = this.extractText(doc, [
      '.jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name a',
      '.topcard__org-name-link',
    ]);

    const location = this.extractText(doc, [
      '.jobs-unified-top-card__primary-description-container .t-black--light',
      '.job-details-jobs-unified-top-card__primary-description-without-tagline',
    ]);

    const descriptionEl = doc.querySelector(
      '.jobs-description-content__text, .jobs-box__html-content, #job-details'
    );
    const rawDescription = descriptionEl ? (descriptionEl as HTMLElement).innerText : '';

    // Detect remote
    const remoteText = (location + rawDescription).toLowerCase();
    const remote = remoteText.includes('remote') ? 'remote'
      : remoteText.includes('hybrid') ? 'hybrid'
      : 'onsite';

    return {
      title,
      company: { name: company, linkedinUrl: window.location.href },
      location,
      type: 'full_time',
      remote,
      rawDescription,
      requirements: { required: [], preferred: [] },
      responsibilities: [],
      skills: [],
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const modal = doc.querySelector(
      '.jobs-easy-apply-modal, .artdeco-modal__content, div[role="dialog"], .jobs-easy-apply-content'
    );
    const container = modal ?? doc;

    const fields: FormField[] = [];
    const inputs = container.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), select, textarea'
    );

    for (const input of inputs) {
      const field = this.buildFormField(input);
      if (field) {
        field.mappedProfileField = this.mapLinkedInField(field.label);
        fields.push(field);
      }
    }

    return fields;
  }

  async detectQuestions(doc: Document): Promise<ApplicationQuestion[]> {
    const modal = doc.querySelector('.jobs-easy-apply-modal, .artdeco-modal__content');
    if (!modal) return [];

    const questions: ApplicationQuestion[] = [];

    // LinkedIn screening questions section
    const questionBlocks = modal.querySelectorAll(
      '.jobs-easy-apply-form-section, [data-test-form-element]'
    );

    for (const block of questionBlocks) {
      const labelEl = block.querySelector('label, legend, .fb-form-element-label');
      const inputEl = block.querySelector('input, select, textarea');

      if (!labelEl || !inputEl) continue;

      const text = (labelEl as HTMLElement).innerText.trim().replace('*', '').trim();
      if (!text) continue;

      const type = this.getQuestionType(inputEl as HTMLElement);

      questions.push({
        id: `lq-${crypto.randomUUID()}`,
        text,
        type,
        category: this.classifyQuestion(text),
        required: (inputEl as HTMLInputElement).required,
        maxLength: (inputEl as HTMLInputElement).maxLength > 0
          ? (inputEl as HTMLInputElement).maxLength : undefined,
        element: inputEl as HTMLElement,
        elementSelector: this.generateSelector(inputEl as HTMLElement),
        options: type === 'multiple_choice' ? this.getOptions(inputEl as HTMLElement) : undefined,
      });
    }

    return questions;
  }

  private mapLinkedInField(label: string): string {
    const lower = label.toLowerCase();
    if (/first.?name/.test(lower)) return 'contact.firstName';
    if (/last.?name/.test(lower)) return 'contact.lastName';
    if (/email/.test(lower)) return 'contact.email';
    if (/phone|mobile/.test(lower)) return 'contact.phone';
    if (/city|location/.test(lower)) return 'contact.location.city';
    if (/linkedin/.test(lower)) return 'contact.linkedin';
    if (/website|portfolio/.test(lower)) return 'contact.portfolio';
    if (/github/.test(lower)) return 'contact.github';
    return '';
  }

  private getQuestionType(el: HTMLElement): ApplicationQuestion['type'] {
    const tag = el.tagName.toLowerCase();
    const type = (el as HTMLInputElement).type?.toLowerCase();

    if (tag === 'select') return 'multiple_choice';
    if (type === 'radio') return 'multiple_choice';
    if (type === 'checkbox') return 'yes_no';
    if (tag === 'textarea') return 'free_text';
    if (type === 'number') return 'numeric';
    if (type === 'date') return 'date';
    return 'free_text';
  }
}
