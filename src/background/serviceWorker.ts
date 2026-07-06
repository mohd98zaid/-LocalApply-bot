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
  messageRouter.handle(message, sender, sendResponse);
  return true; // Keep channel open for async responses
});

// ---- Side Panel ----

// Enable side panel on all tabs by default
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => { /* Side panel API may not be available */ });

// ---- Tab Events ----

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  // Update badge if on a supported job site
  const supportedSites = [
    'linkedin.com/jobs',
    'indeed.com',
    'greenhouse.io',
    'lever.co',
    'myworkdayjobs.com',
    'ashbyhq.com',
    'bamboohr.com',
    'smartrecruiters.com',
    'jobvite.com',
    'wellfound.com',
    'naukri.com',
  ];

  const isJobSite = supportedSites.some(site => tab.url!.includes(site));
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

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

async function startHealthCheck() {
  const settings = await getSettings();
  const client = getOllamaClient(settings.ai.ollamaUrl);

  // Broadcast status
  async function checkAndBroadcast() {
    const status = await client.getStatus();
    // Store in session for quick access
    await storageSet('ollama_status', status, 'session');
  }

  await checkAndBroadcast();

  // Check every 30 seconds
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  healthCheckInterval = setInterval(checkAndBroadcast, 30000);
}

// Start health check when SW wakes up
startHealthCheck().catch(console.error);

// Keep Service Worker alive during streaming (MV3 workaround)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {
      // Port disconnected — SW can sleep
    });
  }
});

console.log('[LocalApply] Background Service Worker started');
