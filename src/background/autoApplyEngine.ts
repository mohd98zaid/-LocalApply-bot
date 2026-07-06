// ============================================================
// Auto-Apply Engine (Background Orchestrator)
// src/background/autoApplyEngine.ts
// ============================================================

import { createMessage, type Message } from '../types/messages';
import { getSettings } from '../storage/chromeStorage';

export class AutoApplyEngine {
  private isRunning = false;
  private currentTabId: number | null = null;
  private portal: 'linkedin' | 'naukri' | 'universal' = 'universal';
  private jobLinks: string[] = [];
  private currentIndex = 0;
  
  // State flags to prevent spamming actions
  private hasTriggeredApplyForCurrentJob = false;
  private hasTriggeredAutofillForCurrentJob = false;

  constructor() {}

  async start(tabId: number, portal: 'linkedin' | 'naukri' | 'universal') {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentTabId = tabId;
    this.portal = portal;
    this.currentIndex = 0;
    this.jobLinks = [];

    console.log('[AutoApplyEngine] Started on portal:', portal);
    
    // Broadcast status
    this.broadcastStatus();

    // Step 1: Extract job links from the current search page
    await this.extractJobsFromSearchPage();
  }

  stop() {
    this.isRunning = false;
    this.broadcastStatus();
    console.log('[AutoApplyEngine] Stopped.');
  }

  private async extractJobsFromSearchPage() {
    if (!this.currentTabId || !this.isRunning) return;

    try {
      // Ask content script to scrape job links
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        type: 'SCRAPE_JOB_LINKS',
        payload: { portal: this.portal }
      });

      if (response && response.links && response.links.length > 0) {
        this.jobLinks = response.links;
        console.log(`[AutoApplyEngine] Found ${this.jobLinks.length} jobs.`);
        this.broadcastStatus();
        this.processNextJob();
      } else {
        console.warn('[AutoApplyEngine] No jobs found on page.');
        this.stop();
      }
    } catch (e) {
      console.error('[AutoApplyEngine] Error extracting jobs:', e);
      this.stop();
    }
  }

  private async processNextJob() {
    if (!this.isRunning || !this.currentTabId) return;

    if (this.currentIndex >= this.jobLinks.length) {
      console.log('[AutoApplyEngine] Reached end of job list. Paginating...');
      // TODO: Implement pagination by clicking "Next" on the search page
      this.stop();
      return;
    }

    const jobUrl = this.jobLinks[this.currentIndex];
    console.log(`[AutoApplyEngine] Navigating to job ${this.currentIndex + 1}/${this.jobLinks.length}:`, jobUrl);
    
    this.broadcastStatus();

    // Reset state flags for this job
    this.hasTriggeredApplyForCurrentJob = false;
    this.hasTriggeredAutofillForCurrentJob = false;

    // Navigate the tab to the job URL
    await chrome.tabs.update(this.currentTabId, { url: jobUrl });
  }

  async handlePageAnalysis(analysis: any, tabId: number) {
    if (!this.isRunning || tabId !== this.currentTabId) return;

    if (analysis.isApplicationPage && !this.hasTriggeredAutofillForCurrentJob) {
      this.hasTriggeredAutofillForCurrentJob = true;
      setTimeout(async () => {
        if (!this.isRunning) return;
        
        console.log('[AutoApplyEngine] Form detected! Triggering Autofill for job', this.currentIndex + 1);
        
        const settings = await getSettings();
        const profileId = settings.activeProfileId || 'default';
        const mode = settings.automation.defaultMode || 'copilot';

        chrome.tabs.sendMessage(tabId, createMessage('START_AUTOFILL', {
          profileId,
          jobId: 'auto-apply-session',
          mode,
          fieldsToFill: analysis.formFields
        }));
      }, 2000);
    } else if (analysis.isJobListingPage && !analysis.isApplicationPage && !this.hasTriggeredApplyForCurrentJob) {
      this.hasTriggeredApplyForCurrentJob = true;
      setTimeout(async () => {
        if (!this.isRunning) return;
        
        console.log('[AutoApplyEngine] Job page detected. Attempting to click Apply button...');
        chrome.tabs.sendMessage(tabId, { type: 'CLICK_APPLY_BUTTON', payload: {} }, (response) => {
          if (!response || !response.success) {
            console.log('[AutoApplyEngine] Apply button not found yet. Will retry on next DOM mutation.');
            this.hasTriggeredApplyForCurrentJob = false;
          } else {
            console.log('[AutoApplyEngine] Successfully clicked Apply button. Waiting for form to appear...');
            // If the form doesn't appear after 15 seconds, move to next job
            setTimeout(() => {
              if (this.isRunning && this.currentTabId === tabId && !this.hasTriggeredAutofillForCurrentJob) {
                console.log('[AutoApplyEngine] Wait timeout after clicking apply. Moving to next job.');
                this.handleAutofillComplete({ success: false, reason: 'timeout' });
              }
            }, 15000);
          }
        });
      }, 2000);
    }
  }

  async handleAutofillComplete(result: any) {
    if (!this.isRunning) return;
    
    console.log('[AutoApplyEngine] Autofill complete for job', this.currentIndex + 1);
    this.currentIndex++;
    
    setTimeout(() => {
      this.processNextJob();
    }, Math.random() * 2000 + 3000);
  }

  private broadcastStatus() {
    chrome.runtime.sendMessage(createMessage('AUTO_APPLY_STATUS', {
      isRunning: this.isRunning,
      currentJobIndex: this.currentIndex,
      totalJobsFound: this.jobLinks.length,
      jobsApplied: this.currentIndex
    })).catch(() => {});
  }
}

export const autoApplyEngine = new AutoApplyEngine();
