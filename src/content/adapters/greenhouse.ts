// ============================================================
// Greenhouse Adapter
// src/content/adapters/greenhouse.ts
// ============================================================

import { BaseATSAdapter } from './base';
import type { ATSDetectionResult, FormField } from '../../types/adapter';
import type { ParsedJobDescription } from '../../types/job';
import type { ApplicationQuestion } from '../../types/ai';

export class GreenhouseAdapter extends BaseATSAdapter {
  readonly name = 'greenhouse' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['greenhouse.io', 'boards.greenhouse.io'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const hasGreenhouseForm = !!doc.querySelector('#application_form, form[action*="greenhouse"]');
    const isGreenhouse = url.includes('greenhouse.io') || hasGreenhouseForm;

    return {
      detected: isGreenhouse,
      atsName: 'greenhouse',
      confidence: isGreenhouse ? 0.95 : 0,
      pageType: hasGreenhouseForm ? 'application_form' : url.includes('/jobs/') ? 'job_listing' : 'unknown',
      metadata: { url },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, ['h1.app-title', '.job-title', 'h1']);
    const company = this.extractText(doc, ['.company-name', '#header .company-name', 'h2.company']);
    const location = this.extractText(doc, ['.location', '[class*="location"]', '.job-location']);
    const rawDescription = this.extractText(doc, ['#content', '.job-description', '.content']);

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
    const form = doc.querySelector('#application_form') ?? doc;
    const fields: FormField[] = [];

    // Greenhouse uses semantic label-input pairs
    const wrappers = form.querySelectorAll('.field, [class*="input-field"], .form-field');
    for (const wrapper of wrappers) {
      const input = wrapper.querySelector<HTMLElement>('input, select, textarea');
      if (!input) continue;
      const field = this.buildFormField(input);
      if (field) {
        field.mappedProfileField = this.mapGreenhouseField(field);
        fields.push(field);
      }
    }

    // File upload fields
    const fileInputs = form.querySelectorAll<HTMLInputElement>('input[type="file"]');
    for (const fileInput of fileInputs) {
      const field = this.buildFormField(fileInput);
      if (field) {
        field.type = 'file';
        field.mappedProfileField = field.label.toLowerCase().includes('cover') ? 'COVER_LETTER' : 'RESUME_UPLOAD';
        fields.push(field);
      }
    }

    return fields;
  }

  async detectQuestions(doc: Document): Promise<ApplicationQuestion[]> {
    const form = doc.querySelector('#application_form') ?? doc;
    const questions: ApplicationQuestion[] = [];

    // Greenhouse custom questions often in a separate section
    const customSection = form.querySelectorAll('.custom-question, [class*="question"]');
    for (const section of customSection) {
      const labelEl = section.querySelector('label, legend');
      const inputEl = section.querySelector('input, select, textarea');
      if (!labelEl || !inputEl) continue;

      const text = (labelEl as HTMLElement).innerText.trim().replace('*', '').trim();
      questions.push({
        id: `ghq-${crypto.randomUUID()}`,
        text,
        type: inputEl.tagName === 'TEXTAREA' ? 'free_text' : 'multiple_choice',
        category: this.classifyQuestion(text),
        required: (inputEl as HTMLInputElement).required,
        maxLength: (inputEl as HTMLInputElement).maxLength > 0
          ? (inputEl as HTMLInputElement).maxLength : undefined,
        element: inputEl as HTMLElement,
        elementSelector: this.generateSelector(inputEl as HTMLElement),
      });
    }

    return questions;
  }

  private mapGreenhouseField(field: FormField): string {
    const label = field.label.toLowerCase();
    const name = ((field.element as HTMLInputElement)?.name ?? '').toLowerCase();

    if (/first.?name/.test(label) || name.includes('first_name')) return 'contact.firstName';
    if (/last.?name/.test(label) || name.includes('last_name')) return 'contact.lastName';
    if (/email/.test(label) || name.includes('email')) return 'contact.email';
    if (/phone/.test(label) || name.includes('phone')) return 'contact.phone';
    if (/city/.test(label)) return 'contact.location.city';
    if (/linkedin/.test(label)) return 'contact.linkedin';
    if (/github/.test(label)) return 'contact.github';
    if (/website|portfolio/.test(label)) return 'contact.portfolio';
    if (/resume|cv/.test(label) && field.type === 'file') return 'RESUME_UPLOAD';
    if (/cover.?letter/.test(label) && field.type === 'file') return 'COVER_LETTER';
    return '';
  }
}

// ============================================================
// Lever Adapter
// src/content/adapters/lever.ts
// ============================================================

