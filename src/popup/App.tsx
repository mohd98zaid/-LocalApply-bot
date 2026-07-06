import React, { useEffect, useState } from 'react';
import type { OllamaStatus } from '../types/ai';

// ============================================================
// Popup App — Quick Actions
// src/popup/App.tsx
// ============================================================

export default function PopupApp() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [isOnJobPage, setIsOnJobPage] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);

  // Search state
  const [searchJobTitle, setSearchJobTitle] = useState('');
  const [searchPortal, setSearchPortal] = useState('linkedin');

  useEffect(() => {
    async function load() {
      // Check Ollama
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA_STATUS', payload: {} });
      if (res?.success) setStatus(res.data);

      // Check current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const jobSites = ['linkedin.com/jobs', 'indeed.com', 'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'ashbyhq.com'];
      setIsOnJobPage(jobSites.some(s => tab?.url?.includes(s)));
    }
    load();
  }, []);

  function openSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      }
    });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  function handleSearch() {
    const query = encodeURIComponent(searchJobTitle);
    let url = '';
    switch(searchPortal) {
      case 'linkedin': 
        url = query ? `https://www.linkedin.com/jobs/search/?keywords=${query}` : 'https://www.linkedin.com/jobs/'; 
        break;
      case 'naukri': 
        url = query ? `https://www.naukri.com/${query.replace(/%20/g, '-')}-jobs` : 'https://www.naukri.com/'; 
        break;
      case 'indeed': 
        url = query ? `https://www.indeed.com/jobs?q=${query}` : 'https://www.indeed.com/'; 
        break;
      case 'wellfound': 
        url = query ? `https://wellfound.com/role/${query.replace(/%20/g, '-')}` : 'https://wellfound.com/jobs'; 
        break;
    }
    if (url) {
      chrome.tabs.create({ url });
    }
  }

  return (
    <div style={{
      width: 300,
      background: 'var(--color-surface)',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(14,165,233,0.08))',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>⚡</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>LocalApply</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>AI Job Application Copilot</div>
        </div>

        {/* Status dot */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status?.connected ? '#10b981' : '#ef4444',
          }} />
          <span style={{ fontSize: 11, color: status?.connected ? '#10b981' : '#ef4444' }}>
            {status?.connected ? 'AI Ready' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Status card */}
        {!status?.connected ? (
          <div style={{
            padding: '10px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}>
            ⚠️ Ollama not connected. <a href="#" onClick={openOptions} style={{ color: 'var(--color-primary-light)' }}>Setup guide →</a>
          </div>
        ) : (
          <div style={{
            padding: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: '#10b981',
          }}>
            ✓ {status.primaryModelAvailable ? `Using ${status.models[0]?.details?.parameter_size ?? ''} model` : 'Connected — pull a model to start'}
          </div>
        )}

        {/* Current page */}
        {isOnJobPage && (
          <div style={{
            padding: '10px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-light)', marginBottom: 2 }}>
              🎯 Job Page Detected
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              Open the panel to analyze and autofill
            </div>
          </div>
        )}

        {/* Actions */}
        <button
          className="btn-primary"
          onClick={openSidePanel}
          style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13 }}
        >
          Open AI Copilot Panel →
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={openOptions}
            style={{ fontSize: 12, padding: '8px', textAlign: 'center' }}
          >
            ⚙️ Settings
          </button>
          <button
            className="btn-secondary"
            onClick={() => chrome.tabs.create({ url: 'https://github.com/localapply/localapply' })}
            style={{ fontSize: 12, padding: '8px', textAlign: 'center' }}
          >
            📖 GitHub
          </button>
        </div>

        {/* Quick Job Search */}
        <div style={{
          marginTop: 6,
          paddingTop: 14,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>🔍 Quick Job Search</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select 
              className="input" 
              value={searchPortal} 
              onChange={(e) => setSearchPortal(e.target.value)}
              style={{ padding: '6px', fontSize: 12, flexShrink: 0, width: '90px' }}
            >
              <option value="linkedin">LinkedIn</option>
              <option value="naukri">Naukri</option>
              <option value="indeed">Indeed</option>
              <option value="wellfound">Wellfound</option>
            </select>
            <input 
              className="input" 
              value={searchJobTitle} 
              onChange={(e) => setSearchJobTitle(e.target.value)} 
              placeholder="Job title..." 
              style={{ padding: '6px', fontSize: 12, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={handleSearch} 
            style={{ width: '100%', justifyContent: 'center', padding: '6px', fontSize: 12, background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            Search on Portal ↗
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--color-border)',
        fontSize: 10,
        color: 'var(--color-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>v0.1.0 · Open Source</span>
        <span style={{ color: '#6366f1' }}>100% Local AI 🔒</span>
      </div>
    </div>
  );
}
