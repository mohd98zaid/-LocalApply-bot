# LocalApply — Architecture Blueprint

> Open-source, privacy-first AI job application copilot. All data stays local.

---

## 1. System Overview

LocalApply is a Chrome Extension (Manifest V3) with four execution contexts:

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Extension                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Background   │  │   Content    │  │    Side Panel      │  │
│  │  (SW Worker)  │  │   Script     │  │    (React UI)      │  │
│  │              │  │  (per page)  │  │                    │  │
│  │  Message     │◄─┤  ATS Detect  ├─►│  Job / Fill / Q&A  │  │
│  │  Router      │  │  Autofill    │  │  Cover / Track     │  │
│  │  Auto-Apply  │  │  Overlay     │  │  Profile           │  │
│  │  AI / RAG    │  │              │  │                    │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
│         │                                                     │
│  ┌──────┴───────┐  ┌──────────────┐                         │
│  │  Offscreen   │  │    Popup     │                         │
│  │  (PDF/DOCX)  │  │  (Quick job  │                         │
│  │              │  │   search)    │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Local Ollama (localhost:11434)           │   │
│  │  gemma4:31b-cloud  +  nomic-embed-text              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Execution Contexts

| Context | Lifecycle | Purpose |
|---------|-----------|---------|
| **Service Worker** | Killed/restarted by Chrome | Message routing, AI calls, auto-apply state machine |
| **Content Script** | Per-page, injected at `document_idle` | DOM access, ATS detection, form filling, overlay UI |
| **Side Panel** | React SPA, persists while open | User interface (6 tabs) |
| **Offscreen Document** | Created on demand, destroyed after | PDF/DOCX parsing via pdf.js and mammoth |
| **Popup** | Opened on toolbar click | Quick job search across LinkedIn/Naukri |

---

## 3. Message Passing Architecture

All cross-context communication uses `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`. The service worker's `messageRouter` is the central hub.

```mermaid
graph LR
    SP[Side Panel] -->|sendMessage| SW[Service Worker]
    CS[Content Script] -->|sendMessage| SW
    PP[Popup] -->|sendMessage| SW
    SW -->|tabs.sendMessage| CS
    SW -->|sendMessage| SP
    SW -->|runtime.sendMessage| OS[Offscreen Doc]
    OS -->|runtime.sendMessage| SW

    SW --- MR[Message Router]
    MR --- AI[Ollama Client]
    MR --- DB[IndexedDB]
    MR --- CS2[Auto-Apply Engine]
```

### Key Message Types

| Category | Messages | Direction |
|----------|----------|-----------|
| **Page Analysis** | `ANALYZE_PAGE`, `PAGE_ANALYSIS_RESULT`, `GET_PAGE_DATA` | CS ↔ SW |
| **Autofill** | `START_AUTOFILL`, `FILL_RESULT`, `AUTOFILL_COMPLETE` | SP → SW → CS |
| **AI** | `AI_FILL_FIELD`, `AI_ANSWER_QUESTION`, `GENERATE_COVER_LETTER` | SP/CS → SW |
| **Auto-Apply** | `START_AUTO_APPLY_LOOP`, `STOP_AUTO_APPLY_LOOP` | SP → SW |
| **LinkedIn** | `SCRAPE_JOB_CARDS`, `CLICK_JOB_CARD`, `CLICK_EASY_APPLY`, `CLICK_MODAL_BUTTON` | SW → CS |
| **RAG** | `SAVE_FILL_TO_RAG` | CS → SW |
| **Storage** | `GET_SETTINGS`, `SAVE_SETTINGS`, `GET_PROFILE`, `GET_ALL_PROFILES` | SP → SW |
| **Resume** | `UPLOAD_RESUME`, `GET_RESUME_FILE`, `PARSE_RESUME_FILE` | SP → SW → OS |

---

## 4. Content Script — ATS Detection & Autofill

### 4.1 Detection Flow

