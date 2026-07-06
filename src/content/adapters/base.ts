// ============================================================
// Base ATS Adapter — Abstract class with shared utilities
// src/content/adapters/base.ts
// ============================================================

import type {
  ATSAdapter, ATSDetectionResult, ATSName, FormField, FieldType,
  ApplicationStep, FillResult, UploadResult, NavigationResult,
  FormError, SubmissionResult, RecoveryAction, AutomationError
} from '../../types/adapter';
import type { ParsedJobDescription } from '../../types/job';
import type { ApplicationQuestion, QuestionCategory } from '../../types/ai';
import { EventSimulator } from '../formEngine/eventSimulator';

export abstract class BaseATSAdapter implements ATSAdapter {
  abstract readonly name: ATSName;
  abstract readonly version: string;
  abstract readonly supportedDomains: string[];

  abstract detect(document: Document): Promise<ATSDetectionResult>;

  // ---- Default implementations (can be overridden) ----

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, [
      'h1', '[data-job-title]', '.job-title', '.posting-headline h2', '.jobs-unified-top-card__job-title'
    ]);

    const company = this.extractText(doc, [
      '[data-company-name]', '.company-name', '.topcard__org-name-link', '.jobs-unified-top-card__company-name'
    ]);

    const location = this.extractText(doc, [
      '[data-job-location]', '.job-location', '.jobs-unified-top-card__bullet'
    ]);

    const rawDescription = this.extractText(doc, [
      '.job-description', '.description__text', '.jobs-description', '[data-job-description]',
      '.posting-requirements', '#job-details', '.job-details-jobs-unified-top-card'
    ]);

    return {
      title: title || doc.title,
      company: { name: company || 'Unknown Company' },
      location: location || '',
      type: 'full_time',
      remote: 'onsite',
      rawDescription: rawDescription || doc.body.innerText.slice(0, 5000),
      requirements: { required: [], preferred: [] },
      responsibilities: [],
      skills: [],
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const fields: FormField[] = [];
    const inputs = doc.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
    );

    for (const input of inputs) {
      const field = this.buildFormField(input);
      if (field) fields.push(field);
    }

    return fields;
  }

  async detectQuestions(doc: Document): Promise<ApplicationQuestion[]> {
    // Base implementation — override in specific adapters
    const textareas = doc.querySelectorAll('textarea');
    const questions: ApplicationQuestion[] = [];

    for (const textarea of textareas) {
      const label = this.getLabelForElement(textarea);
      if (!label) continue;

      questions.push({
        id: `q-${crypto.randomUUID()}`,
        text: label,
        type: 'free_text',
        category: this.classifyQuestion(label),
        required: textarea.required,
        maxLength: textarea.maxLength > 0 ? textarea.maxLength : undefined,
        element: textarea,
        elementSelector: this.generateSelector(textarea),
      });
    }

    return questions;
  }

  async fillField(field: FormField, value: string): Promise<FillResult> {
    return EventSimulator.fillField(field, value);
  }

  async uploadFile(field: FormField, file: File): Promise<UploadResult> {
    return EventSimulator.uploadFile(field, file);
  }

  async selectOption(field: FormField, value: string): Promise<FillResult> {
    return EventSimulator.selectOption(field, value);
  }

  async detectCurrentStep(doc: Document): Promise<ApplicationStep> {
    // Look for progress indicators
    const progressText = this.extractText(doc, [
      '.progress-text', '[data-step]', '.step-indicator', '.progress-bar-title'
    ]);

    const match = progressText?.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
    const current = match ? parseInt(match[1]) - 1 : 0;
    const total = match ? parseInt(match[2]) : undefined;

    return {
      index: current,
      total,
      title: progressText || undefined,
      isFirst: current === 0,
      isLast: total !== undefined ? current === total - 1 : false,
      hasErrors: (await this.detectErrors(doc)).some(e => e.severity === 'error'),
    };
  }

  async navigateToNextStep(doc: Document): Promise<NavigationResult> {
    const nextButton = doc.querySelector<HTMLButtonElement>(
      '[data-next], .next-button, button[type="submit"]:not([disabled]), input[type="submit"]'
    );

    if (!nextButton) {
      return { success: false, errors: ['Next button not found'] };
    }

    const beforeUrl = window.location.href;
    nextButton.click();

    // Wait for page change
    await new Promise(resolve => setTimeout(resolve, 1500));

    return { success: true };
  }

  async detectErrors(doc: Document): Promise<FormError[]> {
    const errors: FormError[] = [];

    const errorElements = doc.querySelectorAll(
      '.error, .field-error, [aria-invalid="true"], .has-error .help-block, .error-message, [data-error]'
    );

    for (const el of errorElements) {
      const text = (el as HTMLElement).innerText.trim();
      if (!text) continue;

      const nearInput = el.closest('[class*="field"], [class*="form-group"]')
        ?.querySelector('input, select, textarea');

      errors.push({
        message: text,
        severity: 'error',
        fieldId: nearInput?.id,
        autoFixable: false,
      });
    }

    return errors;
  }

  async detectSuccess(doc: Document): Promise<SubmissionResult | null> {
    const successIndicators = [
      '.application-submitted', '.success-message', '[data-success]',
      '.confirmation-page', '.thank-you-message'
    ];

    for (const selector of successIndicators) {
      const el = doc.querySelector(selector);
      if (el) {
        return {
          success: true,
          confirmationMessage: (el as HTMLElement).innerText.trim(),
        };
      }
    }

    // Check URL for confirmation patterns
    const url = window.location.href;
    if (url.includes('confirmation') || url.includes('success') || url.includes('submitted')) {
      return { success: true };
    }

    return null;
  }

  async handleError(error: AutomationError): Promise<RecoveryAction> {
    if (error.recoverable) {
      return 'retry';
    }
    if (error.code === 'FIELD_NOT_FOUND') {
      return 'skip_field';
    }
    if (error.code === 'CAPTCHA_DETECTED') {
      return 'pause_for_user';
    }
    return 'pause_for_user';
  }

  // ---- Shared Utilities ----

  protected buildFormField(element: HTMLElement): FormField | null {
    const input = element as HTMLInputElement;
    const label = this.getLabelForElement(element);
    const type = this.mapInputType(input.type ?? element.tagName.toLowerCase());

    if (!label && type !== 'file') return null;

    return {
      id: `field-${element.id || crypto.randomUUID()}`,
      element,
      elementSelector: this.generateSelector(element),
      type,
      label: label ?? '',
      placeholder: input.placeholder,
      required: input.required,
      disabled: input.disabled,
      maxLength: input.maxLength > 0 ? input.maxLength : undefined,
      options: this.getOptions(element),
      confidence: 0,
    };
  }

  protected getLabelForElement(element: HTMLElement): string | null {
    // Try aria-label
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }

    // Try aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.innerText.trim();
    }

    // Try <label for="...">
    const id = element.id;
    if (id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      if (label) return label.innerText.trim().replace('*', '').trim();
    }

    // Try closest label ancestor
    const parent = element.closest('label');
    if (parent) {
      const clone = parent.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
      return clone.innerText.trim();
    }

    // Try previous sibling label
    const prev = element.previousElementSibling;
    if (prev?.tagName === 'LABEL') {
      return (prev as HTMLElement).innerText.trim();
    }

    // Try parent's label-like child
    const parentLabel = element.parentElement?.querySelector('label, [class*="label"]');
    if (parentLabel) {
      return (parentLabel as HTMLElement).innerText.trim().replace('*', '').trim();
    }

    return element.getAttribute('placeholder') ?? null;
  }

  protected getOptions(element: HTMLElement): string[] | undefined {
    if (element.tagName === 'SELECT') {
      return Array.from((element as HTMLSelectElement).options).map(o => o.text.trim());
    }

    // Radio/checkbox group
    const name = (element as HTMLInputElement).name;
    if (name && ['radio', 'checkbox'].includes((element as HTMLInputElement).type)) {
      const group = document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
      return Array.from(group).map(r => {
        const label = this.getLabelForElement(r);
        return label ?? r.value;
      });
    }

    return undefined;
  }

  protected mapInputType(type: string): FieldType {
    const map: Record<string, FieldType> = {
      text: 'text', email: 'email', tel: 'phone', phone: 'phone',
      number: 'number', url: 'url', date: 'date',
      textarea: 'textarea', select: 'select', 'select-one': 'select',
      radio: 'radio', checkbox: 'checkbox', file: 'file',
    };
    return map[type.toLowerCase()] ?? 'text';
  }

  protected generateSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;

    const name = (element as HTMLInputElement).name;
    if (name) return `[name="${name}"]`;

    // Build path selector
    const path: string[] = [];
    let el: HTMLElement | null = element;
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className) {
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        if (classes) selector += `.${classes}`;
      }
      path.unshift(selector);
      el = el.parentElement;
    }

    return path.join(' > ');
  }

  protected extractText(doc: Document, selectors: string[]): string {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text) return text;
      }
    }
    return '';
  }

  protected classifyQuestion(text: string): QuestionCategory {
    const lower = text.toLowerCase();

    if (/salary|compensation|pay|rate|wage|earn/.test(lower)) return 'salary';
    if (/visa|sponsorship|work.?authoriz|citizen|authorize|eligible|permit/.test(lower)) return 'visa';
    if (/relocat/.test(lower)) return 'relocation';
    if (/notice|available|start.?date|when.?can.?you.?start/.test(lower)) return 'availability';
    if (/education|degree|gpa|graduate|university|school/.test(lower)) return 'education';
    if (/certif|licens/.test(lower)) return 'certifications';
    if (/year.?of.?exp|experience|background/.test(lower)) return 'experience';
    if (/tell.?us|describe|explain|why|motivat|passion|strength|weakness|challeng/.test(lower)) return 'behavioral';
    if (/technical|coding|programming|algorithm|system.?design/.test(lower)) return 'technical';

    return 'custom';
  }
}