export class LeverAdapter extends BaseATSAdapter {
  readonly name = 'lever' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['jobs.lever.co', 'lever.co'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isLever = url.includes('lever.co') || !!doc.querySelector('.posting-page, .application-page');

    return {
      detected: isLever,
      atsName: 'lever',
      confidence: isLever ? 0.92 : 0,
      pageType: !!doc.querySelector('.application-page, form.application-form')
        ? 'application_form' : 'job_listing',
      metadata: { url },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, ['.posting-header h2', '.posting-title h2', 'h2']);
    const company = this.extractText(doc, ['.posting-header .company-name', '[class*="company"]']);
    const location = this.extractText(doc, ['.posting-categories .sort-by-location', '.location']);
    const rawDescription = this.extractText(doc, ['.posting-description', '.section-wrapper', '.content-wrapper']);

    return {
      title, company: { name: company }, location,
      type: 'full_time',
      remote: rawDescription.toLowerCase().includes('remote') ? 'remote' : 'onsite',
      rawDescription, requirements: { required: [], preferred: [] }, responsibilities: [], skills: [],
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const form = doc.querySelector('form.application-form, form') ?? doc;
    const fields: FormField[] = [];

    const inputs = form.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea');
    for (const input of inputs) {
      const field = this.buildFormField(input);
      if (field) {
        field.mappedProfileField = this.mapLeverField(field.label);
        fields.push(field);
      }
    }

    return fields;
  }

  async detectQuestions(doc: Document): Promise<ApplicationQuestion[]> {
    return super.detectQuestions(doc);
  }

  private mapLeverField(label: string): string {
    const lower = label.toLowerCase();
    if (/full.?name|your.?name/.test(lower)) return 'contact.fullName';
    if (/first.?name/.test(lower)) return 'contact.firstName';
    if (/last.?name/.test(lower)) return 'contact.lastName';
    if (/email/.test(lower)) return 'contact.email';
    if (/phone/.test(lower)) return 'contact.phone';
    if (/linkedin/.test(lower)) return 'contact.linkedin';
    if (/github/.test(lower)) return 'contact.github';
    if (/portfolio|website/.test(lower)) return 'contact.portfolio';
    if (/current company/.test(lower)) return 'experience.currentCompany';
    return '';
  }
}

// ============================================================
// Ashby Adapter
// src/content/adapters/ashby.ts
// ============================================================

export class AshbyAdapter extends BaseATSAdapter {
  readonly name = 'ashby' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['ashbyhq.com'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isAshby = url.includes('ashbyhq.com') || !!doc.querySelector('[class*="ashby-"]');

    return {
      detected: isAshby,
      atsName: 'ashby',
      confidence: isAshby ? 0.9 : 0,
      pageType: url.includes('/application') ? 'application_form' : 'job_listing',
      metadata: { url },
    };
  }
}

// ============================================================
// Indeed Adapter
// src/content/adapters/indeed.ts
// ============================================================

export class IndeedAdapter extends BaseATSAdapter {
  readonly name = 'indeed' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['indeed.com'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isIndeed = url.includes('indeed.com');

    const isAppForm = !!(
      doc.querySelector('.ia-BasePage, .ia-Apply, [data-test="ia-QuestionGroup"]') ||
      url.includes('indeedapply.com') || url.includes('/applystart')
    );

    return {
      detected: isIndeed,
      atsName: 'indeed',
      confidence: isIndeed ? 0.93 : 0,
      pageType: isAppForm ? 'application_form' : 'job_listing',
      metadata: { url },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, [
      'h1[data-jk]', '.jobsearch-JobInfoHeader-title', '.jobTitle',
    ]);
    const company = this.extractText(doc, [
      '[data-company-name]', '.jobsearch-InlineCompanyRating-companyHeader a', '.companyName',
    ]);
    const location = this.extractText(doc, [
      '.jobsearch-JobInfoHeader-subtitle .companyLocation', '[data-job-location]',
    ]);
    const rawDescription = this.extractText(doc, [
      '#jobDescriptionText', '.jobsearch-jobDescriptionText',
    ]);

    return {
      title, company: { name: company }, location,
      type: 'full_time',
      remote: rawDescription.toLowerCase().includes('remote') ? 'remote' : 'onsite',
      rawDescription, requirements: { required: [], preferred: [] }, responsibilities: [], skills: [],
    };
  }
}

// ============================================================
// Workday Adapter (most complex)
// src/content/adapters/workday.ts
// ============================================================

export class WorkdayAdapter extends BaseATSAdapter {
  readonly name = 'workday' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['myworkdayjobs.com', 'wd5.myworkdayjobs.com'];

