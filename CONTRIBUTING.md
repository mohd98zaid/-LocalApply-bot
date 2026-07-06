# Contributing to LocalApply

Thank you for your interest in contributing! LocalApply is a community project and contributions of all kinds are welcome.

---

## Code of Conduct

By participating, you agree to maintain a respectful, inclusive, and collaborative environment. Be kind — we're all here to make job hunting less painful for everyone.

---

## How to Contribute

### 1. Report Bugs

File an issue using the **Bug Report** template. Include:
- Chrome version and OS
- Extension version
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or console errors

### 2. Request Features

File an issue using the **Feature Request** template. Describe:
- The problem you're solving
- Your proposed solution
- Alternatives considered

### 3. Submit a Pull Request

#### Getting Started

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/localapply.git
cd localapply

# Install dependencies
npm install

# Generate icons
node scripts/generate-icons.cjs

# Start development build
npm run dev
```

#### Load the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **"Load unpacked"** → select the `dist/` folder
4. The extension reloads automatically with HMR via CRXJS

#### Running Tests

```bash
npm test           # Run all unit tests
npm run coverage   # With coverage report
npm run lint       # Lint with oxlint
```

#### Branch Naming

```
feat/description-of-feature
fix/description-of-bug
docs/update-readme
refactor/improve-ats-detector
```

#### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Workday multi-step navigation
fix: handle empty form fields in LinkedIn adapter
docs: update Ollama setup guide
refactor: extract common DOM utilities to base adapter
test: add unit tests for question classifier
chore: bump pdfjs-dist to 4.x
```

---

## Architecture Overview

```
src/background/     Service Worker (message routing, AI coordination)
src/content/        Content Scripts (page detection, form filling)
  adapters/         One file per ATS platform
  formEngine/       DOM event simulation
src/sidepanel/      Main React UI (side panel)
src/popup/          Toolbar popup
src/options/        Settings page
src/ai/             Ollama client + prompt library
src/rag/            RAG pipeline (chunker, vector store, embeddings)
src/storage/        IndexedDB + chrome.storage wrappers
src/types/          TypeScript domain types
src/offscreen/      PDF + DOCX parsing
src/__tests__/      Unit tests
```

---

## Adding an ATS Adapter

1. Create `src/content/adapters/yourplatform.ts`
2. Extend `BaseATSAdapter`
3. Implement `detect()` and `parseJobDescription()` (required)
4. Implement `extractFormFields()` and `answerQuestion()` (optional, use base defaults)
5. Register in `src/content/detector.ts` adapter list
6. Add `*://yourplatform.com/*` to `host_permissions` in `manifest.json`
7. Write tests in `src/__tests__/adapters/yourplatform.test.ts`

```typescript
import { BaseATSAdapter } from './base';

export class YourPlatformAdapter extends BaseATSAdapter {
  readonly atsName = 'YourPlatform';

  detect(): boolean {
    return window.location.hostname.includes('yourplatform.com');
  }

  async parseJobDescription() {
    // Extract title, company, description from DOM
    // ...
  }
}
```

---

## Style Guide

- **TypeScript strict mode** — all types must be explicit
- **No `any`** unless unavoidable (and comment why)
- **Privacy first** — never add external HTTP calls or analytics
- **Test your adapters** — DOM mocking + basic detection tests
- **CSS** — use CSS custom properties (`var(--color-*)`) from `global.css`

---

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] No external API calls added
- [ ] README updated if needed
- [ ] PR description explains the "why", not just the "what"

---

## Questions?

Open a [GitHub Discussion](https://github.com/localapply/localapply/discussions) — we're happy to help you get started!