```mermaid
flowchart TD
    A[Page Load / DOM Mutation] --> B{Form elements exist?}
    B -->|No| C[Hide overlay]
    B -->|Yes| D[Run ATSDetector]
    D --> E[Try each adapter]
    E --> F{Adapter detected?}
    F -->|Yes| G[Use best-match adapter]
    F -->|No| H[Fall back to UniversalAdapter]
    G --> I[Parse job description]
    G --> J[Parse form fields]
    G --> K[Detect questions]
    H --> I
    H --> J
    H --> K
    I --> L[Build PageAnalysis]
    J --> L
    K --> L
    L --> M[Show overlay]
    L --> N[Send PAGE_ANALYSIS_RESULT to SW]
```

### 4.2 Adapter Pattern

```
BaseATSAdapter (abstract)
  ├── LinkedInAdapter
  ├── GreenhouseAdapter
  ├── LeverAdapter
  ├── WorkdayAdapter
  ├── IndeedAdapter
  ├── AshbyAdapter
  ├── BambooHRAdapter
  └── UniversalAdapter (fallback — works on any page)
```

Each adapter implements:
- `detect(doc)` → confidence score + page type
- `parseJobDescription(doc)` → title, company, requirements
- `parseFormFields(doc)` → `FormField[]` with element references
- `detectQuestions(doc)` → `ApplicationQuestion[]`

### 4.3 Autofill Flow

```mermaid
sequenceDiagram
    participant SP as Side Panel
    participant SW as Service Worker
    participant CS as Content Script
    participant AI as Ollama

    SP->>SW: START_AUTOFILL (profileId, fieldsToFill)
    SW->>CS: START_AUTOFILL (relay)
    CS->>CS: Re-scan DOM for live element refs
    CS->>CS: AutofillOrchestrator.start()

    loop For each field
        CS->>CS: Resolve profile value (rule-based)
        alt No profile match
            CS->>SW: AI_FILL_FIELD (label, context)
            SW->>AI: generate (AI_FORM_FILLER_PROMPT)
            AI-->>SW: {value, confidence}
            SW-->>CS: value
        end
        CS->>CS: EventSimulator.fillField()
        Note right of CS: Native setter + input/change events
    end

    CS->>SW: AUTOFILL_COMPLETE
    CS->>SW: SAVE_FILL_TO_RAG
```

### 4.4 Event Simulator — React Compatibility

The `EventSimulator` uses `Object.getOwnPropertyDescriptor(prototype, 'value')?.set` to bypass React's synthetic event system. This is critical because React-controlled inputs ignore direct `element.value` assignments.

```mermaid
flowchart LR
    A[fillField] --> B{Field type}
    B -->|text/email/phone| C[typeIntoInput]
    B -->|select| D[selectOption]
    B -->|radio| E[clickRadio]
    B -->|checkbox| F[toggleCheckbox]
    B -->|file| G[uploadFile]

    C --> H[Native prototype setter]
    H --> I[Dispatch input event]
    I --> J[Dispatch change event]
    J --> K[Dispatch blur event]
```

---

## 5. RAG Pipeline — Deep Dive

The RAG system gives the AI context from your resume and past application answers, making generated responses personalized and grounded.

### 5.1 RAG Architecture

```mermaid
flowchart TB
    subgraph Ingest ["Ingest Pipeline"]
        A[Raw Text] --> B[Chunker]
        B --> C[Text Chunks ~600 chars]
        C --> D[Ollama Embed nomic-embed-text]
        D --> E[768-dim Vectors]
        E --> F[(IndexedDB memory + embeddings)]
        E --> G[HNSW Index in-memory]
    end

    subgraph Query ["Query Pipeline"]
        H[User Question] --> I[Embed Query]
        I --> J[HNSW Search O log n]
        J --> K[Top-K Vectors]
        K --> L[Fetch Memory Entries from IndexedDB]
        L --> M[AnswerContext]
    end

    subgraph Generate ["AI Generation"]
        M --> N[Ollama generate with context]
        N --> O[Personalized Answer]
    end

    G -.-> F
```

### 5.2 Chunking Strategy

```mermaid
flowchart TD
    A[Input Text] --> B{Has paragraph breaks?}
    B -->|Yes| C[Split on newlines]
    B -->|No| D[Sliding window - 512 chars, 64 overlap]

    C --> E[Build chunks - target 512 chars]
    E --> F{Chunk smaller than minChunkSize?}
    F -->|Yes| G[Skip]
    F -->|No| H[Keep chunk]

    D --> H

    H --> I[Output: TextChunk with id, text, offsets, metadata]
```

