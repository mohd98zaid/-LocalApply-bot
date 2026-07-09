// ============================================================
// Auto-Apply Engine (Background Orchestrator)
// src/background/autoApplyEngine.ts
//
// Supports two modes:
//   LinkedIn: split-view — click job cards in list, no URL navigation
//   Naukri/Universal: navigate to each job URL
// ============================================================

import { createMessage, type PageAnalysis } from '../types/messages';
import { getSettings } from '../storage/chromeStorage';
import { sendToContentScript, sleep } from '../utils/shared';

type Portal = 'linkedin' | 'naukri' | 'universal';

// State machine phases for LinkedIn Easy Apply modal
type ModalPhase =
  | 'idle'
  | 'filling'       // filling fields on current step
  | 'clicking_next' // clicking Next button
  | 'submitting'    // clicking Review & Submit / Submit
  | 'done';         // modal closed or application submitted

export class AutoApplyEngine {
  private isRunning = false;
  private currentTabId: number | null = null;
  private portal: Portal = 'universal';
  private currentIndex = 0;
  private totalJobs = 0;

  // LinkedIn: job card selectors scraped from the list
  private jobCardSelectors: string[] = [];
  // Naukri/Universal: job URLs
  private jobLinks: string[] = [];

  // Per-job state
  private modalPhase: ModalPhase = 'idle';
  private autofillRetries = 0;
  private maxAutofillRetries = 3;
  private externalTabId: number | null = null;

  // Tracks how many jobs were attempted vs applied
  private applied = 0;
  private skipped = 0;

  constructor() {
    chrome.tabs.onCreated.addListener((tab) => {
      if (this.isRunning && tab.openerTabId === this.currentTabId && tab.id) {
        this.externalTabId = tab.id;
      }
    });
  }

  // ---- Public API ----

  async start(tabId: number, portal: Portal) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentTabId = tabId;
    this.portal = portal;
    this.currentIndex = 0;
    this.applied = 0;
    this.skipped = 0;
    this.modalPhase = 'idle';
    this.autofillRetries = 0;

    console.log(`[AutoApplyEngine] Started on ${portal}`);
    this.broadcastStatus();

