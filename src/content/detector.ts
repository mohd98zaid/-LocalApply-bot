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
import { UniversalAdapter } from './adapters/universal';

const ADAPTERS = [
  new LinkedInAdapter(),
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new WorkdayAdapter(),
  new IndeedAdapter(),
  new AshbyAdapter(),
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
    const isSearchPage = detectionResult.pageType === 'search_results';

    let jobDescription = undefined;
    let formFields: FormField[] = [];
    let questions: ApplicationQuestion[] = [];

    if (isJobListingPage || isApplicationPage) {
      try {
        jobDescription = await activeAdapter.parseJobDescription(doc);
      } catch (e) {
        console.warn('[LocalApply] JD parsing failed:', e);
      }
    }

    if (isApplicationPage) {
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
      isApplicationPage,
      isJobListingPage,
      isSearchPage,
    };
  }
}