**Resume-specific chunking** (`chunkResume`): First splits on section headers (Experience, Education, Skills, etc.), then applies paragraph-aware chunking within each section. This preserves semantic boundaries.

### 5.3 Embedding Pipeline

```mermaid
sequenceDiagram
    participant Caller as filler.ts / messageRouter
    participant EP as embeddingPipeline
    participant Chunker as chunker.ts
    participant Ollama as Ollama API
    participant VS as vectorStore
    participant IDB as IndexedDB
    participant HNSW as HNSW Index

    Caller->>EP: embedAndStore(content, type, metadata)
    EP->>Chunker: chunkText(content)
    Chunker-->>EP: TextChunk[]

    EP->>Ollama: embed(nomic-embed-text, chunks)
    Ollama-->>EP: number[][] (768-dim vectors)

    loop For each chunk
        EP->>VS: addMemory(text, type, metadata, vector, model)
        VS->>IDB: memoryDB.save(entry)
        VS->>IDB: embeddingsDB.save(embeddingRecord)
        VS->>HNSW: add(entryId, vector)
    end
```

### 5.4 HNSW Index — How It Works

HNSW (Hierarchical Navigable Small World) builds a multi-layer graph where:
- **Layer 0** contains all vectors with dense connections
- **Higher layers** contain subsets with sparse connections (highway network)
- **Search** starts at the top layer and greedily descends, narrowing the search space

```mermaid
flowchart TD
    Q[Query Vector] --> L3

    subgraph HNSW ["HNSW Graph"]
        L3[Level 3: Entry Point]
        L2[Level 2: 4 nodes]
        L1[Level 1: 8 nodes]
        L0[Level 0: All nodes]
    end

    L3 -->|greedy search| L2
    L2 -->|greedy search| L1
    L1 -->|beam search ef=50| L0
    L0 --> R[Top-K Results]
```

**Parameters:**
- `M = 16` — max connections per node (balances accuracy vs memory)
- `efConstruction = 100` — candidate list size during insertion
- `ef = max(topK * 3, 50)` — candidate list size during search

**Performance:** For 1000 vectors of 768 dimensions, HNSW visits ~50-100 nodes vs flat scan's 1000, giving ~10-20x speedup with >95% recall.

### 5.5 Vector Store Schema

```mermaid
erDiagram
    MemoryEntry {
        string id PK
        string type
        string content
        object metadata
    }

    EmbeddingRecord {
        string id PK
        string memoryEntryId FK
        string vector "768 floats as JSON"
        string model
        int dimensions
        string createdAt
    }

    MemoryEntry ||--o{ EmbeddingRecord : "has embedding"
```

### 5.6 RAG Query Flow

```mermaid
sequenceDiagram
    participant AI as messageRouter
    participant EP as embeddingPipeline
    participant Ollama as Ollama
    participant HNSW as HNSW Index
    participant IDB as IndexedDB

    AI->>EP: semanticSearch(query, {topK: 5, types: ['resume']})
    EP->>Ollama: embedSingle(nomic-embed-text, query)
    Ollama-->>EP: queryVector (768-dim)

    EP->>HNSW: search(queryVector, topK=5, ef=15)
    Note right of HNSW: O(log n) graph traversal
    HNSW-->>EP: [{id, similarity}]

    loop For each result
        EP->>IDB: memoryDB.get(id)
        IDB-->>EP: MemoryEntry
        EP->>EP: Increment accessCount
        EP->>IDB: memoryDB.save(entry)
    end

    EP-->>AI: RAGResult {entries, searchTimeMs}
```

### 5.7 Memory Types

| Type | Content | When Indexed |
|------|---------|-------------|
| `resume` | Resume text chunks by section | On resume upload/parse |
| `application_answer` | Q&A pairs from past applications | After each autofill |
| `job_description` | Job posting text | On job analysis |
| `cover_letter` | Generated cover letters | On cover letter generation |
| `company_info` | Company research | On company analysis |
| `user_preference` | User settings/preferences | On preference save |
| `interview_question` | Interview Q&A | On interview prep |
| `application_note` | User notes about applications | On note save |
| `custom` | Any other text | On demand |

