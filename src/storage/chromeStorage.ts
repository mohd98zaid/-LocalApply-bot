// ============================================================
// chrome.storage wrapper — settings, profile, session data
// src/storage/chromeStorage.ts
// ============================================================

import { DEFAULT_SETTINGS, type ExtensionSettings } from '../types/settings';

type StorageArea = 'local' | 'session';

function getStorage(area: StorageArea = 'local') {
  return area === 'session' ? chrome.storage.session : chrome.storage.local;
}

// ---- Generic typed get/set ----

export async function storageGet<T>(
  key: string,
  defaultValue: T,
  area: StorageArea = 'local'
): Promise<T> {
  const result = await getStorage(area).get(key);
  return (result[key] as T) ?? defaultValue;
}

export async function storageSet<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<void> {
  await getStorage(area).set({ [key]: value });
}

export async function storageRemove(key: string, area: StorageArea = 'local'): Promise<void> {
  await getStorage(area).remove(key);
}

export async function storageClear(area: StorageArea = 'local'): Promise<void> {
  await getStorage(area).clear();
}

// ---- Settings ----

export const SETTINGS_KEY = 'localapply_settings';

export async function getSettings(): Promise<ExtensionSettings> {
  const saved = await storageGet<Partial<ExtensionSettings>>(SETTINGS_KEY, {});
  return mergeSettings(DEFAULT_SETTINGS, saved);
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = mergeSettings(current, settings);
  merged.lastUpdated = new Date().toISOString();
  await storageSet(SETTINGS_KEY, merged);
  return merged;
}

function mergeSettings(base: ExtensionSettings, override: Partial<ExtensionSettings>): ExtensionSettings {
  return {
    ...base,
    ...override,
    ai: { ...base.ai, ...(override.ai ?? {}) },
    automation: { ...base.automation, ...(override.automation ?? {}) },
    privacy: { ...base.privacy, ...(override.privacy ?? {}), telemetry: false },
    ui: { ...base.ui, ...(override.ui ?? {}) },
    answers: { ...base.answers, ...(override.answers ?? {}) },
  };
}

// ---- Session data (per-tab, cleared on browser close) ----

export const SESSION_TAB_KEY = 'tab_analysis';

export async function saveTabAnalysis(tabId: number, data: unknown): Promise<void> {
  const all = await storageGet<Record<number, unknown>>(SESSION_TAB_KEY, {}, 'session');
  all[tabId] = data;
  await storageSet(SESSION_TAB_KEY, all, 'session');
}

export async function getTabAnalysis<T>(tabId: number): Promise<T | null> {
  const all = await storageGet<Record<number, T>>(SESSION_TAB_KEY, {}, 'session');
  return all[tabId] ?? null;
}

export async function clearTabAnalysis(tabId: number): Promise<void> {
  const all = await storageGet<Record<number, unknown>>(SESSION_TAB_KEY, {}, 'session');
  delete all[tabId];
  await storageSet(SESSION_TAB_KEY, all, 'session');
}

// ---- Badge management ----

export async function setBadge(text: string, color: string = '#6366f1'): Promise<void> {
  if (chrome.action) {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  }
}

export async function clearBadge(): Promise<void> {
  if (chrome.action) {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// ---- Storage usage ----

export async function getStorageUsage(): Promise<{ used: number; quota: number; percentage: number }> {
  const used = await chrome.storage.local.getBytesInUse();
  const quota = chrome.storage.local.QUOTA_BYTES ?? 10 * 1024 * 1024;
  return { used, quota, percentage: (used / quota) * 100 };
}

// ---- Change listeners ----

type StorageChangeCallback = (changes: chrome.storage.StorageChange, key: string) => void;
const listeners: Map<string, StorageChangeCallback[]> = new Map();

export function onStorageChange(key: string, callback: StorageChangeCallback): () => void {
  if (!listeners.has(key)) listeners.set(key, []);
  listeners.get(key)!.push(callback);

  const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[key]) callback(changes[key], key);
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
