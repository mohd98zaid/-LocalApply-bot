# ⚡ LocalApply — AI Job Application Copilot

> Open-source, privacy-first Chrome Extension for AI-assisted job applications — powered entirely by **Ollama running locally**. Your data never leaves your computer.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Built with Vite](https://img.shields.io/badge/Built%20with-Vite-646cff)](https://vite.dev)
[![Powered by Ollama](https://img.shields.io/badge/AI-Ollama%20Local-orange)](https://ollama.com)

---

## ✨ Features

| Feature | Status |
|---------|--------|
| 🎯 Job page detection (10 ATS platforms) | ✅ MVP |
| 📋 Form autofill with profile data | ✅ MVP |
| 👤 Multiple Profiles & Resumes | ✅ MVP |
| 🤖 AI-powered Q&A (behavioral, salary, visa...) | ✅ MVP |
| 📝 AI Cover Letter generation | ✅ MVP |
| 📊 Match score vs. job description | ✅ MVP |
| 📄 Resume parsing (PDF, DOCX) | 🚧 In Progress |
| 🧠 Local RAG memory (remember past answers) | 🚧 In Progress |
| 📈 Application tracker | ✅ MVP |
| 🔒 Fully local — no telemetry, no cloud | ✅ Always |

**Supported ATS Platforms:** LinkedIn Easy Apply · Indeed · Greenhouse · Lever · Workday · Ashby · BambooHR · SmartRecruiters · Jobvite · Wellfound

---

## 🚀 Quick Start

### Prerequisites

1. **Node.js** ≥ 18 and **npm** ≥ 9
2. **Ollama** installed — [ollama.com](https://ollama.com)
3. **Google Chrome** (or Chromium-based browser)

### 1. Install & Pull Models

```bash
# Install Ollama from https://ollama.com, then:
ollama pull gemma4:31b-cloud  # Primary AI model (cloud-accelerated)
ollama pull nomic-embed-text  # Embedding model (~274MB)
```

### 2. Set CORS for Chrome Extension

**Windows (Command Prompt as Admin):**
```cmd
setx OLLAMA_ORIGINS "chrome-extension://*" /M
```

**Mac/Linux:**
```bash
# Add to ~/.zshrc or ~/.bashrc
export OLLAMA_ORIGINS="chrome-extension://*"
```

Then **restart Ollama**.

### 3. Build the Extension

```bash
git clone https://github.com/localapply/localapply.git
cd localapply
npm install
npm run icons     # Generate extension icons
npm run build     # Build to /dist
```

### 4. Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `dist/` folder
5. Click the ⚡ LocalApply icon in your toolbar

---

## 🏗️ Project Structure

```
src/
├── background/          # Service Worker (message routing, AI coordination)
│   ├── index.ts
│   └── messageRouter.ts
├── content/             # Content Scripts (injected into job pages)
│   ├── index.ts
│   ├── detector.ts      # ATS detection orchestrator
│   ├── overlay.ts       # Floating UI overlay
│   ├── adapters/        # ATS-specific adapters
│   │   ├── base.ts      # Abstract base class
│   │   ├── linkedin.ts
│   │   ├── greenhouse.ts
│   │   ├── lever.ts
│   │   ├── workday.ts
│   │   ├── indeed.ts
│   │   ├── ashby.ts
│   │   └── universal.ts
│   └── formEngine/
│       ├── filler.ts          # Autofill orchestrator
│       └── eventSimulator.ts  # Human-like input simulation
├── sidepanel/           # Side Panel React App (main UI)
│   ├── main.tsx
│   └── App.tsx          # 5-tab interface
├── popup/               # Toolbar popup
├── options/             # Settings page
├── ai/
│   ├── ollama/
│   │   └── client.ts    # Ollama REST client (streaming + embeddings)
│   └── prompts/
│       └── index.ts     # 10 production-ready prompts
├── storage/
│   ├── indexedDB.ts     # Typed IndexedDB layer (idb)
│   └── chromeStorage.ts # chrome.storage wrapper
├── types/               # Full TypeScript domain model
│   ├── resume.ts
│   ├── job.ts
│   ├── ai.ts
│   ├── adapter.ts
│   ├── messages.ts
│   ├── settings.ts
│   └── storage.ts
└── styles/
    └── global.css       # Design system (dark theme, glassmorphism)
```

---

## 🤖 AI Model Recommendations

| Model | Size | Best For |
|-------|------|----------|
| `gemma4:31b-cloud` | Cloud | ✅ Recommended — top quality, cloud-accelerated |
| `gemma4:12b` | ~8GB | Lighter local option |
| `qwen3:8b` | ~5GB | Fast local inference |
| `qwen3:14b` | ~9GB | High quality local |
| `phi4:14b` | ~9GB | Fast on CPU |
| `llama4:scout` | ~10GB | Very long context (JD + resume) |

**Embedding model:** `nomic-embed-text` (274MB, required for RAG)

---

## 🔒 Privacy

- **Zero telemetry** — no data is ever sent anywhere
- **All AI inference** runs on your local Ollama instance
- **All data** (profiles, resumes, applications) stored in IndexedDB in your browser
- **No accounts**, no sign-ups, no cloud sync
- **Open source** — audit every line yourself

---

## 🛠️ Development

```bash
npm run dev          # Dev build with watch mode (HMR via CRXJS)
npm run build        # Production build
npm run test         # Run Vitest unit tests
npm run coverage     # Test coverage report
npm run lint         # Lint with oxlint
```

### Tech Stack

- **Build:** Vite 8 + CRXJS plugin + TypeScript 6
- **UI:** React 19 + Vanilla CSS (dark glassmorphism design)
- **AI:** Ollama REST API (streaming, embeddings, JSON mode)
- **Storage:** IndexedDB (via `idb`) + chrome.storage
- **Testing:** Vitest + Testing Library

---

## 📋 Roadmap

- [x] **v0.2** — Full Profile Management UI
- [ ] **v0.2** — Resume upload & parsing (PDF/DOCX via Offscreen API)
- [ ] **v0.2** — Local RAG memory (HNSW vectors in IndexedDB)
- [ ] **v0.3** — Resume tailoring AI workflow
- [ ] **v0.3** — ATS score optimizer
- [ ] **v0.4** — Multi-step Workday/iCIMS navigation
- [ ] **v1.0** — Full application automation with review mode
- [ ] **v1.0** — Interview prep module

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit changes: `git commit -m 'feat: add X'`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<p align="center">Made with ❤️ for job seekers everywhere · <strong>100% Local AI 🔒</strong></p>
