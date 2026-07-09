import React, { useState, useEffect } from 'react';
import type { OllamaStatus } from '../types/ai';
import type { PageAnalysis } from '../types/messages';
import { AnswerReviewPanel } from './components/AnswerReviewPanel';

// ============================================================
// Side Panel App — Main UI
// src/sidepanel/App.tsx
// ============================================================

type TabId = 'analyze' | 'autofill' | 'answers' | 'cover' | 'tracker' | 'profile';

export default function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<TabId>('analyze');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [pageAnalysis, setPageAnalysis] = useState<PageAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check Ollama on mount
    checkOllamaStatus();

    // Load stored analysis for current tab
    loadCurrentTabAnalysis();

    // Listen for messages from background
    const listener = (message: { type: string; payload: unknown }) => {
      if (message.type === 'PAGE_ANALYSIS_RESULT') {
        setPageAnalysis(message.payload as PageAnalysis);
      }
      if (message.type === 'OLLAMA_STATUS') {
        setOllamaStatus(message.payload as OllamaStatus);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function loadCurrentTabAnalysis() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // First try to get a fresh analysis by asking the content script
      const freshAnalysis = await chrome.runtime.sendMessage({
        type: 'GET_PAGE_DATA',
        payload: { tabId: tab.id },
      }).catch(() => null);

      if (freshAnalysis?.data) {
        setPageAnalysis(freshAnalysis.data as PageAnalysis);
        return;
      }

      // Fallback to stored analysis
      const stored = await chrome.runtime.sendMessage({
        type: 'GET_TAB_ANALYSIS',
        payload: { tabId: tab.id },
      }).catch(() => null);

      if (stored?.data) {
        setPageAnalysis(stored.data as PageAnalysis);
      }
    } catch {}
  }

  async function checkOllamaStatus() {
    setIsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA_STATUS', payload: {} });
      if (response?.success) setOllamaStatus(response.data as OllamaStatus);
    } catch {
      // ponytail: SW may be killed — silently handle
    }
    setIsLoading(false);
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'analyze', label: 'Job', icon: '🎯' },
    { id: 'autofill', label: 'Fill', icon: '✍️' },
    { id: 'answers', label: 'Q&A', icon: '🤖' },
    { id: 'cover', label: 'Cover', icon: '📝' },
    { id: 'tracker', label: 'Track', icon: '📊' },
    { id: 'profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--color-bg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Header ollamaStatus={ollamaStatus} onRefresh={checkOllamaStatus} />

      {/* Tab Bar */}
      <div style={{ padding: '8px 12px 0' }}>
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
            >
              <span style={{ marginRight: '3px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {!ollamaStatus?.connected && !isLoading ? (
          <OllamaSetupBanner onRetry={checkOllamaStatus} />
        ) : null}

        {activeTab === 'analyze' && <AnalyzeTab pageAnalysis={pageAnalysis} ollamaStatus={ollamaStatus} />}
        {activeTab === 'autofill' && <AutofillTab pageAnalysis={pageAnalysis} />}
        {activeTab === 'answers' && <AnswerReviewPanel pageAnalysis={pageAnalysis} />}
        {activeTab === 'cover' && <CoverLetterTab pageAnalysis={pageAnalysis} />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </div>
    </div>
  );
}

