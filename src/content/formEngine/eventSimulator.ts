// ============================================================
// Event Simulator — Human-like DOM event dispatching
// src/content/formEngine/eventSimulator.ts
// ============================================================

import type { FormField, FillResult, UploadResult } from '../../types/adapter';

export class EventSimulator {

  // ---- Field Filling ----

  static async fillField(field: FormField, value: string): Promise<FillResult> {
    const element = field.element ?? document.querySelector(field.elementSelector ?? '');

    if (!element) {
      return { fieldId: field.id, success: false, error: 'Element not found', method: 'direct' };
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
    const element = (field.element ?? document.querySelector(field.elementSelector ?? '')) as HTMLSelectElement;
    if (!element) return { fieldId: field.id, success: false, error: 'Element not found', method: 'select' };

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
    element.value = match.value;
    this.dispatch(element, 'change');
    this.dispatch(element, 'blur');

    return { fieldId: field.id, success: true, value: match.text, method: 'select' };
  }

  static async uploadFile(field: FormField, file: File): Promise<UploadResult> {
    const element = (field.element ?? document.querySelector(field.elementSelector ?? '')) as HTMLInputElement;
    if (!element) return { fieldId: field.id, success: false, error: 'Element not found' };

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

    // Clear existing value
    if (element.value) {
      element.select();
      this.dispatchKeyboard(element, 'keydown', 'a', { ctrlKey: true });
      await sleep(30);
      this.dispatchKeyboard(element, 'keydown', 'Delete');
      element.value = '';
      this.dispatch(element, 'input');
      await sleep(50);
    }

    // Type character by character for human-like input
    for (const char of value) {
      this.dispatchKeyboard(element, 'keydown', char);
      this.dispatchKeyboard(element, 'keypress', char);

      // Use React-compatible value setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set ?? Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, element.value + char);
      } else {
        element.value += char;
      }

      this.dispatch(element, 'input');
      this.dispatchKeyboard(element, 'keyup', char);

      // Random delay between characters
      await sleep(randomBetween(20, 80));
    }

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
    match.checked = true;
    this.dispatch(match, 'change');
    this.dispatch(match, 'click');

    return { fieldId: field.id, success: true, value, method: 'click' };
  }

  private static toggleCheckbox(field: FormField, value: string): FillResult {
    const el = (field.element ?? document.querySelector(field.elementSelector ?? '')) as HTMLInputElement;
    if (!el) return { fieldId: field.id, success: false, error: 'Element not found', method: 'click' };

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

  private static dispatchKeyboard(element: HTMLElement, event: string, key: string, modifiers: KeyboardEventInit = {}) {
    element.dispatchEvent(new KeyboardEvent(event, {
      key,
      code: `Key${key.toUpperCase()}`,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