---

## 6. Auto-Apply Engine

### 6.1 State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ExtractingJobs: start

    ExtractingJobs --> ClickingCard: LinkedIn
    ExtractingJobs --> Navigating: URL-based

    ClickingCard --> WaitingForLoad: card clicked
    WaitingForLoad --> ClickingEasyApply: panel loaded
    ClickingEasyApply --> FillingModal: Easy Apply found
    ClickingEasyApply --> ClickingExternalApply: no Easy Apply
    ClickingExternalApply --> ExternalFormFill: Apply clicked
    FillingModal --> ClickingNext: fields filled
    ClickingNext --> FillingModal: next step
    FillingModal --> Submitting: last step
    Submitting --> ClosingModal: submitted
    ClosingModal --> ClickingCard: next job
    ClosingModal --> [*]: all done

    ExternalFormFill --> ClickingCard: next job

    Navigating --> WaitingForPage: URL loaded
    WaitingForPage --> ClickingApply: job listing
    ClickingApply --> WaitingForForm: Apply clicked
    WaitingForForm --> FillingForm: form detected
    FillingForm --> SubmittingURL: fields filled
    SubmittingURL --> Navigating: next URL
    SubmittingURL --> [*]: all done
```

### 6.2 LinkedIn Auto-Apply Flow

```mermaid
sequenceDiagram
    participant User
    participant SP as Side Panel
    participant SW as Service Worker
    participant CS as Content Script
    participant AI as Ollama

    User->>SP: Click "Start Auto-Apply Loop"
    SP->>SW: START_AUTO_APPLY_LOOP
    SW->>CS: SCRAPE_JOB_CARDS
    CS-->>SW: cardSelectors[]

    loop For each job card
        SW->>CS: CLICK_JOB_CARD(selector)
        CS-->>SW: success
        Note right of CS: Wait 2.5s for panel

        SW->>CS: CLICK_EASY_APPLY
        alt Easy Apply found
            CS-->>SW: success
            Note right of CS: Wait 2s for modal
            SW->>CS: START_AUTOFILL
            CS->>AI: AI_FILL_FIELD (per field)
            AI-->>CS: values
            CS->>CS: EventSimulator.fillField()
            SW->>CS: CLICK_MODAL_BUTTON (Next/Submit)
            Note right of CS: Loop until submitted
        else No Easy Apply
            CS-->>SW: failed
            SW->>CS: CLICK_APPLY_BUTTON (external)
            Note right of CS: Page navigates
            CS->>CS: Detect form on new page
            CS->>SW: PAGE_ANALYSIS_RESULT
            SW->>CS: START_AUTOFILL
        end

        SW->>CS: CLOSE_MODAL
        Note right of CS: Wait 1.5s
    end
