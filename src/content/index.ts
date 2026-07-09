// ============================================================
// Content Script — Entry Point
// src/content/index.ts
// ============================================================

import { ATSDetector } from './detector';
import { FloatingOverlay } from './overlay';
import type { PageAnalysis } from '../types/messages';

let detector: ATSDetector | null = null;
let overlay: FloatingOverlay | null = null;
let isInitialized = false;

async function initialize() {
  if (isInitialized) return;
  isInitialized = true;

  detector = new ATSDetector();
  overlay = new FloatingOverlay();

  // Initial page analysis
  await analyzePage();

  // Watch for DOM changes (modals popping up, etc.)
  const observer = new MutationObserver(debounce(async () => {
    // If the URL changed, update it
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
    }
    // Always re-analyze because SPAs pop up modals without URL changes
    await analyzePage();
  }, 2500));

  observer.observe(document.body, { childList: true, subtree: true });
}

let lastUrl = window.location.href;

async function analyzePage() {
  if (!detector) return null;

  // Quick guard: skip heavy detection on pages with no form elements
  // and no job-site URL patterns. Prevents wasted work on google.com, youtube, etc.
  const hasFormElements = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
  ).length > 0;
  const url = window.location.href.toLowerCase();
  const looksLikeJobSite = (
    url.includes('/job') || url.includes('/career') || url.includes('/apply') ||
    url.includes('/application') || url.includes('jobid=') || url.includes('/form')
  );

  if (!hasFormElements && !looksLikeJobSite) {
    overlay?.hide();
    return null;
  }

  const analysis = await detector.analyzePage(document);

  if (analysis.isApplicationPage || analysis.isJobListingPage) {
    overlay?.show(analysis);

    // ponytail: Deferred autofill — if we clicked Apply on a previous page, auto-trigger here
    if (analysis.isApplicationPage) {
      chrome.storage.session.get('deferredAutofill', (data) => {
        if (data.deferredAutofill) {
          chrome.storage.session.remove('deferredAutofill').catch(() => {});
          // Small delay to let overlay fully render
          setTimeout(() => overlay?.autoTriggerAutofill(), 500);
        }
      });
    }
  } else {
    overlay?.hide();
  }

  // Send to background service worker
  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_ANALYSIS_RESULT',
      payload: analysis,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  } catch (e) {
    // Ignore "Extension context invalidated" synchronous errors
  }

  return analysis;
}

// ---- Message listener (commands from background/side panel) ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: String(err) });
  });
  return true;
});

