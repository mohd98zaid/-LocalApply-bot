// ============================================================
// ATS Adapter Types
// src/types/adapter.ts
// ============================================================

export type ATSName =
  | 'linkedin'
  | 'indeed'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'ashby'
  | 'bamboohr'
  | 'smartrecruiters'
  | 'jobvite'
  | 'wellfound'
  | 'icims'
  | 'taleo'
  | 'universal';

export interface ATSDetectionResult {
  detected: boolean;
  atsName: ATSName;
  confidence: number; // 0–1
  pageType: 'job_listing' | 'application_form' | 'confirmation' | 'dashboard' | 'unknown';
  metadata: Record<string, string>;
}

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'date'
  | 'number'
  | 'url'
  | 'hidden';

export interface FormField {
  id: string;
  element?: HTMLElement; // not serializable — used in content script only
  elementSelector?: string; // CSS selector for re-querying
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  maxLength?: number;
  options?: string[]; // for select/radio
  mappedProfileField?: string; // e.g., 'contact.firstName', 'workPreferences.noticePeriod'
  mappedValue?: string; // resolved value to fill
  confidence: number; // 0–1 confidence in field mapping
  currentValue?: string;
  section?: string; // form section grouping
}

export interface ApplicationStep {
  index: number;
  total?: number;
  title?: string;
  isFirst: boolean;
  isLast: boolean;
  hasErrors: boolean;
}

export interface FillResult {
  fieldId: string;
  success: boolean;
  value?: string;
  error?: string;
  method: 'direct' | 'typing' | 'select' | 'click' | 'upload';
}

export interface UploadResult {
  fieldId: string;
  success: boolean;
  fileName?: string;
  error?: string;
}

export interface NavigationResult {
  success: boolean;
  newStep?: ApplicationStep;
  errors?: string[];
}

export interface FormError {
  fieldId?: string;
  message: string;
  severity: 'error' | 'warning';
  autoFixable: boolean;
}

export interface SubmissionResult {
  success: boolean;
  confirmationNumber?: string;
  confirmationMessage?: string;
  redirectUrl?: string;
  applicationId?: string;
}

export type RecoveryAction =
  | 'retry'
  | 'skip_field'
  | 'pause_for_user'
  | 'reload_page'
  | 'abort'
  | 'wait_and_retry';

export interface AutomationError {
  code: string;
  message: string;
  fieldId?: string;
  recoverable: boolean;
  recoveryAction?: RecoveryAction;
  timestamp: string;
}

// Adapter interface contract
export interface ATSAdapter {
  readonly name: ATSName;
  readonly version: string;
  readonly supportedDomains: string[];

  detect(document: Document): Promise<ATSDetectionResult>;
  parseJobDescription(document: Document): Promise<import('./job').ParsedJobDescription>;
  parseFormFields(document: Document): Promise<FormField[]>;
  detectQuestions(document: Document): Promise<import('./ai').ApplicationQuestion[]>;

  fillField(field: FormField, value: string): Promise<FillResult>;
  uploadFile(field: FormField, file: File): Promise<UploadResult>;
  selectOption(field: FormField, value: string): Promise<FillResult>;

  detectCurrentStep(document: Document): Promise<ApplicationStep>;
  navigateToNextStep(document: Document): Promise<NavigationResult>;

  detectErrors(document: Document): Promise<FormError[]>;
  detectSuccess(document: Document): Promise<SubmissionResult | null>;

  handleError(error: AutomationError): Promise<RecoveryAction>;
}
