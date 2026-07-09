// ============================================================
// ATS Detector — Identifies the ATS on the current page
// src/content/detector.ts
// ============================================================

import type { ATSDetectionResult, ATSName } from '../types/adapter';
import type { PageAnalysis } from '../types/messages';
import type { FormField } from '../types/adapter';
import type { ApplicationQuestion } from '../types/ai';

import { LinkedInAdapter } from './adapters/linkedin';
import { GreenhouseAdapter } from './adapters/greenhouse';
import { LeverAdapter } from './adapters/lever';
import { WorkdayAdapter } from './adapters/workday';
import { IndeedAdapter } from './adapters/indeed';
import { AshbyAdapter } from './adapters/ashby';
import { BambooHRAdapter } from './adapters/bamboohr';
import { UniversalAdapter } from './adapters/universal';

const ADAPTERS = [
  new LinkedInAdapter(),
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new WorkdayAdapter(),
  new IndeedAdapter(),
  new AshbyAdapter(),
  new BambooHRAdapter(),
];

export class ATSDetector {
  async analyzePage(doc: Document): Promise<PageAnalysis> {
    const url = window.location.href;
    const title = doc.title;

    // Try each adapter for detection
    let detectionResult: ATSDetectionResult = {
      detected: false,
      atsName: 'universal',
      confidence: 0,
      pageType: 'unknown',
      metadata: {},
    };

    let activeAdapter = null;

    for (const adapter of ADAPTERS) {
      try {
        const result = await adapter.detect(doc);
        if (result.detected && result.confidence > detectionResult.confidence) {
          detectionResult = result;
          activeAdapter = adapter;
        }
      } catch { /* adapter detection failed, continue */ }
    }

    // Fall back to universal adapter
    if (!activeAdapter) {
      activeAdapter = new UniversalAdapter();
      detectionResult = await activeAdapter.detect(doc);
    }

    const isApplicationPage = detectionResult.pageType === 'application_form';
    const isJobListingPage = detectionResult.pageType === 'job_listing';

    // ponytail: Only upgrade from 'unknown' to 'application_form' — never upgrade 'job_listing'
    // LinkedIn search pages have filter inputs that would false-positive as application forms
    const hasFormElements = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').length > 0;
    const upgradedToForm = hasFormElements && !isApplicationPage && !isJobListingPage;

    const effectiveIsApplicationPage = isApplicationPage || upgradedToForm;
    const effectiveIsJobListingPage = isJobListingPage && !upgradedToForm;
    
    // Some pages are both (e.g. LinkedIn split view). We check the URL directly as a fallback.
    const isSearchPage = detectionResult.pageType === 'search_results' || 
                         window.location.href.includes('/jobs/search/') || 
                         window.location.href.includes('-jobs');

    let jobDescription = undefined;
    let formFields: FormField[] = [];
    let questions: ApplicationQuestion[] = [];

    if (effectiveIsJobListingPage || effectiveIsApplicationPage) {
      try {
        jobDescription = await activeAdapter.parseJobDescription(doc);
      } catch (e) {
        console.warn('[LocalApply] JD parsing failed:', e);
      }
    }

    if (effectiveIsApplicationPage) {
      try {
        [formFields, questions] = await Promise.all([
          activeAdapter.parseFormFields(doc),
          activeAdapter.detectQuestions(doc),
        ]);
      } catch (e) {
        console.warn('[LocalApply] Form parsing failed:', e);
      }
    }

    return {
      url,
      title,
      ats: detectionResult,
      jobDescription,
      formFields,
      questions,
      isApplicationPage: effectiveIsApplicationPage,
      isJobListingPage: effectiveIsJobListingPage,
      isSearchPage,
    };
  }
}
