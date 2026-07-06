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

  // Watch for SPA navigation (hash/pushState changes)
  const observer = new MutationObserver(debounce(async () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      await analyzePage();
    }
  }, 1500));

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
  chrome.runtime.sendMessage({
    type: 'PAGE_ANALYSIS_RESULT',
    payload: analysis,
    timestamp: new Date().toISOString(),
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