```

---

## 7. Storage Layer

### 7.1 IndexedDB Schema

```mermaid
erDiagram
    profiles {
        string id PK
        string name
        object personalInfo
        object workPreferences
    }

    resumes {
        string id PK
        string profileId FK
        string rawText
        object parsed
    }

    jobs {
        string id PK
        object parsed
        string rawDescription
    }

    applications {
        string id PK
        string jobId FK
        string status
        object answers
    }

    memoryEntries {
        string id PK
        string type
        string content
        object metadata
    }

    embeddings {
        string id PK
        string memoryEntryId FK
        string vector
        string model
    }

    profiles ||--o{ resumes : "has"
    jobs ||--o{ applications : "tracked by"
    memoryEntries ||--o{ embeddings : "embedded as"
```

### 7.2 chrome.storage

| Area | Keys | Purpose |
|------|------|---------|
| `local` | `localapply_settings` | Extension settings (AI model, Ollama URL, defaults) |
| `session` | `ollama_status`, `tab_analysis_*`, `deferredAutofill` | Temporary session data |

---

## 8. AI Layer

### 8.1 Ollama Client

```mermaid
flowchart LR
    A[Client Code] --> B[OllamaClient]
    B --> C[HTTP fetch<br/>localhost:11434]
    C --> D[Ollama Server]

    B --> E[generate<br/>non-streaming]
    B --> F[streamGenerator<br/>async iterator]
    B --> G[generateJSON<br/>structured output]
    B --> H[embed<br/>vector embeddings]
    B --> I[pullModel<br/>download model]
```

### 8.2 Prompt System

All prompts are defined in `src/ai/prompts/index.ts` as `AIPrompt` objects:

```typescript
interface AIPrompt {
  id: string;
  task: AITask;
  systemPrompt: string;
  userPromptTemplate: string;  // {{variable}} interpolation
  temperature: number;
  maxTokens: number;
  version: number;
}
```

| Prompt | Task | Temp | Used For |
|--------|------|------|----------|
| `RESUME_PARSER_PROMPT` | `resume_parse` | 0.1 | Extracting structured data from raw resume text |
| `AI_FORM_FILLER_PROMPT` | `form_fill` | 0.3 | Generating values for form fields |
| `AI_QUESTION_ANSWERER_V2_PROMPT` | `question_answer_v2` | 0.65 | Answering application questions |
| `COVER_LETTER_PROMPT` | `cover_letter` | 0.75 | Generating tailored cover letters |
| `JOB_MATCHER_PROMPT` | `job_match` | 0.2 | Calculating resume-job match score |

### 8.3 AI + RAG Integration

```mermaid
flowchart TD
    A[Form field label: "Tell us about your leadership experience"] --> B{Has profile mapping?}
    B -->|Yes| C[Resolve from profile<br/>contact.firstName, experience.*, etc.]
    B -->|No| D[AI Fill Field]

    D --> E[Check RAG for similar past answers]
    E --> F{Found similar?}
    F -->|Yes| G[Include as context in prompt]
    F -->|No| H[Use profile summary only]

    G --> I[Ollama generate<br/>AI_FORM_FILLER_PROMPT]
    H --> I
    I --> J[Return value]
    J --> K[Save to RAG<br/>for future reference]
```

---

## 9. Data Flow — End to End

### 9.1 Resume Upload → RAG Index

```mermaid
flowchart LR
    A[User uploads PDF/DOCX] --> B[Offscreen Document]
    B --> C[pdf.js / mammoth<br/>extract text]
    C --> D[Ollama generate<br/>RESUME_PARSER_PROMPT]
    D --> E[ParsedResume<br/>structured data]
    E --> F[IndexedDB<br/>resumes store]
    E --> G[embeddingPipeline.indexResume]
    G --> H[chunkResume<br/>section-aware]
    H --> I[Ollama embed<br/>nomic-embed-text]
    I --> J[IndexedDB<br/>memoryEntries + embeddings]
    I --> K[HNSW Index<br/>in-memory]
```

### 9.2 Job Application — Full Loop

```mermaid
sequenceDiagram
    actor User
    participant CS as Content Script
    participant SW as Service Worker
    participant AI as Ollama
    participant RAG as RAG Pipeline
    participant IDB as IndexedDB

    User->>CS: Navigate to job page
    CS->>CS: ATSDetector.analyzePage()
    CS->>SW: PAGE_ANALYSIS_RESULT
    SW->>SW: Store analysis
    SW-->>CS: (broadcast to side panel)

    User->>CS: Click "Autofill Application"
    CS->>CS: Scan DOM for fields
    CS->>SW: START_AUTOFILL

    loop For each field
        CS->>CS: Check profile mapping
        alt Mapped
            CS->>IDB: profilesDB.get(profileId)
            IDB-->>CS: profile data
            CS->>CS: resolveProfileValue(path)
        else Not mapped
            CS->>SW: AI_FILL_FIELD
            SW->>RAG: Search similar past answers
            RAG->>IDB: memoryDB search
            IDB-->>RAG: entries
            SW->>AI: generate(prompt + context)
            AI-->>SW: {value, confidence}
            SW-->>CS: value
        end
        CS->>CS: EventSimulator.fillField()
    end

    CS->>SW: AUTOFILL_COMPLETE
    CS->>SW: SAVE_FILL_TO_RAG
    SW->>RAG: embedAndStore(Q+A pair)
    RAG->>IDB: Save for future reuse
```

---

## 10. File Structure

```
src/
├── background/
│   ├── serviceWorker.ts        # Entry point, lifecycle, alarms
│   ├── messageRouter.ts        # Central message dispatcher
│   ├── autoApplyEngine.ts      # Auto-apply state machine
│   └── resumeParser.ts         # Offscreen document orchestrator
├── content/
│   ├── index.ts                # Content script entry, message handlers
│   ├── detector.ts             # ATS detection via adapter pattern
│   ├── overlay.ts              # Floating UI overlay
│   ├── adapters/
│   │   ├── base.ts             # BaseATSAdapter (abstract)
│   │   ├── linkedin.ts         # LinkedIn-specific
│   │   ├── greenhouse.ts       # Greenhouse + 5 more adapters
│   │   └── universal.ts        # Re-export fallback
│   └── formEngine/
│       ├── filler.ts           # Autofill orchestrator
│       └── eventSimulator.ts   # React-compatible DOM events
├── rag/
│   ├── chunker.ts              # Text splitting (paragraph-aware)
│   ├── embeddingPipeline.ts    # Chunk → embed → store → search
│   ├── vectorStore.ts          # HNSW + IndexedDB persistence
│   └── hnsw.ts                 # HNSW graph index (pure TS)
├── ai/
│   ├── ollama/
│   │   └── client.ts           # Ollama REST API client
│   └── prompts/
│       └── index.ts            # 12 prompt templates
├── storage/
│   ├── indexedDB.ts            # 8-store typed IDB layer
│   └── chromeStorage.ts        # Settings, session, badge
├── sidepanel/
│   ├── App.tsx                 # 6-tab React UI
│   └── components/
│       └── AnswerReviewPanel.tsx
├── popup/
│   └── App.tsx                 # Quick job search
├── options/
│   ├── App.tsx                 # Settings, profile, import/export
│   ├── ProfileManager.tsx      # Profile CRUD
│   └── AutomationDashboard.tsx # Auto-apply status
├── offscreen/
│   ├── index.ts                # Message handler
│   ├── pdfParser.ts            # pdf.js wrapper
│   └── docxParser.ts           # mammoth wrapper
├── types/
│   ├── messages.ts             # MessageType union, PageAnalysis
│   ├── ai.ts                   # AIPrompt, MemoryEntry, RAGQuery
│   ├── adapter.ts              # ATSAdapter interface, FormField
│   ├── settings.ts             # ExtensionSettings
│   ├── resume.ts               # CandidateProfile, ParsedResume
│   ├── job.ts                  # Job, Application
│   └── storage.ts              # IDB schema types
├── utils/
│   └── shared.ts               # sleep, randomBetween, sendToContentScript
└── styles/
    └── global.css              # Design system (dark + light themes)
```

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Ollama (local LLM)** | Privacy-first — no data leaves the machine |
| **nomic-embed-text** | Lightweight 768-dim embedding model, fast on CPU |
| **HNSW over flat scan** | O(log n) search for thousands of vectors |
| **IndexedDB over chrome.storage** | Structured data, indexes, larger quota (unlimited vs 10MB) |
| **Native value setters** | React-controlled inputs ignore direct `element.value` assignment |
| **Deferred autofill flag** | Enables cross-page apply flows (click Apply → login → autofill) |
| **Adapter pattern for ATS** | Extensible — add new ATS support by implementing `ATSAdapter` |
| **Message passing over direct calls** | Required by MV3 — service worker and content scripts are isolated |

---

## 12. Privacy Model

```
┌─────────────────────────────────────────────┐
│              Your Machine Only               │
│                                              │
│  Resume data ──► IndexedDB (local)           │
│  Profile ──► IndexedDB (local)               │
│  Application answers ──► RAG memory (local)  │
│  AI inference ──► Ollama (localhost:11434)    │
│  Embeddings ──► HNSW index (in-memory)       │
│                                              │
│  ✗ No telemetry                              │
│  ✗ No external API calls                     │
│  ✗ No cloud storage                          │
│  ✗ No analytics                              │
└─────────────────────────────────────────────┘
```