  private observer: MutationObserver | null = null;

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const isWorkday = url.includes('myworkdayjobs.com') ||
      !!doc.querySelector('.WDFC, [class*="WDHeaderContainer"], script[src*="workday"]');

    const isAppForm = url.includes('/apply/') || !!doc.querySelector(
      '[data-automation-id="applicationForm"], [data-automation-id="Application"], [data-automation-id="file-upload-drop-zone"]'
    );

    return {
      detected: isWorkday,
      atsName: 'workday',
      confidence: isWorkday ? 0.95 : 0,
      pageType: isAppForm ? 'application_form' : url.includes('/job/') ? 'job_listing' : 'unknown',
      metadata: { url },
    };
  }

  async parseJobDescription(doc: Document): Promise<ParsedJobDescription> {
    const title = this.extractText(doc, [
      '[data-automation-id="jobPostingHeader"]',
      'h1[class*="title"]',
    ]);
    const company = doc.title.split('|')[1]?.trim() ?? '';
    const location = this.extractText(doc, [
      '[data-automation-id="locations"]',
      '[data-automation-id="locationText"]',
    ]);
    const rawDescription = this.extractText(doc, [
      '[data-automation-id="jobPostingDescription"]',
      '.wd-text',
    ]);

    return {
      title, company: { name: company }, location,
      type: 'full_time',
      remote: rawDescription.toLowerCase().includes('remote') ? 'remote' : 'onsite',
      rawDescription, requirements: { required: [], preferred: [] }, responsibilities: [], skills: [],
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const fields: FormField[] = [];

    // Workday uses data-automation-id attributes extensively
    const inputs = doc.querySelectorAll<HTMLElement>(
      '[data-automation-id] input, [data-automation-id] select, [data-automation-id] textarea'
    );

    for (const input of inputs) {
      const field = this.buildFormField(input);
      if (field) {
        // Use parent automation-id for better identification
        const automationId = input.closest('[data-automation-id]')?.getAttribute('data-automation-id') ?? '';
        field.mappedProfileField = this.mapWorkdayField(field.label, automationId);
        fields.push(field);
      }
    }

    return fields;
  }

  async navigateToNextStep(doc: Document): Promise<import('../../types/adapter').NavigationResult> {
    const nextButton = doc.querySelector<HTMLButtonElement>(
      '[data-automation-id="bottom-navigation-next-btn"], [data-automation-id="nextButton"]'
    );

    if (!nextButton) return { success: false, errors: ['Workday next button not found'] };

    nextButton.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true };
  }

  async detectCurrentStep(doc: Document): Promise<import('../../types/adapter').ApplicationStep> {
    const progressEl = doc.querySelector('[data-automation-id="progressBar"], .prog-container');
    const steps = doc.querySelectorAll('[data-automation-id*="step"], .step');

    return {
      index: 0,
      total: steps.length || undefined,
      title: progressEl ? (progressEl as HTMLElement).innerText.trim() : undefined,
      isFirst: true,
      isLast: false,
      hasErrors: false,
    };
  }

  private mapWorkdayField(label: string, automationId: string): string {
    const lower = label.toLowerCase();
    const aid = automationId.toLowerCase();

    if (/legalName.*firstName|firstName/.test(aid) || /first.?name/.test(lower)) return 'contact.firstName';
    if (/legalName.*lastName|lastName/.test(aid) || /last.?name/.test(lower)) return 'contact.lastName';
    if (/email/.test(aid) || /email/.test(lower)) return 'contact.email';
    if (/phone/.test(aid) || /phone/.test(lower)) return 'contact.phone';
    if (/addressLine|street/.test(aid)) return 'contact.location.street';
    if (/city/.test(aid) || /city/.test(lower)) return 'contact.location.city';
    if (/state/.test(aid)) return 'contact.location.state';
    if (/zip|postal/.test(aid)) return 'contact.location.zipCode';
    if (/country/.test(aid)) return 'contact.location.country';
    if (/linkedin/.test(lower)) return 'contact.linkedin';

    return '';
  }
}

// ============================================================
// Universal Adapter — AI-powered fallback
// src/content/adapters/universal.ts
// ============================================================

export class UniversalAdapter extends BaseATSAdapter {
  readonly name = 'universal' as const;
  readonly version = '1.0.0';
  readonly supportedDomains = ['*'];

