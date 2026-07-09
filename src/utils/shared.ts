// ============================================================
// Shared Utilities — used across background, content, and UI
// src/utils/shared.ts
// ============================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: safely send message to content script, injecting if needed
export async function sendToContentScript(tabId: number, message: unknown): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script not injected — try to inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/index.ts'],
      });
      await sleep(300);
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }
}