// ---- Header ----
function Header({ ollamaStatus, onRefresh }: { ollamaStatus: OllamaStatus | null; onRefresh: () => void }) {
  return (
    <div style={{
      padding: '12px 14px 10px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--color-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>⚡</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>LocalApply</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>AI Job Copilot</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {ollamaStatus && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 8px',
            background: ollamaStatus.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: '100px',
            border: `1px solid ${ollamaStatus.connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: ollamaStatus.connected ? '#10b981' : '#ef4444',
              ...(ollamaStatus.connected ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}),
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: ollamaStatus.connected ? '#10b981' : '#ef4444' }}>
              {ollamaStatus.connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        )}
        <button className="btn-ghost" onClick={onRefresh} style={{ fontSize: 16, padding: '4px 6px' }}>⟳</button>
      </div>
    </div>
  );
}

// ---- Ollama Setup Banner ----
function OllamaSetupBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      padding: '14px',
      borderRadius: 'var(--radius-lg)',
      background: 'rgba(239, 68, 68, 0.08)',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      marginBottom: '12px',
    }} className="animate-fade-in">
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#ef4444' }}>
        ⚠️ Ollama Not Connected
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        LocalApply requires Ollama running locally. Make sure:
        <ol style={{ marginTop: 6, paddingLeft: 16 }}>
          <li>Ollama is installed and running</li>
          <li>Run: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 3 }}>
            ollama pull gemma4:31b-cloud
          </code></li>
          <li>Set CORS: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>
            OLLAMA_ORIGINS=chrome-extension://*
          </code></li>
        </ol>
      </div>
      <button className="btn-primary" onClick={onRetry} style={{ width: '100%', justifyContent: 'center' }}>
        Retry Connection
      </button>
    </div>
  );
}

// ---- Analyze Tab ----
function AnalyzeTab({ pageAnalysis, ollamaStatus }: { pageAnalysis: PageAnalysis | null; ollamaStatus: OllamaStatus | null }) {
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function analyzeCurrentPage() {
    setIsAnalyzing(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // ponytail: ANALYZE_PAGE is fire-and-forget — result arrives via PAGE_ANALYSIS_RESULT
      chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE', payload: { tabId: tab.id } }).catch(() => {});
    }
    // Reset after a reasonable timeout since we can't await the actual completion
    setTimeout(() => setIsAnalyzing(false), 5000);
  }

  const ats = pageAnalysis?.ats;
  const isJobPage = pageAnalysis?.isJobListingPage || pageAnalysis?.isApplicationPage;
  const isSearchPage = pageAnalysis?.isSearchPage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Current page status */}
      <div className="glass-card" style={{ padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Current Page
          </span>
          {ats && (
            <span className={`badge ${ats.detected ? 'badge-success' : 'badge-neutral'}`}>
              {ats.detected ? ats.atsName : 'Unknown'}
            </span>
          )}
        </div>

        {isJobPage ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>
              {pageAnalysis?.jobDescription?.title ?? 'Job Detected'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {pageAnalysis?.jobDescription?.company?.name}
              {pageAnalysis?.jobDescription?.location && ` · ${pageAnalysis.jobDescription.location}`}
            </div>
            {/* Show guidance based on page type */}
            {pageAnalysis?.isApplicationPage ? (
              <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: 11, color: '#818cf8' }}>
                Application form detected — ready to autofill
              </div>
            ) : (
              <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: 11, color: '#f59e0b' }}>
                Click the Apply button on the page to open the application form
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            Navigate to a job application page to get started
          </div>
        )}
      </div>

      {/* Match Score */}
      {isJobPage && (
        <div className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Resume Match Score
          </div>

          {matchScore !== null ? (
            <MatchScoreRing score={matchScore} />
          ) : (
            <div>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-surface-2)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--color-text-muted)' }}>
                ?
              </div>
              <button
                className="btn-primary"
                onClick={() => setMatchScore(Math.floor(Math.random() * 40) + 55)} // Demo
                disabled={!ollamaStatus?.connected || isAnalyzing}
                style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              >
                {isAnalyzing ? '⟳ Analyzing...' : '🎯 Analyze Match'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Auto-Apply Controller (Search Pages) */}
      {isSearchPage && (
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Search Page Automation
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            LocalApply can automatically parse jobs in this search list and apply to them on your behalf.
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) {
                  const url = tab.url || '';
                  const portal = url.includes('linkedin') ? 'linkedin' : url.includes('naukri') ? 'naukri' : 'universal';
                  chrome.runtime.sendMessage({
                    type: 'START_AUTO_APPLY_LOOP',
                    payload: { portal, tabId: tab.id }
                  });
                }
              });
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            🚀 Start Auto-Apply Loop
          </button>
        </div>
      )}

      {/* Fields detected */}
      {pageAnalysis?.isApplicationPage && (
        <div className="glass-card" style={{ padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Form Fields
            </span>
            <span className="badge badge-info">{pageAnalysis.formFields.length} detected</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {pageAnalysis.questions.length} questions detected
          </div>
        </div>
      )}

      {/* Global Job Search (Always visible) */}
      <div className="glass-card" style={{ padding: '14px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Find & Auto-Apply
        </div>
        <div style={{ marginBottom: 10 }}>
          <input 
            type="text" 
            className="input" 
            placeholder="e.g. React Developer" 
            style={{ width: '100%', marginBottom: '8px', boxSizing: 'border-box' }}
            id="job-search-input"
          />
          <select className="input" style={{ width: '100%', boxSizing: 'border-box' }} id="job-portal-select">
            <option value="linkedin">LinkedIn</option>
            <option value="naukri">Naukri</option>
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            const keyword = (document.getElementById('job-search-input') as HTMLInputElement).value;
            const portal = (document.getElementById('job-portal-select') as HTMLSelectElement).value;
            if (!keyword) return alert('Enter a keyword');
            
            let url = '';
            if (portal === 'linkedin') {
              url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}`;
            } else if (portal === 'naukri') {
              url = `https://www.naukri.com/${keyword.replace(/\s+/g, '-')}-jobs`;
            }
            
            chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
              if (tab?.id) {
                chrome.tabs.update(tab.id, { url });
              }
            });
          }}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          🔍 Search & Start Auto-Apply
        </button>
      </div>

      {/* Analyze button */}
      <button
        className="btn-secondary"
        onClick={analyzeCurrentPage}
        disabled={isAnalyzing}
        style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
      >
        {isAnalyzing ? '⟳ Scanning page...' : '🔍 Re-analyze Page'}
      </button>
    </div>
  );
}

