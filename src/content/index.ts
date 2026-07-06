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
  }, 1000));

  observer.observe(document.body, { childList: true, subtree: true });
}

let lastUrl = window.location.href;

async function analyzePage() {
  if (!detector) return;

  const analysis = await detector.analyzePage(document);

  if (analysis.isApplicationPage || analysis.isJobListingPage) {
    overlay?.show(analysis);
  } else {
    overlay?.hide();
  }

  // Send to background service worker
  // Send to background service worker and catch context errors
  chrome.runtime.sendMessage({
    type: 'PAGE_ANALYSIS_RESULT',
    payload: analysis,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    // Ignore "Extension context invalidated" errors for orphaned content scripts
  });
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
      const { AutofillOrchestrator } = await import('./formEngine/filler');
      const orchestrator = new AutofillOrchestrator();
      return orchestrator.start(message.payload as Parameters<typeof orchestrator.start>[0]);
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
        const anchors = document.querySelectorAll<HTMLAnchorElement>('a.job-card-container__link, a.base-card__full-link');
        links = Array.from(anchors).map(a => a.href.split('?')[0]);
      } else if (portal === 'naukri') {
        const anchors = document.querySelectorAll<HTMLAnchorElement>('a.title');
        links = Array.from(anchors).map(a => a.href);
      }
      
      // Deduplicate
      links = [...new Set(links)];
      return { success: true, links };
    }

    case 'CLICK_APPLY_BUTTON': {
      // Find and click the apply button
      const applySelectors = [
        '.jobs-apply-button--top-card', // LinkedIn Easy Apply (top card)
        '[data-control-name="jobdetails_topcard_inapply"]', // LinkedIn alternative
        'button.jobs-apply-button', // LinkedIn generic
        'button.apply-message', // Naukri apply button
        'button.apply-button',
        '[data-automation-id="applyNowButton"]', // Workday
        'a[data-mapped="true"]' // Greenhouse / Lever
      ];
      
      let clicked = false;
      for (const selector of applySelectors) {
        const btn = document.querySelector<HTMLElement>(selector);
        if (btn) {
          btn.click();
          clicked = true;
          break;
        }
      }
      
      // If we couldn't find a specific button, try finding a button that contains "Apply" text
      if (!clicked) {
        const buttons = document.querySelectorAll('button, a.button, a.btn');
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText.toLowerCase();
          if (text === 'apply' || text === 'apply now' || text === 'easy apply') {
            (btn as HTMLElement).click();
            clicked = true;
            break;
          }
        }
      }
      
      return { success: clicked };
    }

    case 'GET_PAGE_DATA':
      return await detector?.analyzePage(document);

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
