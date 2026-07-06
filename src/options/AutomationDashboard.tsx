import React, { useState } from 'react';
import type { ExtensionSettings } from '../types/settings';

export function AutomationDashboard({ settings, onSave }: { settings: ExtensionSettings; onSave: (u: Partial<ExtensionSettings>) => void }) {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Automation engine ready.']);

  function startAutomation() {
    setIsRunning(true);
    setLogs(prev => [...prev, 'Starting Auto-Apply on LinkedIn...']);
    chrome.runtime.sendMessage({ type: 'START_AUTOMATION', payload: { portal: 'linkedin' } });
  }

  function stopAutomation() {
    setIsRunning(false);
    setLogs(prev => [...prev, 'Automation stopped by user.']);
    chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION', payload: {} });
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Auto-Apply Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Configure fully autonomous background job searching and applying.</p>
        <div className="divider" />
      </div>

      <div style={{
        padding: '16px',
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Auto-Apply Engine</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Status: {isRunning ? <span style={{ color: '#10b981' }}>Running</span> : 'Stopped'}
            </div>
          </div>
          <div>
            {!isRunning ? (
              <button className="btn-primary" onClick={startAutomation}>▶ Start Auto-Apply</button>
            ) : (
              <button className="btn-secondary" onClick={stopAutomation} style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>⏹ Stop</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>Search Keywords</label>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>E.g. "React Developer", "Software Engineer"</p>
        <input className="input" defaultValue="Frontend Developer" style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>Location / Filter</label>
        <input className="input" defaultValue="Remote, United States" style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>Submission Mode</label>
        <select className="input" defaultValue="review">
          <option value="review">Review Mode — Pause for manual review before submit</option>
          <option value="auto">Fully Autonomous — Submit automatically</option>
        </select>
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Live Logs</div>
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 8,
          padding: 12,
          minHeight: 150,
          maxHeight: 300,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#cbd5e1'
        }}>
          {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>[{new Date().toLocaleTimeString()}]</span> {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