  async detect(doc: Document): Promise<ATSDetectionResult> {
    const url = window.location.href;
    const urlLower = url.toLowerCase();

    // Check for form elements (input, select, textarea) — works even without <form> tag
    const hasFormElements = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').length > 0;

    // Check for <form> tag
    const hasFormTag = !!doc.querySelector('form');

    // Check URL for job/application/career keywords (flexible matching)
    const hasJobUrl = (
      urlLower.includes('/job') ||
      urlLower.includes('/career') ||
      urlLower.includes('/apply') ||
      urlLower.includes('/application') ||
      urlLower.includes('/form') ||
      urlLower.includes('jobid=') ||
      urlLower.includes('job_id=')
    );

    // Check page title for job-related keywords
    const titleLower = doc.title.toLowerCase();
    const hasJobTitle = (
      titleLower.includes('job') ||
      titleLower.includes('position') ||
      titleLower.includes('career') ||
      titleLower.includes('apply') ||
      titleLower.includes('application') ||
      titleLower.includes('additional information')
    );

    // Check for step indicators (multi-step forms)
    const hasStepIndicator = !!(
      doc.querySelector('[class*="step"]') ||
      doc.querySelector('[class*="progress"]') ||
      doc.querySelector('[aria-label*="step"]') ||
      doc.querySelector('ol li') // ordered list often used for wizard steps
    );

    const isSearchPage = urlLower.includes('/search') || urlLower.includes('-jobs');

    // Check if URL/title explicitly indicate an application form
    const urlOrTitleSaysForm = (
      urlLower.includes('/application') || urlLower.includes('/form') ||
      titleLower.includes('application') || titleLower.includes('apply') || titleLower.includes('form')
    );

    // Determine page type
    let pageType: ATSDetectionResult['pageType'] = 'unknown';
    if (isSearchPage) {
      pageType = 'search_results';
    } else if (hasFormElements || hasFormTag || urlOrTitleSaysForm) {
      // Form elements, <form> tag, or URL/title says "application/form" → it's an application form
      pageType = 'application_form';
    } else if (hasJobUrl || hasJobTitle || hasStepIndicator) {
      pageType = 'job_listing';
    }

    const detected = hasFormElements || hasFormTag || hasJobUrl || hasJobTitle || hasStepIndicator;
    const confidence = pageType === 'application_form' ? 0.7
      : pageType === 'job_listing' ? 0.5
      : pageType === 'search_results' ? 0.6
      : 0.2;

    return {
      detected,
      atsName: 'universal',
      confidence,
      pageType,
      metadata: { detected: 'universal', url },
    };
  }

  async parseFormFields(doc: Document): Promise<FormField[]> {
    const fields = await super.parseFormFields(doc);

    // Map fields based on common label patterns
    for (const field of fields) {
      if (!field.mappedProfileField) {
        field.mappedProfileField = this.mapUniversalField(field);
      }
    }

    return fields;
  }

  private mapUniversalField(field: FormField): string {
    const label = field.label.toLowerCase();
    const placeholder = (field.placeholder ?? '').toLowerCase();

    // Use both label and placeholder for matching
    const text = `${label} ${placeholder}`;

    // Personal info
    if (/first.?name/.test(text)) return 'contact.firstName';
    if (/last.?name|surname|family.?name/.test(text)) return 'contact.lastName';
    if (/full.?name|your.?name|^name$/.test(text) && !/company/.test(text)) return 'contact.fullName';
    if (/email|e-?mail/.test(text)) return 'contact.email';
    if (/phone|mobile|cell|tel/.test(text)) return 'contact.phone';

    // Location
    if (/address|street|address.?line/.test(text)) return 'contact.location.street';
    if (/city|town/.test(text)) return 'contact.location.city';
    if (/state|province|region/.test(text)) return 'contact.location.state';
    if (/zip|postal|pin.?code/.test(text)) return 'contact.location.zipCode';
    if (/country/.test(text)) return 'contact.location.country';

    // Professional
    if (/linkedin/.test(text)) return 'contact.linkedin';
    if (/github/.test(text)) return 'contact.github';
    if (/portfolio|website|url/.test(text) && !/linkedin/.test(text)) return 'contact.portfolio';

    // Work preferences
    if (/salary|compensation|pay|expectation/.test(text)) return 'workPreferences.salaryExpectation';
    if (/notice.?period|available|start.?date/.test(text)) return 'workPreferences.noticePeriod';
    if (/visa|sponsorship|work.?authoriz|authorized/.test(text)) return 'workPreferences.workAuthorization';

    // File uploads
    if (field.type === 'file') {
      if (/resume|cv/.test(text)) return 'RESUME_UPLOAD';
      if (/cover/.test(text)) return 'COVER_LETTER';
    }

    return '';
  }
}
