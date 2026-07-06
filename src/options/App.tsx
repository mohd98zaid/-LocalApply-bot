import React, { useState, useEffect } from 'react';
import type { ExtensionSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

import { ProfileManager } from './ProfileManager';
import { AutomationDashboard } from './AutomationDashboard';

// ============================================================
// Options Page App — Settings & Configuration
// src/options/App.tsx
// ============================================================

type Section = 'general' | 'ai' | 'automation' | 'profile' | 'data' | 'about';

export default function OptionsApp() {
  const [section, setSection] = useState<Section>('general');
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} }).then(r => {
      if (r?.success) setSettings(r.data);
    });

    // Check for setup param
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'true') setSection('ai');
  }, []);

  async function saveSettings(updates: Partial<ExtensionSettings>) {
    setIsSaving(true);
    const res = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: updates });
    if (res?.success) {
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setIsSaving(false);
  }

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'ai', label: 'AI & Ollama', icon: '🤖' },
    { id: 'automation', label: 'Auto-Apply', icon: '🚀' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'data', label: 'Data & Privacy', icon: '🔒' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Sidebar */}
      <div style={{
        width: 220,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: '20px 0',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--gradient-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>⚡</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>LocalApply</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Settings</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              style={{
                width: '100%',
                padding: '9px 12px',
                textAlign: 'left',
                background: section === item.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: section === item.id ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: section === item.id ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px', maxWidth: 720, overflowY: 'auto' }}>

        {/* Save notification */}
        {saved && (
          <div style={{
            position: 'fixed', top: 20, right: 20,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            fontSize: 13, fontWeight: 600, color: '#10b981',
            animation: 'fadeIn 0.3s ease',
            zIndex: 100,
          }}>
            ✓ Settings saved
          </div>
        )}

        { section === 'general' && <GeneralSection settings={settings} onSave={saveSettings} isSaving={isSaving} /> }
        { section === 'ai' && <AISection settings={settings} onSave={saveSettings} isSaving={isSaving} /> }
        { section === 'automation' && <AutomationDashboard settings={settings} onSave={saveSettings} /> }
        { section === 'profile' && <ProfileManager /> }
        {section === 'data' && <DataSection settings={settings} onSave={saveSettings} />}
        {section === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

// ---- Section wrapper ----
function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{title}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{desc}</p>
      <div className="divider" />
    </div>
  );
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>{label}</label>
      {desc && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>{desc}</p>}
      {children}
    </div>
  );
}

// ---- General Section ----
function GeneralSection({ settings, onSave, isSaving }: { settings: ExtensionSettings; onSave: (u: Partial<ExtensionSettings>) => void; isSaving: boolean }) {
  return (
    <div>
      <SectionHeader title="General Settings" desc="Configure how LocalApply behaves" />

      <Field label="Theme" desc="Choose the visual theme">
        <select
          className="input"
          value={settings.ui.theme}
          onChange={e => onSave({ ui: { ...settings.ui, theme: e.target.value as 'light' | 'dark' | 'system' } })}
        >
          <option value="system">System (Auto)</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Field>

      <Field label="Default Autofill Mode">
        <select
          className="input"
          value={settings.automation.defaultMode}
          onChange={e => onSave({ automation: { ...settings.automation, defaultMode: e.target.value as 'manual' | 'review' | 'semi_auto' | 'copilot' } })}
        >
          <option value="manual">Manual — suggest only</option>
          <option value="review">Review — fill, then you approve</option>
          <option value="semi_auto">Semi-Auto — fill confident fields</option>
          <option value="copilot">Copilot — fill everything</option>
        </select>
      </Field>

      <Field label="Answer Tone">
        <select
          className="input"
          value={settings.answers.tone}
          onChange={e => onSave({ answers: { ...settings.answers, tone: e.target.value as 'professional' | 'conversational' | 'enthusiastic' } })}
        >
          <option value="professional">Professional</option>
          <option value="conversational">Conversational</option>
          <option value="enthusiastic">Enthusiastic</option>
        </select>
      </Field>

      <Field label="Show Floating Overlay">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id="overlay"
            checked={settings.ui.showFloatingOverlay}
            onChange={e => onSave({ ui: { ...settings.ui, showFloatingOverlay: e.target.checked } })}
          />
          <label htmlFor="overlay" style={{ fontSize: 13 }}>Show action button on job pages</label>
        </div>
      </Field>
    </div>
  );
}

// ---- AI Section ----
function AISection({ settings, onSave, isSaving }: { settings: ExtensionSettings; onSave: (u: Partial<ExtensionSettings>) => void; isSaving: boolean }) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  async function testConnection() {
    setTestStatus('testing');
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA_STATUS', payload: {} });
    if (res?.success && res.data?.connected) {
      setTestStatus('success');
      setOllamaModels(res.data.models?.map((m: { name: string }) => m.name) ?? []);
    } else {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  }

  return (
    <div>
      <SectionHeader title="AI & Ollama Configuration" desc="Configure your local AI settings" />

      {/* Setup guide */}
      <div style={{
        padding: '14px',
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 24,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>🚀 Quick Setup</div>
        <ol style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingLeft: 16, lineHeight: 2 }}>
          <li>Install Ollama from <a href="https://ollama.com" target="_blank" style={{ color: 'var(--color-primary-light)' }}>ollama.com</a></li>
          <li>Run: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 3 }}>ollama pull gemma4:31b-cloud</code></li>
          <li>Run: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 3 }}>ollama pull nomic-embed-text</code></li>
          <li>Set CORS (Windows): <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>setx OLLAMA_ORIGINS "chrome-extension://*" /M</code></li>
          <li>Restart Ollama and click "Test Connection" below</li>
        </ol>
      </div>

      <Field label="Ollama URL" desc="Local Ollama server URL (default: http://localhost:11434)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={settings.ai.ollamaUrl}
            onChange={e => onSave({ ai: { ...settings.ai, ollamaUrl: e.target.value } })}
            placeholder="http://localhost:11434"
            style={{ flex: 1 }}
          />
          <button
            className={`btn-${testStatus === 'success' ? 'primary' : 'secondary'}`}
            onClick={testConnection}
            disabled={testStatus === 'testing'}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {testStatus === 'idle' && '🔌 Test'}
            {testStatus === 'testing' && '⟳ Testing...'}
            {testStatus === 'success' && '✓ Connected!'}
            {testStatus === 'error' && '✗ Failed'}
          </button>
        </div>
      </Field>

      <Field label="Primary AI Model" desc="Used for resume parsing, cover letters, and Q&A">
        <select
          className="input"
          value={settings.ai.primaryModel}
          onChange={e => onSave({ ai: { ...settings.ai, primaryModel: e.target.value } })}
        >
          {ollamaModels.length > 0 ? (
            ollamaModels.map(m => <option key={m} value={m}>{m}</option>)
          ) : (
            <>
              <option value="gemma4:31b-cloud">gemma4:31b-cloud (Recommended)</option>
              <option value="gemma4:12b">gemma4:12b (Lighter)</option>
              <option value="qwen3:8b">qwen3:8b (Fast)</option>
              <option value="qwen3:14b">qwen3:14b (High quality)</option>
              <option value="phi4:14b">phi4:14b (Lightweight)</option>
              <option value="llama4:scout">llama4:scout (Long context)</option>
            </>
          )}
        </select>
      </Field>

      <Field label="Embedding Model" desc="Used for semantic search and RAG memory">
        <select
          className="input"
          value={settings.ai.embeddingModel}
          onChange={e => onSave({ ai: { ...settings.ai, embeddingModel: e.target.value } })}
        >
          <option value="nomic-embed-text">nomic-embed-text (Recommended)</option>
          <option value="mxbai-embed-large">mxbai-embed-large</option>
          <option value="bge-m3">bge-m3 (Multilingual)</option>
          <option value="all-minilm">all-minilm (Lightweight)</option>
        </select>
      </Field>

      <Field label="Response Temperature" desc="Higher = more creative, lower = more precise">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.ai.temperature}
            onChange={e => onSave({ ai: { ...settings.ai, temperature: parseFloat(e.target.value) } })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 30, fontWeight: 600, color: 'var(--color-primary-light)' }}>
            {settings.ai.temperature.toFixed(2)}
          </span>
        </div>
      </Field>
    </div>
  );
}