    if (portal === 'linkedin') {
      await this.extractLinkedInJobCards();
    } else {
      await this.extractJobLinks();
    }
  }

  stop() {
    this.isRunning = false;
    this.modalPhase = 'idle';
    this.broadcastStatus();
    console.log('[AutoApplyEngine] Stopped.');
  }

  // ---- Step 1: Extract jobs from search page ----

  private async extractLinkedInJobCards() {
    if (!this.currentTabId || !this.isRunning) return;

    const response = await sendToContentScript(this.currentTabId, {
      type: 'SCRAPE_JOB_CARDS',
      payload: {},
    }) as { cardSelectors?: string[] } | null;

    if (response?.cardSelectors && response.cardSelectors.length > 0) {
      this.jobCardSelectors = response.cardSelectors;
      this.totalJobs = response.cardSelectors.length;
      console.log(`[AutoApplyEngine] Found ${this.totalJobs} LinkedIn job cards`);
      this.broadcastStatus();
      this.processNextLinkedInJob();
    } else {
      console.warn('[AutoApplyEngine] No LinkedIn job cards found');
      this.stop();
    }
  }

  private async extractJobLinks() {
    if (!this.currentTabId || !this.isRunning) return;

    const response = await sendToContentScript(this.currentTabId, {
      type: 'SCRAPE_JOB_LINKS',
      payload: { portal: this.portal },
    }) as { links?: string[] } | null;

    if (response?.links && response.links.length > 0) {
      this.jobLinks = response.links;
      this.totalJobs = response.links.length;
      console.log(`[AutoApplyEngine] Found ${this.totalJobs} job links`);
      this.broadcastStatus();
      this.processNextUrlJob();
    } else {
      console.warn('[AutoApplyEngine] No job links found');
      this.stop();
    }
  }

  // ---- Step 2: LinkedIn — click job card, then apply/fill ----

  private async processNextLinkedInJob() {
    if (!this.isRunning || !this.currentTabId) return;

    if (this.currentIndex >= this.jobCardSelectors.length) {
      console.log(`[AutoApplyEngine] Done. Applied: ${this.applied}, Skipped: ${this.skipped}`);
      this.stop();
      return;
    }

    const selector = this.jobCardSelectors[this.currentIndex];
    console.log(`[AutoApplyEngine] Job ${this.currentIndex + 1}/${this.totalJobs}: clicking card`);
    this.broadcastStatus();

    // Reset per-job state
    this.modalPhase = 'idle';
    this.autofillRetries = 0;

    // Click the job card in the left panel
    const clickResult = await sendToContentScript(this.currentTabId, {
      type: 'CLICK_JOB_CARD',
      payload: { selector },
    }) as { success?: boolean } | null;

    if (!clickResult?.success) {
      console.log('[AutoApplyEngine] Could not click job card, skipping');
      this.skipped++;
      this.currentIndex++;
      await sleep(1500);
      this.processNextLinkedInJob();
      return;
    }

    // Wait for the right panel to load
    await sleep(2500);

    // Now click Easy Apply
    await this.clickEasyApply();
  }

  private async clickEasyApply() {
    if (!this.isRunning || !this.currentTabId) return;

    console.log('[AutoApplyEngine] Clicking Easy Apply...');
    const result = await sendToContentScript(this.currentTabId, {
      type: 'CLICK_EASY_APPLY',
      payload: {},
    }) as { success?: boolean; alreadyOpen?: boolean } | null;

    if (result?.alreadyOpen) {
      this.modalPhase = 'filling';
      await sleep(1000);
      await this.fillModalStep();
      return;
    }

    if (result?.success) {
      // Easy Apply clicked — wait for modal
      await sleep(2000);
      this.modalPhase = 'filling';
      await this.fillModalStep();
      return;
    }

    // ponytail: Easy Apply not found — try external Apply button (redirects to another page)
    console.log('[AutoApplyEngine] Easy Apply not found, trying external Apply...');
    const applyResult = await sendToContentScript(this.currentTabId, {
      type: 'CLICK_APPLY_BUTTON',
      payload: {},
    }) as { success?: boolean } | null;

    if (!applyResult?.success) {
      console.log('[AutoApplyEngine] No Apply button found, skipping');
      this.skipped++;
      this.currentIndex++;
      await sleep(1500);
      this.processNextLinkedInJob();
      return;
    }

    // External Apply clicked — page will navigate. handlePageAnalysis() will catch the new page.
    console.log('[AutoApplyEngine] External Apply clicked, waiting for new page...');
    await sleep(5000);
  }

  private async fillModalStep() {
    if (!this.isRunning || !this.currentTabId) return;

    console.log('[AutoApplyEngine] Filling modal fields...');
    this.broadcastStatus();

    // Get settings and profile
    const settings = await getSettings();
    let profileId = settings.activeProfileId;
    if (!profileId) {
      try {
        const { profilesDB } = await import('../storage/indexedDB');
        const profiles = await profilesDB.getAll();
        if (profiles.length > 0) profileId = profiles[0].id;
      } catch { /* ignore */ }
    }

    if (!profileId) {
      console.warn('[AutoApplyEngine] No profile found, skipping');
      this.skipAndNext('no_profile');
      return;
    }

    const mode = settings.automation.defaultMode || 'copilot';

    // Trigger autofill on the content script
    const fillResult = await sendToContentScript(this.currentTabId, {
      type: 'START_AUTOFILL',
      payload: {
        profileId,
        jobId: 'auto-apply-session',
        mode,
        fieldsToFill: [], // content script will re-detect from live DOM
      },
    }) as { filledCount?: number; failed?: string[] } | null;

    const filled = fillResult?.filledCount ?? 0;
    console.log(`[AutoApplyEngine] Filled ${filled} fields`);

    // After filling, try to click Next or Submit
    await sleep(1500);
    await this.advanceModalStep();
  }

  private async advanceModalStep() {
    if (!this.isRunning || !this.currentTabId) return;

    console.log('[AutoApplyEngine] Advancing modal step...');
    this.broadcastStatus();

    // Try to find and click Next/Submit/Review & Submit
    const result = await sendToContentScript(this.currentTabId, {
      type: 'CLICK_MODAL_BUTTON',
      payload: {},
    }) as { action?: 'next' | 'submit' | 'review' | 'none'; success?: boolean } | null;

    if (!result?.success || result.action === 'none') {
      // No button found — might be at the end or stuck
      this.autofillRetries++;
      if (this.autofillRetries < this.maxAutofillRetries) {
        console.log(`[AutoApplyEngine] No button found, retry ${this.autofillRetries}/${this.maxAutofillRetries}`);
        await sleep(2000);
        await this.fillModalStep(); // Re-analyze and fill again
        return;
      }
      console.log('[AutoApplyEngine] Max retries reached, closing and moving on');
      await this.closeModalAndNext();
      return;
    }

    if (result.action === 'next') {
      // Multi-step form — wait for next step to load, then fill again
      console.log('[AutoApplyEngine] Clicked Next, waiting for next step...');
      await sleep(2000);
      this.modalPhase = 'filling';
      await this.fillModalStep();
      return;
    }

    if (result.action === 'review') {
      // Review page — click Submit
      console.log('[AutoApplyEngine] On review page, submitting...');
      await sleep(1500);
      const submitResult = await sendToContentScript(this.currentTabId, {
        type: 'CLICK_SUBMIT_APPLICATION',
        payload: {},
      }) as { success?: boolean } | null;

      if (submitResult?.success) {
        console.log('[AutoApplyEngine] Application submitted!');
        this.applied++;
      } else {
        console.log('[AutoApplyEngine] Submit failed');
        this.skipped++;
      }

      await sleep(2000);
      await this.closeModalAndNext();
      return;
    }

    if (result.action === 'submit') {
      // Direct submit (single-step form)
      console.log('[AutoApplyEngine] Application submitted!');
      this.applied++;
      await sleep(2000);
      await this.closeModalAndNext();
      return;
    }
  }

  private async closeModalAndNext() {
    if (!this.isRunning || !this.currentTabId) return;

    // Close the Easy Apply modal
    await sendToContentScript(this.currentTabId, {
      type: 'CLOSE_MODAL',
      payload: {},
    });

    await sleep(1500);

    this.currentIndex++;
    this.modalPhase = 'idle';
    this.broadcastStatus();
    this.processNextLinkedInJob();
  }

  // ---- Step 2: Naukri/Universal — navigate to URL, apply/fill ----

  private async processNextUrlJob() {
    if (!this.isRunning || !this.currentTabId) return;

    if (this.currentIndex >= this.jobLinks.length) {
      console.log(`[AutoApplyEngine] Done. Applied: ${this.applied}, Skipped: ${this.skipped}`);
      this.stop();
      return;
    }

    const url = this.jobLinks[this.currentIndex];
    console.log(`[AutoApplyEngine] Job ${this.currentIndex + 1}/${this.totalJobs}: ${url}`);
    this.broadcastStatus();

    // Reset per-job state
    this.modalPhase = 'idle';
    this.autofillRetries = 0;
    this.externalTabId = null;

    // Navigate to job URL
    await chrome.tabs.update(this.currentTabId, { url, active: true });

    // Wait for page to load — the content script's MutationObserver will
    // send PAGE_ANALYSIS_RESULT which triggers handlePageAnalysis below
  }

  // ---- Incoming analysis from content script ----

  async handlePageAnalysis(analysis: PageAnalysis, tabId: number) {
    if (!this.isRunning) return;
    if (tabId !== this.currentTabId && tabId !== this.externalTabId) return;

    const settings = await getSettings();
    let profileId = settings.activeProfileId;
    if (!profileId) {
      try {
        const { profilesDB } = await import('../storage/indexedDB');
        const profiles = await profilesDB.getAll();
        if (profiles.length > 0) profileId = profiles[0].id;
      } catch { /* ignore */ }
    }

    if (!profileId) {
      console.warn('[AutoApplyEngine] No profile, skipping');
      if (this.portal === 'linkedin') {
        this.skipped++;
        this.currentIndex++;
        this.processNextLinkedInJob();
      } else {
        this.skipAndNext('no_profile');
      }
      return;
    }

    const mode = settings.automation.defaultMode || 'copilot';

    // ---- LinkedIn split-view: handle based on current phase ----

    if (this.portal === 'linkedin') {
      // If we're in the modal filling phase and a form is detected, fill it
      if (analysis.isApplicationPage && this.modalPhase === 'filling') {
        await this.fillModalStep();
        return;
      }
      // ponytail: External Apply redirected to a new page with a form — fill it
      if (analysis.isApplicationPage && this.modalPhase === 'idle') {
        console.log('[AutoApplyEngine] External form detected, filling...');
        const fillResult = await sendToContentScript(tabId, {
          type: 'START_AUTOFILL',
          payload: {
            profileId,
            jobId: 'auto-apply-session',
            mode,
            fieldsToFill: analysis.formFields,
          },
        }) as { filledCount?: number } | null;

        console.log(`[AutoApplyEngine] Filled ${fillResult?.filledCount ?? 0} fields`);

        // Try to submit
        await sleep(2000);
        const submitResult = await sendToContentScript(tabId, {
          type: 'CLICK_SUBMIT_APPLICATION',
          payload: {},
        }) as { success?: boolean } | null;

        if (submitResult?.success) {
          this.applied++;
        } else {
          // Try multi-step: click Next/Review
          await this.advanceModalStep();
          return;
        }

        await sleep(2000);
        this.currentIndex++;
        this.processNextLinkedInJob();
        return;
      }
      // If we just clicked a job card and see a job listing, click Easy Apply
      if (analysis.isJobListingPage && !analysis.isApplicationPage && this.modalPhase === 'idle') {
        await this.clickEasyApply();
        return;
      }
      return;
    }

    // ---- Naukri/Universal: navigate-based flow ----

    if (analysis.isApplicationPage) {
      // Form detected — fill it
      console.log('[AutoApplyEngine] Form detected, filling...');
      const fillResult = await sendToContentScript(tabId, {
        type: 'START_AUTOFILL',
        payload: {
          profileId,
          jobId: 'auto-apply-session',
          mode,
          fieldsToFill: analysis.formFields,
        },
      }) as { filledCount?: number } | null;

      console.log(`[AutoApplyEngine] Filled ${fillResult?.filledCount ?? 0} fields`);

      // Try to submit
      await sleep(2000);
      const submitResult = await sendToContentScript(tabId, {
        type: 'CLICK_SUBMIT_APPLICATION',
        payload: {},
      }) as { success?: boolean } | null;

      if (submitResult?.success) {
        this.applied++;
      } else {
        this.skipped++;
      }

      await sleep(2000);
      this.currentIndex++;
      this.processNextUrlJob();
      return;
    }

    if (analysis.isJobListingPage && !analysis.isApplicationPage) {
      // Job listing — click Apply button
      console.log('[AutoApplyEngine] Job listing, clicking Apply...');
      const applyResult = await sendToContentScript(tabId, {
        type: 'CLICK_APPLY_BUTTON',
        payload: {},
      }) as { success?: boolean } | null;

      if (!applyResult?.success) {
        console.log('[AutoApplyEngine] Apply button not found, skipping');
        this.skipped++;
        this.currentIndex++;
        await sleep(1500);
        this.processNextUrlJob();
        return;
      }

      // Wait for form to load, then PAGE_ANALYSIS_RESULT will fire again
      // with isApplicationPage = true, which we handle above
      await sleep(3000);

      // Timeout safety — if still on listing after 15s, skip
      const jobIndex = this.currentIndex;
      setTimeout(() => {
        if (this.isRunning && this.currentIndex === jobIndex && this.modalPhase === 'idle') {
          this.skipped++;
          this.currentIndex++;
          this.processNextUrlJob();
        }
      }, 15000);
      return;
    }
  }

  async handleAutofillComplete(result: { success: boolean; reason?: string }) {
    if (!this.isRunning) return;

    if (this.portal === 'linkedin') {
      // LinkedIn flow is handled by advanceModalStep, not by this callback
      return;
    }

    // Naukri/Universal: close external tab if opened, move to next
    if (this.externalTabId) {
      chrome.tabs.remove(this.externalTabId).catch(() => {});
      this.externalTabId = null;
      if (this.currentTabId) {
        chrome.tabs.update(this.currentTabId, { active: true }).catch(() => {});
      }
    }

    if (result.success) {
      this.applied++;
    } else {
      this.skipped++;
    }

    this.currentIndex++;
    await sleep(Math.random() * 2000 + 2000);
    this.processNextUrlJob();
  }

  // ---- Helpers ----

  private async skipAndNext(reason: string) {
    console.log(`[AutoApplyEngine] Skipping: ${reason}`);
    this.skipped++;
    this.currentIndex++;
    await sleep(1500);
    if (this.portal === 'linkedin') {
      this.processNextLinkedInJob();
    } else {
      this.processNextUrlJob();
    }
  }

  private broadcastStatus() {
    chrome.runtime.sendMessage(createMessage('AUTO_APPLY_STATUS', {
      isRunning: this.isRunning,
      currentJobIndex: this.currentIndex,
      totalJobsFound: this.totalJobs,
      jobsApplied: this.applied,
      jobsSkipped: this.skipped,
    })).catch(() => {});
  }
}

export const autoApplyEngine = new AutoApplyEngine();
