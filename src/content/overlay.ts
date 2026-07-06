// ============================================================
// Floating Overlay — Injected UI on job pages
// src/content/overlay.ts
// ============================================================

import type { PageAnalysis } from '../types/messages';

export class FloatingOverlay {
  private container: HTMLElement | null = null;
  private isVisible = false;

  show(analysis: PageAnalysis) {
    if (!this.container) {
      this.createContainer(analysis);
    } else {
      this.updateContent(analysis);
    }
    this.isVisible = true;
  }

  hide() {
    if (this.container) {
      this.container.style.opacity = '0';
      this.container.style.transform = 'translateX(20px)';
      setTimeout(() => {
        this.container?.remove();
        this.container = null;
      }, 300);
    }
    this.isVisible = false;
  }

  private createContainer(analysis: PageAnalysis) {
    this.container = document.createElement('div');
    this.container.id = 'localapply-overlay';
    this.container.setAttribute('data-localapply', 'true');

    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      fontFamily: "'Inter', system-ui, sans-serif",
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      opacity: '0',
      transform: 'translateX(20px)',
    });

    this.container.innerHTML = this.getOverlayHTML(analysis);
    document.body.appendChild(this.container);

    // Bind events
    this.bindEvents();

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.container) {
          this.container.style.opacity = '1';
          this.container.style.transform = 'translateX(0)';
        }
      });
    });
  }

  private getOverlayHTML(analysis: PageAnalysis): string {
    const atsName = analysis.ats.detected ? analysis.ats.atsName : 'unknown';
    const fieldCount = analysis.formFields.length;
    const isApp = analysis.isApplicationPage;

    return `
      <div style="
        background: rgba(26, 26, 36, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
        min-width: 200px;
        color: #f0f0f8;
      ">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="
              width:28px;height:28px;border-radius:8px;
              background:linear-gradient(135deg,#6366f1,#0ea5e9);
              display:flex;align-items:center;justify-content:center;
              font-size:14px;
            ">⚡</div>
            <div>
              <div style="font-weight:700;font-size:13px;">LocalApply</div>
              <div style="font-size:10px;color:#9090b0;text-transform:uppercase;letter-spacing:0.5px;">${atsName}</div>
            </div>
          </div>
          <button id="la-close" style="
            background:transparent;border:none;color:#9090b0;
            cursor:pointer;font-size:16px;padding:2px 6px;
            border-radius:4px;
          ">×</button>
        </div>

        <!-- Status -->
        <div style="margin-bottom:10px;">
          ${isApp ? `
            <div style="
              background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);
              border-radius:8px;padding:8px 10px;font-size:12px;
            ">
              <span style="color:#818cf8;font-weight:600;">📋 ${fieldCount} fields detected</span>
            </div>
          ` : `
            <div style="
              background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);
              border-radius:8px;padding:8px 10px;font-size:12px;
            ">
              <span style="color:#10b981;font-weight:600;">✓ Job posting detected</span>
            </div>
          `}
        </div>

        <!-- Actions -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button id="la-open-panel" style="
            width:100%;padding:8px;
            background:linear-gradient(135deg,#6366f1,#0ea5e9);
            color:white;border:none;border-radius:8px;
            font-size:12px;font-weight:600;cursor:pointer;
            font-family:'Inter',sans-serif;
          ">
            ${isApp ? '✍️ Autofill Application' : '🎯 Analyze Job'}
          </button>
          <button id="la-cover" style="
            width:100%;padding:6px;
            background:rgba(255,255,255,0.05);
            color:#9090b0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;
            font-size:11px;cursor:pointer;font-family:'Inter',sans-serif;
          ">
            📝 Generate Cover Letter
          </button>
        </div>
      </div>
    `;
  }

  private updateContent(analysis: PageAnalysis) {
    // Re-render overlay content
    this.container!.innerHTML = this.getOverlayHTML(analysis);
    this.bindEvents();
  }

  private bindEvents() {
    this.container?.querySelector('#la-close')?.addEventListener('click', () => this.hide());

    this.container?.querySelector('#la-open-panel')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', payload: {} });
    });

    this.container?.querySelector('#la-cover')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', payload: { tab: 'cover' } });
    });
  }
}