// ---- Data Section ----
function DataSection({ settings, onSave }: { settings: ExtensionSettings; onSave: (u: Partial<ExtensionSettings>) => void }) {
  async function exportData() {
    const { exportAllData } = await import('../storage/indexedDB');
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localapply-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const { importData } = await import('../storage/indexedDB');
      await importData(data);
      alert('Data imported successfully! The page will now reload.');
      window.location.reload();
    } catch (err) {
      alert('Error importing data. Make sure it is a valid JSON file.');
      console.error(err);
    }
  }

  async function clearAllData() {
    if (!confirm('⚠️ This will delete ALL your LocalApply data (profiles, resumes, applications). Are you sure?')) return;
    const { clearAllData: clear } = await import('../storage/indexedDB');
    await clear();
    alert('All data cleared');
  }

  return (
    <div>
      <SectionHeader title="Data & Privacy" desc="Your data never leaves your computer" />

      <div style={{
        padding: '14px',
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 24,
        fontSize: 12,
        color: 'var(--color-text-muted)',
        lineHeight: 1.7,
      }}>
        🔒 <strong style={{ color: '#10b981' }}>Privacy First.</strong> All your data is stored locally in your browser.
        AI inference runs on your own Ollama installation. Nothing is sent to external servers.
      </div>

      <Field label="Encrypt Local Data" desc="Encrypt stored profile data (slower but more secure)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id="encrypt"
            checked={settings.privacy.encryptLocalData}
            onChange={e => onSave({ privacy: { ...settings.privacy, encryptLocalData: e.target.checked } })}
          />
          <label htmlFor="encrypt" style={{ fontSize: 13 }}>Enable data encryption at rest</label>
        </div>
      </Field>

      <div className="divider" />

      <Field label="Import / Export Your Data">
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-secondary" onClick={exportData} style={{ flex: 1 }}>
            📥 Export (JSON)
          </button>
          
          <label className="btn-secondary" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', margin: 0, display: 'inline-block' }}>
            📤 Import (JSON)
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </Field>

      <Field label="Clear All Data" desc="Permanently delete all stored profiles, resumes, and applications">
        <button
          onClick={clearAllData}
          style={{
            width: '100%', padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}
        >
          🗑️ Delete All Local Data
        </button>
      </Field>
    </div>
  );
}

// ---- About Section ----
function AboutSection() {
  return (
    <div>
      <SectionHeader title="About LocalApply" desc="Open-source, privacy-first AI job application assistant" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { label: 'Version', value: '0.1.0 (Beta)' },
          { label: 'License', value: 'MIT' },
          { label: 'AI Runtime', value: 'Ollama (local)' },
          { label: 'Data Storage', value: '100% Local (IndexedDB)' },
          { label: 'External Services', value: 'None — zero telemetry' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{label}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Open source and community driven
        </div>
        <button
          className="btn-primary"
          onClick={() => chrome.tabs.create({ url: 'https://github.com/localapply/localapply' })}
          style={{ margin: '0 auto' }}
        >
          ⭐ Star on GitHub
        </button>
      </div>
    </div>
  );
}
