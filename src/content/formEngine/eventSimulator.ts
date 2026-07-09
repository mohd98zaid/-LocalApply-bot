// ============================================================
// Event Simulator — Human-like DOM event dispatching
// src/content/formEngine/eventSimulator.ts
// ============================================================

import type { FormField, FillResult, UploadResult } from '../../types/adapter';
import { sleep } from '../../utils/shared';

export class EventSimulator {

  // ---- Field Filling ----

  static async fillField(field: FormField, value: string): Promise<FillResult> {
    // Try to resolve element — may have been lost during message passing
    let element: HTMLElement | undefined = field.element;
    if (!element && field.elementSelector) {
      try {
        element = document.querySelector<HTMLElement>(field.elementSelector) ?? undefined;
      } catch { /* invalid selector */ }
    }

    if (!element) {
      return { fieldId: field.id, success: false, error: `Element not found: ${field.elementSelector ?? 'no selector'}`, method: 'direct' };
    }

    try {
      switch (field.type) {
        case 'select':
          return this.selectOption(field, value);
        case 'radio':
          return this.clickRadio(field, value);
        case 'checkbox':
          return this.toggleCheckbox(field, value);
        case 'file':
          return { fieldId: field.id, success: false, error: 'Use uploadFile instead', method: 'direct' };
        case 'textarea':
        case 'text':
        case 'email':
        case 'phone':
        case 'number':
        case 'url':
        default:
          return this.typeIntoInput(field, value, element as HTMLInputElement);
      }
    } catch (e) {
      return { fieldId: field.id, success: false, error: String(e), method: 'direct' };
    }
  }

  static async selectOption(field: FormField, value: string): Promise<FillResult> {
    let element: HTMLSelectElement | undefined = field.element as HTMLSelectElement | undefined;
    if (!element && field.elementSelector) {
      try {
        element = document.querySelector<HTMLSelectElement>(field.elementSelector) ?? undefined;
      } catch { /* invalid selector */ }
    }
    if (!element) return { fieldId: field.id, success: false, error: `Select element not found: ${field.elementSelector ?? 'no selector'}`, method: 'select' };

    // Find matching option by text or value (case-insensitive)
    const options = Array.from(element.options);
    const match = options.find(o =>
      o.text.toLowerCase() === value.toLowerCase() ||
      o.value.toLowerCase() === value.toLowerCase() ||
      o.text.toLowerCase().includes(value.toLowerCase())
    );

    if (!match) {
      return { fieldId: field.id, success: false, error: `No option matching "${value}"`, method: 'select' };
    }

    element.focus();
    // ponytail: Native setter for React-controlled selects — direct assignment is ignored
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(element, match.value);
    else element.value = match.value;
    this.dispatch(element, 'input');
    this.dispatch(element, 'change');
    this.dispatch(element, 'blur');

    return { fieldId: field.id, success: true, value: match.text, method: 'select' };
  }

  static async uploadFile(field: FormField, file: File): Promise<UploadResult> {
    let element: HTMLInputElement | undefined = field.element as HTMLInputElement | undefined;
    if (!element && field.elementSelector) {
      try {
        element = document.querySelector<HTMLInputElement>(field.elementSelector) ?? undefined;
      } catch { /* invalid selector */ }
    }
    if (!element) return { fieldId: field.id, success: false, error: `File input not found: ${field.elementSelector ?? 'no selector'}` };

    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Set files using Object.defineProperty (bypasses read-only restriction)
      Object.defineProperty(element, 'files', {
        value: dataTransfer.files,
        writable: false,
        configurable: true,
      });

      this.dispatch(element, 'change');
      this.dispatch(element, 'input');

      return { fieldId: field.id, success: true, fileName: file.name };
    } catch (e) {
      return { fieldId: field.id, success: false, error: String(e) };
    }
  }

  // ---- Private helpers ----

  private static async typeIntoInput(
    field: FormField,
    value: string,
    element: HTMLInputElement | HTMLTextAreaElement
  ): Promise<FillResult> {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(100);

    element.focus();
    this.dispatch(element, 'focus');
    this.dispatch(element, 'click');
    await sleep(50);

    // ponytail: Use the actual element's prototype, not hardcoded HTMLInputElement.
    // Airtable/React forms ignore setters from the wrong prototype chain.
    const proto = Object.getPrototypeOf(element);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

    // One-shot value set — char-by-char is slow and React batches ignore intermediate states
    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    // React captures input events to sync state — must dispatch after value is set
    this.dispatch(element, 'input');
    this.dispatch(element, 'change');
    this.dispatch(element, 'blur');

    return { fieldId: field.id, success: true, value, method: 'typing' };
  }

  private static clickRadio(field: FormField, value: string): FillResult {
    const name = (field.element as HTMLInputElement)?.name;
    if (!name) return { fieldId: field.id, success: false, error: 'No name attribute', method: 'click' };

    const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`);
    const match = Array.from(radios).find(r => {
      const label = r.labels?.[0]?.innerText ?? r.value;
      return label.toLowerCase() === value.toLowerCase() || r.value.toLowerCase() === value.toLowerCase();
    });

    if (!match) return { fieldId: field.id, success: false, error: `No radio matching "${value}"`, method: 'click' };

    match.focus();
    this.dispatch(match, 'click');
    match.checked = true;
    this.dispatch(match, 'change');

    return { fieldId: field.id, success: true, value, method: 'click' };
  }

  private static toggleCheckbox(field: FormField, value: string): FillResult {
    let el: HTMLInputElement | undefined = field.element as HTMLInputElement | undefined;
    if (!el && field.elementSelector) {
      try {
        el = document.querySelector<HTMLInputElement>(field.elementSelector) ?? undefined;
      } catch { /* invalid selector */ }
    }
    if (!el) return { fieldId: field.id, success: false, error: `Checkbox element not found: ${field.elementSelector ?? 'no selector'}`, method: 'click' };

    const shouldCheck = ['true', 'yes', '1', 'checked'].includes(value.toLowerCase());
    if (el.checked !== shouldCheck) {
      el.focus();
      el.checked = shouldCheck;
      this.dispatch(el, 'change');
      this.dispatch(el, 'click');
    }

    return { fieldId: field.id, success: true, value: String(shouldCheck), method: 'click' };
  }

  private static dispatch(element: HTMLElement, event: string, options: EventInit = {}) {
    element.dispatchEvent(new Event(event, { bubbles: true, cancelable: true, ...options }));
  }
}
