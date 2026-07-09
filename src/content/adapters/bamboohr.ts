// ============================================================
// BambooHR Adapter
// src/content/adapters/bamboohr.ts
// ============================================================

import { BaseATSAdapter } from './base';
import type { ATSDetectionResult, FormField } from '../../types/adapter';
import type { ParsedJobDescription } from '../../types/job';
import type { ApplicationQuestion } from '../../types/ai';

export class BambooHRAdapter extends BaseATSAdapter {
  readonly name = 'bamboohr' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['bamboohr.com'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isBambooHR = url.includes('bamboohr.com');

    // BambooHR application form detection
    const hasForm = !!doc.querySelector('form');
    const hasCareerPage = url.includes('/careers/') || url.includes('/job/');
    const hasApplyForm = !!(
      doc.querySelector('[data-field="firstName"]') ||
      doc.querySelector('input[name*="firstName"]') ||
      doc.querySelector('label')
    );

    let pageType: ATSDetectionResult['pageType'] = 'unknown';
    if (hasApplyForm && hasForm) {
      pageType = 'application_form';
    } else if (hasCareerPage) {
      pageType = 'job_listing';
    }

    return {
      detected: isBambooHR,
      atsName: 'bamboohr',
      confidence: isBambooHR ? 0.95 : 0,
      pageType,
      metadata: { url },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, [
      'h1',
      '.BambooHR-ATS__jobTitle',
      '[class*="job-title"]',
    ]);

    const company = this.extractText(doc, [
      '.BambooHR-ATS__companyName',
      '[class*="company-name"]',
      'header img',
    ]) || doc.title.split('|')[0]?.trim() || '';

    const location = this.extractText(doc, [
      '.BambooHR-ATS__jobLocation',
      '[class*="location"]',
    ]);

    const rawDescription = this.extractText(doc, [
      '.BambooHR-ATS__jobDescription',
      '[class*="job-description"]',
      '.job Posting__description',
      'main',
    ]);

    return {
      title,
      company: { name: company },
      location,
      type: 'full_time',
      remote: rawDescription.toLowerCase().includes('remote') ? 'remote' : 'onsite',
      rawDescription,
      requirements: { required: [], preferred: [] },
      responsibilities: [],
      skills: [],
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const fields: FormField[] = [];

    // BambooHR uses standard form elements with labels
    const inputs = doc.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), select, textarea'
    );

    for (const input of inputs) {
      const field = this.buildFormField(input);
      if (field) {
        field.mappedProfileField = this.mapBambooHRField(field);
        fields.push(field);
      }
    }

    // File upload fields (resume, cover letter)
    const fileInputs = doc.querySelectorAll<HTMLInputElement>('input[type="file"]');
    for (const fileInput of fileInputs) {
      const field = this.buildFormField(fileInput);
      if (field) {
        field.type = 'file';
        const label = field.label.toLowerCase();
        if (/resume|cv/.test(label)) {
          field.mappedProfileField = 'RESUME_UPLOAD';
        } else if (/cover/.test(label)) {
          field.mappedProfileField = 'COVER_LETTER';
        }
        fields.push(field);
      }
    }

    return fields;
  }

  async detectQuestions(doc: Document): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    // BambooHR screening questions
    const questionLabels = doc.querySelectorAll('label, legend, [class*="question"]');

    for (const labelEl of questionLabels) {
      const text = (labelEl as HTMLElement).innerText?.trim().replace('*', '').trim();
      if (!text || text.length < 5) continue;

      // Find associated input
      const inputEl = (labelEl as HTMLElement).closest('.form-field, [class*="field"]')
        ?.querySelector('input, select, textarea');

      if (!inputEl) continue;

      const type = this.getQuestionType(inputEl as HTMLElement);

      questions.push({
        id: `bhrq-${crypto.randomUUID()}`,
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

  private mapBambooHRField(field: FormField): string {
    const label = field.label.toLowerCase();
    const name = ((field.element as HTMLInputElement)?.name ?? '').toLowerCase();
    const id = ((field.element as HTMLInputElement)?.id ?? '').toLowerCase();

    // Combine all identifiers for matching
    const identifiers = `${label} ${name} ${id}`;

    // Personal info
    if (/first.?name/.test(identifiers)) return 'contact.firstName';
    if (/last.?name|surname/.test(identifiers)) return 'contact.lastName';
    if (/email/.test(identifiers)) return 'contact.email';
    if (/phone|mobile|cell/.test(identifiers)) return 'contact.phone';

    // Location
    if (/address|street/.test(identifiers)) return 'contact.location.street';
    if (/city/.test(identifiers)) return 'contact.location.city';
    if (/state|province/.test(identifiers)) return 'contact.location.state';
    if (/zip|postal/.test(identifiers)) return 'contact.location.zipCode';
    if (/country/.test(identifiers)) return 'contact.location.country';

    // Professional
    if (/linkedin/.test(identifiers)) return 'contact.linkedin';
    if (/github/.test(identifiers)) return 'contact.github';
    if (/website|portfolio/.test(identifiers)) return 'contact.portfolio';

    // Work preferences
    if (/salary|compensation/.test(identifiers)) return 'workPreferences.salaryExpectation';
    if (/notice.?period|available|start/.test(identifiers)) return 'workPreferences.noticePeriod';
    if (/visa|sponsorship|authorized/.test(identifiers)) return 'workPreferences.workAuthorization';

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
