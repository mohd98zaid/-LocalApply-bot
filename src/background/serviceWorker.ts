// ============================================================
// Service Worker — Background Script Entry Point
// src/background/serviceWorker.ts
// ============================================================

// ---- DOM Mocks for Vite Preload Helper ----
// Vite's dynamic import helper expects a browser environment.
// These stubs prevent "window/document is not defined" errors when the SW loads.
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({ relList: {} }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    head: { appendChild: () => {} }
  };
}
if (typeof globalThis.Event === 'undefined') {
  (globalThis as any).Event = class Event {
    defaultPrevented = false;
    constructor(public type: string, public options?: any) {}
  };
}

import { messageRouter } from './messageRouter';
import { getOllamaClient } from '../ai/ollama/client';
import { getSettings, setBadge, clearTabAnalysis, storageSet } from '../storage/chromeStorage';

// ---- Lifecycle ----

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[LocalApply] Extension installed');
    // Open options page for first-time setup
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') + '?setup=true' });
  }

  if (details.reason === 'update') {
    console.log('[LocalApply] Extension updated to', chrome.runtime.getManifest().version);
  }
});

// ---- Message Router ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages meant for the offscreen document to avoid listener collision
  if (message.type === 'PARSE_RESUME_FILE') {
    return false;
  }

  // Handle async response — catch sync throws to prevent channel hang
  try {
    messageRouter.handle(message, sender, sendResponse).catch(err => {
      sendResponse({ success: false, error: String(err) });
    });
  } catch (err) {
    sendResponse({ success: false, error: String(err) });
  }

  return true; // Keep channel open for async responses
});

// ---- Side Panel ----

// Enable side panel on all tabs by default
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => { /* Side panel API may not be available */ });

// ---- Tab Events ----

// Domains where we show the badge (cosmetic — content script runs everywhere via <all_urls>)
const BADGE_DOMAINS = [
  'linkedin.com', 'indeed.com', 'greenhouse.io', 'lever.co',
  'myworkdayjobs.com', 'ashbyhq.com', 'bamboohr.com',
  'smartrecruiters.com', 'jobvite.com', 'wellfound.com', 'naukri.com',
  'workday.com', 'icims.com', 'taleo.net', 'successfactors.com',
];

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const url = tab.url;
  const isJobSite = BADGE_DOMAINS.some(d => url.includes(d));

  if (isJobSite) {
    await setBadge('✓', '#6366f1');
  } else {
    await setBadge('');
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Clean up session data for closed tab
  await clearTabAnalysis(tabId);
});

// ---- Periodic Ollama Health Check ----

const HEALTH_CHECK_ALARM = 'ollama-health-check';

async function runHealthCheck() {
  try {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const status = await client.getStatus();
    await storageSet('ollama_status', status, 'session');
  } catch (e) {
    console.warn('[LocalApply] Health check failed:', e);
  }
}

// Use chrome.alarms instead of setInterval — survives SW sleep
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTH_CHECK_ALARM) {
    runHealthCheck();
  }
});

// ponytail: Always create alarm — if health check fails, we still want periodic retries
chrome.alarms.create(HEALTH_CHECK_ALARM, { periodInMinutes: 1 });
runHealthCheck().catch(console.error);

// Keep Service Worker alive during streaming (MV3 workaround)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {
      // Port disconnected — SW can sleep
    });
  }
});

console.log('[LocalApply] Background Service Worker started');