// ---- Match Score Ring ----
function MatchScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={radius} fill="none" stroke="var(--color-surface-2)" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={radius} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${color})` }}
        />
        <text x={50} y={50} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 20, fontWeight: 700, fill: color, fontFamily: 'Inter' }}>
          {score}
        </text>
        <text x={50} y={65} textAnchor="middle"
          style={{ fontSize: 9, fill: 'var(--color-text-muted)', fontFamily: 'Inter' }}>
          /100
        </text>
      </svg>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>
        {score >= 75 ? '✓ Strong Match' : score >= 50 ? '⚠ Partial Match' : '✗ Weak Match'}
      </span>
    </div>
  );
}

// ---- Autofill Tab ----
function AutofillTab({ pageAnalysis }: { pageAnalysis: PageAnalysis | null }) {
  const [fillMode, setFillMode] = useState<'review' | 'copilot'>('copilot');
  const [isFilling, setIsFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState<{ filled: number; total: number } | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [detectedFields, setDetectedFields] = useState(pageAnalysis?.formFields.length ?? 0);

  async function startAutofill() {
    setIsFilling(true);
    setScanStatus('scanning');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setIsFilling(false); setScanStatus('idle'); return; }

    // Step 1: Scan the page DOM directly — no content script needed
    let fieldsToFill: import('../types/adapter').FormField[] = [];

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Find ALL fillable elements on the page
          const elements = document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
          );
          const fields: { label: string; type: string; selector: string; required: boolean; options?: string[] }[] = [];

          for (const el of elements) {
            const input = el as HTMLInputElement;
            // Build a stable selector
            let selector = '';
            if (input.id) selector = `#${CSS.escape(input.id)}`;
            else if (input.name) selector = `[name="${CSS.escape(input.name)}"]`;
            else {
              // Build path selector
              const path: string[] = [];
              let node: HTMLElement | null = input;
              while (node && node !== document.body) {
                let s = node.tagName.toLowerCase();
                if (node.className) {
                  const classes = Array.from(node.classList).slice(0, 2).join('.');
                  if (classes) s += `.${classes}`;
                }
                path.unshift(s);
                node = node.parentElement;
              }
              selector = path.join(' > ');
            }

            // Find label
            let label = input.getAttribute('aria-label') ?? '';
            if (!label && input.id) {
              const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
              if (labelEl) label = (labelEl as HTMLElement).innerText.trim().replace('*', '').trim();
            }
            if (!label) {
              const parentLabel = input.closest('label');
              if (parentLabel) {
                const clone = parentLabel.cloneNode(true) as HTMLElement;
                clone.querySelectorAll('input, select, textarea').forEach(e => e.remove());
                label = (clone as HTMLElement).innerText.trim();
              }
            }
            if (!label) label = input.placeholder ?? input.name ?? '';
            if (!label) continue;

            // Map label to profile field
            const lower = label.toLowerCase().replace(/[*:]/g, '').trim();
            let mappedField = '';
            if (/^first.?name$/.test(lower)) mappedField = 'contact.firstName';
            else if (/^last.?name$/.test(lower)) mappedField = 'contact.lastName';
            else if (/^full.?name$|^name$/.test(lower)) mappedField = 'contact.fullName';
            else if (/^e-?mail$/.test(lower)) mappedField = 'contact.email';
            else if (/^phone$|^mobile$|^telephone$/.test(lower)) mappedField = 'contact.phone';
            else if (/^city$/.test(lower)) mappedField = 'contact.location.city';
            else if (/^state$|^province$/.test(lower)) mappedField = 'contact.location.state';
            else if (/^country$/.test(lower)) mappedField = 'contact.location.country';
            else if (/^zip|^postal|^pin/.test(lower)) mappedField = 'contact.location.zipCode';
            else if (/linkedin/.test(lower)) mappedField = 'contact.linkedin';
            else if (/github/.test(lower)) mappedField = 'contact.github';
            else if (/website|^portfolio$/.test(lower)) mappedField = 'contact.portfolio';
            else if (/salary|^compensation$|pay.?expect/.test(lower)) mappedField = 'workPreferences.salaryExpectation.max';
            else if (/notice.?period/.test(lower)) mappedField = 'workPreferences.noticePeriod';
            else if (/visa|^sponsorship$/.test(lower)) mappedField = 'workPreferences.requiresVisaSponsorship';
            else if (/relocat/.test(lower)) mappedField = 'workPreferences.willingToRelocate';
            else if (/years?.?of.?exp|^experience$/.test(lower)) mappedField = 'experience.yearsTotal';
            else if (/^job.?title$|^position$|^title$/.test(lower)) mappedField = 'experience.currentTitle';
            else if (/^company$|^employer$/.test(lower)) mappedField = 'experience.currentCompany';
            else if (/^degree$|^education/.test(lower)) mappedField = 'education.degree';
            else if (/^university$|^school$|^institution$/.test(lower)) mappedField = 'education.institution';

            // Get options for selects
            let options: string[] | undefined;
            if (input.tagName === 'SELECT') {
              options = Array.from((input as unknown as HTMLSelectElement).options).map(o => o.text.trim());
            }

            fields.push({
              label,
              type: input.tagName === 'SELECT' ? 'select' : input.type ?? 'text',
              selector,
              required: input.required,
              options,
            });
          }
          return fields;
        },
      });

      if (results?.[0]?.result) {
        const rawFields = results[0].result as { label: string; type: string; selector: string; required: boolean; options?: string[] }[];
        fieldsToFill = rawFields.map(f => ({
          id: `field-${Math.random().toString(36).slice(2, 9)}`,
          elementSelector: f.selector,
          type: f.type as import('../types/adapter').FieldType,
          label: f.label,
          required: f.required,
          disabled: false,
          confidence: f.options ? 0.8 : 0,
          options: f.options,
          mappedProfileField: undefined, // will be resolved by filler
        }));
      }
    } catch (e) {
      console.warn('[SidePanel] DOM scan failed:', e);
    }

    setDetectedFields(fieldsToFill.length);
    setScanStatus('done');
    setFillProgress({ filled: 0, total: fieldsToFill.length });

    if (fieldsToFill.length === 0) {
      setIsFilling(false);
      return;
    }

    // Step 2: Resolve profileId
    const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} }).catch(() => null);
    let profileId = settingsResp?.data?.activeProfileId;

    if (!profileId) {
      const profilesResp = await chrome.runtime.sendMessage({ type: 'GET_ALL_PROFILES', payload: {} }).catch(() => null);
      const profiles = profilesResp?.data;
      if (Array.isArray(profiles) && profiles.length > 0) {
        profileId = profiles[0].id;
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          payload: { activeProfileId: profileId },
        }).catch(() => {});
      }
    }

    if (!profileId) {
      alert('Please set up your profile first in Settings');
      setIsFilling(false);
      setScanStatus('idle');
      return;
    }

    // Step 3: Send autofill command
    await chrome.runtime.sendMessage({
      type: 'START_AUTOFILL',
      payload: {
        profileId,
        jobId: 'current',
        mode: fillMode,
        fieldsToFill,
        tabId: tab.id,
      },
    }).catch(() => {});

    setIsFilling(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Mode selector */}
      <div className="glass-card" style={{ padding: '12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
          Fill Mode
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'review' as const, label: '🔍 Review Mode', desc: 'Review before filling' },
            { id: 'copilot' as const, label: '⚡ Copilot Mode', desc: 'Fill instantly' },
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setFillMode(mode.id)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 'var(--radius-md)',
                background: fillMode === mode.id ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface-2)',
                border: `1px solid ${fillMode === mode.id ? 'rgba(99, 102, 241, 0.5)' : 'var(--color-border)'}`,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: fillMode === mode.id ? 'var(--color-primary-light)' : 'var(--color-text)' }}>
                {mode.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Status card — always show, no gating */}
      <div className="glass-card" style={{ padding: '12px' }}>
        {scanStatus === 'scanning' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Scanning page for form fields...</div>
          </div>
        ) : detectedFields > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Fields Detected</span>
              <span className="badge badge-info">{detectedFields} fields</span>
            </div>
            {isFilling && fillProgress && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${fillProgress.total > 0 ? (fillProgress.filled / fillProgress.total) * 100 : 0}%`,
                    background: 'var(--gradient-brand)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {fillProgress.filled} / {fillProgress.total} filled
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Click below to scan this page for fillable fields
            </div>
          </div>
        )}
      </div>

      {/* Autofill button — always enabled */}
      <button
        className="btn-primary"
        onClick={startAutofill}
        disabled={isFilling}
        style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
      >
        {isFilling ? '⟳ Filling...' : '✍️ Start Autofill'}
      </button>

      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
        Works on any page with form fields
      </div>
    </div>
  );
}

// ---- Cover Letter Tab ----
function CoverLetterTab({ pageAnalysis }: { pageAnalysis: PageAnalysis | null }) {
  const [tone, setTone] = useState<'professional' | 'conversational' | 'enthusiastic'>('professional');
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  async function generateCoverLetter() {
    setIsGenerating(true);
    setGeneratedLetter('');

    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} }).catch(() => null);
    const profileId = settings?.data?.activeProfileId;

    if (!profileId) {
      alert('Please set up your profile first');
      setIsGenerating(false);
      return;
    }

    // For demo — stream response
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_COVER_LETTER',
      payload: { profileId, jobId: 'current', tone },
    }).catch(() => null);

    if (response?.success && response.data?.coverLetter) {
      setGeneratedLetter(response.data.coverLetter);
    }

    setIsGenerating(false);
  }

  const tones = [
    { id: 'professional' as const, label: '🎩 Professional' },
    { id: 'conversational' as const, label: '💬 Conversational' },
    { id: 'enthusiastic' as const, label: '🔥 Enthusiastic' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tone selector */}
      <div className="glass-card" style={{ padding: '12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
          Tone
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tones.map(t => (
            <button
              key={t.id}
              onClick={() => setTone(t.id)}
              style={{
                flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 500,
                borderRadius: 'var(--radius-sm)',
                background: tone === t.id ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface-2)',
                border: `1px solid ${tone === t.id ? 'rgba(99, 102, 241, 0.5)' : 'var(--color-border)'}`,
                color: tone === t.id ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        className="btn-primary"
        onClick={generateCoverLetter}
        disabled={isGenerating || !pageAnalysis?.jobDescription}
        style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
      >
        {isGenerating ? '⟳ Generating...' : '📝 Generate Cover Letter'}
      </button>

      {/* Generated letter */}
      {generatedLetter && (
        <div className="glass-card animate-fade-in" style={{ padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Generated Letter</span>
            <button
              className="btn-ghost"
              onClick={() => navigator.clipboard.writeText(generatedLetter)}
              style={{ fontSize: 11 }}
            >
              📋 Copy
            </button>
          </div>
          <div style={{
            fontSize: 12, lineHeight: 1.7,
            color: 'var(--color-text-muted)',
            maxHeight: 300, overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {generatedLetter}
          </div>
        </div>
      )}

      {!pageAnalysis?.jobDescription && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>
          Navigate to a job listing to generate a tailored cover letter
        </div>
      )}
    </div>
  );
}

// ---- Tracker Tab ----
function TrackerTab() {
  const [apps, setApps] = useState<{ id: string; job: { parsed: { title: string; company: { name: string } } }; status: string; createdAt: string }[]>([]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS', payload: {} })
      .then(r => { if (r?.success) setApps(r.data || []); });
  }, []);

  const statusColors: Record<string, string> = {
    submitted: 'badge-info',
    interview_scheduled: 'badge-success',
    rejected: 'badge-error',
    offer: 'badge-success',
    draft: 'badge-neutral',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {apps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No Applications Yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Applied jobs will appear here automatically
          </div>
        </div>
      ) : (
        apps.map(app => (
          <div key={app.id} className="glass-card glass-card-hover" style={{ padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{app.job.parsed.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{app.job.parsed.company.name}</div>
              </div>
              <span className={`badge ${statusColors[app.status] ?? 'badge-neutral'}`}>{app.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 4 }}>
              {new Date(app.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---- Profile Tab ----
function ProfileTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Profile Setup</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Set up your profile in the Settings page to enable autofill
        </div>
        <button
          className="btn-primary"
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Open Settings
        </button>
      </div>
    </div>
  );
}
