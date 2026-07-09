// ============================================================
// Floating Overlay — Injected UI on job pages
// src/content/overlay.ts
// ============================================================

import type { PageAnalysis } from '../types/messages';

export class FloatingOverlay {
  private container: HTMLElement | null = null;
  private isVisible = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(analysis: PageAnalysis) {
    // Cancel any pending hide so it doesn't destroy the new container
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
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
      this.hideTimer = setTimeout(() => {
        this.container?.remove();
        this.container = null;
        this.hideTimer = null;
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
    // ponytail: Detect Easy Apply button on LinkedIn job listing pages
    const hasEasyApply = !isApp && !!document.querySelector(
      'button[aria-label*="Easy Apply"], button[aria-label*="Apply"], .jobs-apply-button'
    );

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
          ` : hasEasyApply ? `
            <div style="
              background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);
              border-radius:8px;padding:8px 10px;font-size:12px;
            ">
              <span style="color:#f59e0b;font-weight:600;">🎯 Easy Apply button found</span>
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
            ${isApp ? '✍️ Autofill Application' : hasEasyApply ? '🚀 Click Easy Apply' : '🎯 Analyze Job'}
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
      this.triggerAutofill();
    });

    this.container?.querySelector('#la-cover')?.addEventListener('click', () => {
      try { chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', payload: { tab: 'cover' } }).catch(() => {}); } catch(e) {}
    });
  }

  // ponytail: Public method for auto-triggering autofill after page navigation
  autoTriggerAutofill() {
    if (this.container) this.triggerAutofill();
  }

  private async triggerAutofill() {
    // Show loading state
    const btn = this.container?.querySelector('#la-open-panel') as HTMLButtonElement;
    if (btn) {
      btn.textContent = '⟳ Scanning...';
      btn.disabled = true;
    }

    // ponytail: If Easy Apply button exists, click it and wait for modal
    const easyApplySelectors = [
      'button[aria-label*="Easy Apply"]',
      '.jobs-apply-button',
      'button.jobs-apply-button',
      'button[data-control-name="jobs-apply-button"]',
    ];
    let clickedEasyApply = false;
    for (const sel of easyApplySelectors) {
      const applyBtn = document.querySelector<HTMLElement>(sel);
      if (applyBtn && applyBtn.offsetParent !== null) {
        if (btn) btn.textContent = '🚀 Clicking Easy Apply...';
        applyBtn.click();
        clickedEasyApply = true;
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
      }
    }

    // If no Easy Apply, check for external Apply button (redirects to another page)
    if (!clickedEasyApply) {
      const externalApplySelectors = [
        'a[href*="apply"]',
        'a[data-control-name*="apply"]',
        'button[aria-label*="Apply"]',
        'a.apply-button',
      ];
      for (const sel of externalApplySelectors) {
        const applyLink = document.querySelector<HTMLElement>(sel);
        if (applyLink && applyLink.offsetParent !== null) {
          const text = applyLink.textContent?.toLowerCase() ?? '';
          // Skip if it's Easy Apply (already handled) or just "Save"
          if (text.includes('easy apply') || text.includes('save')) continue;
          if (btn) btn.textContent = '🚀 Opening application...';
          // Store flag so the new page auto-triggers autofill after login
          chrome.storage.session.set({ deferredAutofill: true }).catch(() => {});
          applyLink.click();
          return; // Page will navigate — content script on new page handles the rest
        }
      }
    }

    try {
      // Step 1: Scan page for form fields
      const elements = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
      );

      const fieldsToFill: Array<{
        id: string;
        elementSelector: string;
        type: string;
        label: string;
        required: boolean;
        disabled: boolean;
        confidence: number;
        options?: string[];
        mappedProfileField?: string;
      }> = [];

      for (const el of elements) {
        const input = el as HTMLInputElement;

        // Build selector
        let selector = '';
        if (input.id) selector = `#${CSS.escape(input.id)}`;
        else if (input.name) selector = `[name="${CSS.escape(input.name)}"]`;
        else {
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

        fieldsToFill.push({
          id: `field-${Math.random().toString(36).slice(2, 9)}`,
          elementSelector: selector,
          type: input.tagName === 'SELECT' ? 'select' : input.type ?? 'text',
          label,
          required: input.required,
          disabled: false,
          confidence: options ? 0.8 : 0,
          options,
          mappedProfileField: mappedField || undefined,
        });
      }

      if (fieldsToFill.length === 0) {
        if (btn) {
          btn.textContent = '❌ No fields found';
          setTimeout(() => {
            if (btn) {
              btn.textContent = '✍️ Autofill Application';
              btn.disabled = false;
            }
          }, 2000);
        }
        return;
      }

      // Step 2: Get profile ID from settings
      const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} });
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
        if (btn) {
          btn.textContent = '⚠️ No profile set';
          setTimeout(() => {
            if (btn) {
              btn.textContent = '✍️ Autofill Application';
              btn.disabled = false;
            }
          }, 2000);
        }
        return;
      }

      // Step 3: Show filling state and send autofill command
      if (btn) {
        btn.textContent = `⟳ Filling ${fieldsToFill.length} fields...`;
      }

      await chrome.runtime.sendMessage({
        type: 'START_AUTOFILL',
        payload: {
          profileId,
          jobId: 'current',
          mode: 'copilot',
          fieldsToFill,
        },
      });

      // Success feedback
      if (btn) {
        btn.textContent = '✅ Autofill started!';
        setTimeout(() => {
          if (btn) {
            btn.textContent = '✍️ Autofill Application';
            btn.disabled = false;
          }
        }, 2000);
      }
    } catch (e) {
      console.error('[LocalApply] Autofill failed:', e);
      if (btn) {
        btn.textContent = '❌ Autofill failed';
        setTimeout(() => {
          if (btn) {
            btn.textContent = '✍️ Autofill Application';
            btn.disabled = false;
          }
        }, 2000);
      }
    }
  }
}