async function handleMessage(message: { type: string; payload?: unknown }) {
  switch (message.type) {
    case 'ANALYZE_PAGE':
      await analyzePage();
      return { success: true };

    case 'START_AUTOFILL': {
      // ponytail: Adapter might miss non-standard ATS pages (Airtable, custom forms).
      // Always do a broad DOM scan to get live element refs — adapter fields are a bonus, not required.
      const payload = message.payload as { profileId: string; jobId: string; mode: string; fieldsToFill: import('../types/adapter').FormField[]; profile?: import('../types/resume').CandidateProfile };

      const freshAnalysis = await analyzePage();
      if (freshAnalysis && freshAnalysis.formFields && freshAnalysis.formFields.length > 0) {
        payload.fieldsToFill = freshAnalysis.formFields;
      } else {
        // Broad scan: find every fillable element with live DOM refs
        const { BaseATSAdapter } = await import('./adapters/base');
        const adapter = new (class extends BaseATSAdapter {
          readonly name = 'universal' as const;
          readonly version = '1.0.0';
          readonly supportedDomains = ['*'];
          async detect() { return { detected: true, atsName: 'universal' as const, confidence: 1, pageType: 'application_form' as const, metadata: {} }; }
        })();
        const allInputs = document.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
        );
        const roleInputs = document.querySelectorAll<HTMLElement>(
          '[role="textbox"], [role="combobox"], [role="listbox"], [contenteditable="true"]'
        );
        const fields: import('../types/adapter').FormField[] = [];
        for (const el of [...allInputs, ...roleInputs]) {
          const field = adapter['buildFormField'](el);
          if (field) {
            if (!field.mappedProfileField) {
              field.mappedProfileField = adapter['mapFieldByLabel'](field.label);
            }
            fields.push(field);
          }
        }
        payload.fieldsToFill = fields;
      }

      const { AutofillOrchestrator } = await import('./formEngine/filler');
      const orchestrator = new AutofillOrchestrator();
      return orchestrator.start(payload);
    }

    case 'FILL_FIELD': {
      const { EventSimulator } = await import('./formEngine/eventSimulator');
      const { field, value } = message.payload as { field: import('../types/adapter').FormField; value: string };
      return EventSimulator.fillField(field, value);
    }

    case 'SCRAPE_JOB_LINKS': {
      const { portal } = message.payload as { portal: string };
      let links: string[] = [];

      if (portal === 'linkedin') {
        // LinkedIn job search results — multiple selector strategies
        const selectors = [
          'a.job-card-list__title--link',
          'a[data-control-name="job_search_srp_result_job_title"]',
          'a.job-card-container__link',
          'a.base-card__full-link',
          '.job-card-list a[href*="/jobs/view/"]',
          'li.jobs-search-results__list-item a[href*="/jobs/view/"]',
          '.scaffold-layout__list a[href*="/jobs/view/"]',
          'a[href*="/jobs/view/"]',
        ];
        const seen = new Set<string>();
        for (const sel of selectors) {
          document.querySelectorAll<HTMLAnchorElement>(sel).forEach(a => {
            const href = a.href.split('?')[0];
            if (href.includes('/jobs/view/') && !seen.has(href)) {
              seen.add(href);
              links.push(href);
            }
          });
        }
      } else if (portal === 'naukri') {
        const selectors = [
          'a.title',
          'a[href*="/jobs/"]',
          '.srp-cardItem a',
        ];
        const seen = new Set<string>();
        for (const sel of selectors) {
          document.querySelectorAll<HTMLAnchorElement>(sel).forEach(a => {
            const href = a.href;
            if (!seen.has(href)) {
              seen.add(href);
              links.push(href);
            }
          });
        }
      }

      // Deduplicate
      links = [...new Set(links)];
      return { success: true, links };
    }

    case 'CLICK_APPLY_BUTTON': {
      // Find and click the apply button — try multiple selector strategies
      const applySelectors = [
        // LinkedIn Easy Apply (current DOM)
        'button[aria-label*="Easy Apply"]',
        'button[aria-label*="Apply"]',
        '.jobs-apply-button',
        'button.jobs-apply-button',
        '.jobs-apply-button--top-card',
        '[data-control-name="jobdetails_topcard_inapply"]',
        'button[data-control-name="jobs-apply-button"]',
        // LinkedIn split view
        '.jobs-details__main-content button[aria-label*="Apply"]',
        '.job-details-jobs-unified-top-card__container button[aria-label*="Apply"]',
        // Naukri
        'button.apply-message',
        'button.apply-button',
        // Workday
        '[data-automation-id="applyNowButton"]',
        // Greenhouse / Lever
        'a[data-mapped="true"]',
        '#apply_button',
        'input[type="submit"][value*="Apply"]',
      ];

      let clicked = false;
      for (const selector of applySelectors) {
        const btn = document.querySelector<HTMLElement>(selector);
        if (btn && btn.offsetParent !== null) { // visible check
          btn.click();
          clicked = true;
          break;
        }
      }

      // Fallback: find any button with "Apply" or "Easy Apply" text
      if (!clicked) {
        const allButtons = document.querySelectorAll('button, a[role="button"], a.btn, input[type="submit"]');
        for (const btn of allButtons) {
          const text = (btn as HTMLElement).innerText?.toLowerCase().trim() ?? (btn as HTMLInputElement).value?.toLowerCase().trim() ?? '';
          if (text.includes('easy apply') || text === 'apply now' || text === 'apply') {
            (btn as HTMLElement).click();
            clicked = true;
            break;
          }
        }
      }

      return { success: clicked };
    }

    // ---- Auto-Apply: LinkedIn split-view commands ----

    case 'SCRAPE_JOB_CARDS': {
      // Return CSS selectors for each job card so the engine can click them
      const cardSelectors: string[] = [];
      const cardSelectorsToTry = [
        'li.jobs-search-results__list-item',
        '.scaffold-layout__list-item',
        '.job-card-list__list-item',
        'ul.jobs-search-results__list > li',
      ];

      for (const sel of cardSelectorsToTry) {
        const cards = document.querySelectorAll(sel);
        if (cards.length > 0) {
          cards.forEach((card, i) => {
            // Assign a stable attribute-based selector
            const jobId = card.querySelector('a[href*="/jobs/view/"]')?.getAttribute('href')?.match(/currentJobId=(\d+)/)?.[1];
            if (jobId) {
              cardSelectors.push(`li:has(a[href*="currentJobId=${jobId}"])`);
            } else {
              // Fallback: use nth-child
              cardSelectors.push(`${sel}:nth-child(${i + 1})`);
            }
          });
          break;
        }
      }

      return { cardSelectors };
    }

    case 'CLICK_JOB_CARD': {
      const { selector } = message.payload as { selector: string };
      const card = document.querySelector<HTMLElement>(selector);
      if (card) {
        card.click();
        return { success: true };
      }
      return { success: false };
    }

    case 'CLICK_EASY_APPLY': {
      // Check if modal is already open
      const existingModal = document.querySelector(
        '.jobs-easy-apply-modal, .artdeco-modal__content, div[role="dialog"] form'
      );
      if (existingModal) {
        return { success: true, alreadyOpen: true };
      }

      // Try clicking Easy Apply button
      const easyApplySelectors = [
        'button[aria-label*="Easy Apply"]',
        '.jobs-apply-button',
        'button.jobs-apply-button',
        '.jobs-apply-button--top-card',
        'button[data-control-name="jobs-apply-button"]',
        '.jobs-details__main-content button[aria-label*="Easy Apply"]',
        '.job-details-jobs-unified-top-card__container button[aria-label*="Easy Apply"]',
      ];

      for (const sel of easyApplySelectors) {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return { success: true };
        }
      }

      // Fallback: text match
      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        if (btn.innerText?.toLowerCase().includes('easy apply') && btn.offsetParent !== null) {
          btn.click();
          return { success: true };
        }
      }

      return { success: false };
    }

    case 'CLICK_MODAL_BUTTON': {
      // Find Next, Review & Submit, or Submit button in the Easy Apply modal
      const modal = document.querySelector(
        '.jobs-easy-apply-modal, .artdeco-modal__content, div[role="dialog"]'
      );
      if (!modal) return { success: false, action: 'none' };

      // Priority: Submit > Review & Submit > Next > Review
      const buttonPatterns = [
        { selectors: ['footer button[aria-label*="Submit"]', 'button[aria-label="Submit application"]'], action: 'submit' as const },
        { selectors: ['footer button[aria-label*="Review"]', 'button[aria-label*="review"]'], action: 'review' as const },
        { selectors: ['footer button[aria-label*="Next"]', 'button[aria-label="Continue to next step"]'], action: 'next' as const },
      ];

      for (const { selectors, action } of buttonPatterns) {
        for (const sel of selectors) {
          const btn = modal.querySelector<HTMLElement>(sel);
          if (btn && btn.offsetParent !== null && !(btn as HTMLButtonElement).disabled) {
            btn.click();
            return { success: true, action };
          }
        }
      }

      // Fallback: find buttons by text content inside the modal
      const footerButtons = modal.querySelectorAll('footer button, .artdeco-modal__actionbar button');
      for (const btn of footerButtons) {
        const btnEl = btn as HTMLElement;
        const text = btnEl.textContent?.toLowerCase().trim() ?? '';
        const isDisabled = (btn as HTMLButtonElement).disabled;
        if (isDisabled) continue;

        if (text.includes('submit')) {
          btnEl.click();
          return { success: true, action: 'submit' };
        }
        if (text.includes('review')) {
          btnEl.click();
          return { success: true, action: 'review' };
        }
        if (text.includes('next')) {
          btnEl.click();
          return { success: true, action: 'next' };
        }
      }

      return { success: false, action: 'none' };
    }

    case 'CLICK_SUBMIT_APPLICATION': {
      // Final submit button — try multiple selectors
      const submitSelectors = [
        'button[aria-label="Submit application"]',
        'button[aria-label*="Submit"]',
        'footer button[type="submit"]',
        '.jobs-easy-apply-modal footer button:last-child',
      ];

      for (const sel of submitSelectors) {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn && btn.offsetParent !== null && !(btn as HTMLButtonElement).disabled) {
          btn.click();
          return { success: true };
        }
      }

      // Text fallback
      const modalBtns = document.querySelectorAll(
        '.jobs-easy-apply-modal button, .artdeco-modal__content button, div[role="dialog"] button'
      );
      for (const btn of modalBtns) {
        const btnEl = btn as HTMLElement;
        const text = btnEl.textContent?.toLowerCase().trim() ?? '';
        if (text.includes('submit') && !(btn as HTMLButtonElement).disabled) {
          btnEl.click();
          return { success: true };
        }
      }

      return { success: false };
    }

    case 'CLOSE_MODAL': {
      // Close the Easy Apply modal
      const closeSelectors = [
        'button[aria-label="Dismiss"]',
        'button[aria-label="Close"]',
        '.artdeco-modal__dismiss',
        '.jobs-easy-apply-modal button[aria-label="Close"]',
      ];

      for (const sel of closeSelectors) {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return { success: true };
        }
      }

      // Escape key fallback
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { success: true };
    }

    case 'GET_PAGE_DATA': {
      // Always do a broad DOM scan — finds fields on any page regardless of detection
      const allInputs = document.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
      );
      const roleInputs = document.querySelectorAll<HTMLElement>(
        '[role="textbox"], [role="combobox"], [role="listbox"], [contenteditable="true"]'
      );

      const { BaseATSAdapter } = await import('./adapters/base');
      const adapter = new (class extends BaseATSAdapter {
        readonly name = 'universal' as const;
        readonly version = '1.0.0';
        readonly supportedDomains = ['*'];
        async detect(_doc: Document) { return { detected: true, atsName: 'universal' as const, confidence: 1, pageType: 'application_form' as const, metadata: {} }; }
      })();

      const fields: import('../types/adapter').FormField[] = [];
      const allElements = [...allInputs, ...roleInputs];
      for (const el of allElements) {
        const field = adapter['buildFormField'](el);
        if (field) {
          if (!field.mappedProfileField) {
            field.mappedProfileField = adapter['mapFieldByLabel'](field.label);
          }
          fields.push(field);
        }
      }

      return {
        url: window.location.href,
        title: document.title,
        ats: { detected: true, atsName: 'universal', confidence: 1, pageType: 'application_form', metadata: {} },
        formFields: fields,
        questions: [],
        isApplicationPage: fields.length > 0,
        isJobListingPage: false,
        isSearchPage: false,
      };
    }

    default:
      return null;
  }
}

// ---- Utilities ----

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize().catch(console.error);
}
