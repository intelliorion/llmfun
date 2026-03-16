# Orion Knowledge Graph

**An AI-powered knowledge graph builder for Morgan Stanley CS TTIA, built on Dataiku.**

Orion transforms unstructured text and documents into interactive, explorable knowledge graphs — automatically extracting entities, relationships, and structure using a 3-agent LLM pipeline.

---

## Why Use Orion

Traditional knowledge graph construction requires manual schema design, entity tagging, and relationship mapping — a process that can take weeks for even a small corpus. Orion eliminates this by:

- **Automating ontology design** — An AI agent reads your data and infers the right entity types and relationships, so you don't have to define a schema upfront.
- **Handling messy, real-world data** — Paste raw text, upload PDFs, Excel spreadsheets, Word docs, emails, or CSVs. Orion preserves structure (e.g., pairing column headers with row values) and extracts meaning from unstructured prose.
- **Resolving duplicates intelligently** — A dedicated deduplication agent identifies abbreviations, typos, and partial names, merging them into single canonical entities.
- **Making results immediately explorable** — The interactive graph lets you click, search, filter, and export — no additional tooling required.

## When to Use It

| Scenario | Example |
|---|---|
| **Analyzing reports or filings** | Paste a quarterly earnings transcript to map companies, people, divisions, and their relationships |
| **Exploring structured datasets** | Upload an employee directory (XLSX/CSV) to visualize org structure, titles, and locations |
| **Research & due diligence** | Feed in research notes or news articles to surface connections between entities |
| **Quick prototyping** | Test whether a knowledge graph approach adds value to a use case before investing in a full pipeline |
| **Meeting prep** | Build a graph from briefing docs to quickly understand the landscape of people, orgs, and topics |

---

## How It Works

Orion uses a **3-agent pipeline**, each powered by an LLM via Dataiku's LLM Mesh (model is selectable from a dropdown in the header). The agents work sequentially — each agent's output feeds directly into the next:

```
  Raw Text
     │
     ▼
┌──────────────────┐    Ontology (entity types    ┌──────────────────┐
│   Agent 0         │    + relationship types)      │   Agent 1         │
│   Schema Inference │──────────────────────────────▶│   Entity Extraction│
│                    │                              │                    │
│ Reads a sample of  │                              │ Receives the       │
│ your data, infers  │                              │ ontology from      │
│ a focused ontology │                              │ Agent 0 and uses   │
│ (3-8 entity types, │                              │ it to extract      │
│ 3-10 relationship  │                              │ entities and       │
│ types)             │                              │ relationships from │
│                    │                              │ each text chunk    │
└──────────────────┘                              └────────┬───────────┘
                                                           │
                                                  Graph (all extracted
                                                  entities + relationships)
                                                           │
                                                           ▼
                                                ┌──────────────────┐
                                                │   Agent 2         │
                                                │   Deduplication    │
                                                │                    │
                                                │ Receives the full  │
                                                │ graph from Agent 1,│
                                                │ scans all entity   │
                                                │ names, and merges  │
                                                │ duplicates, typos, │
                                                │ and abbreviations  │
                                                │ into canonical     │
                                                │ forms. Returns the │
                                                │ cleaned final graph│
                                                └──────────────────┘
                                                           │
                                                           ▼
                                                    Final Knowledge Graph
```

1. **Agent 0 — Schema Inference**: Analyzes a sample of your data and defines a focused ontology (3–8 entity types, 3–10 relationship types). This ontology is passed to Agent 1 to constrain extraction and keep the graph clean and consistent.
2. **Agent 1 — Entity Extraction**: Receives the ontology from Agent 0 and processes your text in chunks, extracting entities and relationships constrained to those types. The graph updates progressively as each chunk is processed. Once all chunks are done, the accumulated graph is passed to Agent 2.
3. **Agent 2 — Deduplication**: Receives the full graph from Agent 1 and scans all entity names to identify duplicates (abbreviations, typos, partial names). It maps variants to canonical forms and merges the corresponding nodes and edges, producing the final cleaned graph.

---

## How to Use

### 1. Provide Your Data

You have two options:

- **Paste Text**: Switch to the "Paste Text" tab and paste any text — earnings transcripts, meeting notes, research summaries, etc.
- **Upload Files**: Switch to the "Upload File" tab and drag-and-drop or click to upload. Supported formats:
  - `.txt`, `.md` — Plain text and Markdown
  - `.csv`, `.xlsx` — Tabular data (headers are automatically paired with values)
  - `.pdf` — PDF documents
  - `.docx` — Word documents
  - `.pptx` — PowerPoint presentations
  - `.msg`, `.eml` — Email files (subject, sender, recipients, and body extracted)

  You can upload multiple files at once or add files one by one. Each file appears in the file list and can be removed individually before building.

### 2. Build the Graph

Click **"Build Knowledge Graph"**. You'll see progress indicators for each stage:

1. **Analyzing data** — Agent 0 infers the ontology. A schema card appears showing discovered entity types and relationship types.
2. **Extracting entities** — Agent 1 processes chunks. The graph renders progressively, and the stats bar updates in real-time.
3. **Resolving duplicates** — Agent 2 merges variants.
4. **Complete** — The final graph is ready to explore.

### 3. Explore the Graph

#### Interactive Graph (Graph Tab)
- **Click a node** to open the detail panel showing its name, type, description, and all connections.
- **Click an edge** to see the source, target, relationship type, and description.
- **Search** — Type in the search bar to highlight matching entities. Non-matching nodes fade out, and the view focuses on the first match.
- **Filter by type** — Click any legend item to hide/show entities of that type.
- **Zoom & fit** — Use the `+`, `−`, and fit-to-screen buttons in the toolbar.
- **Toggle edge labels** — Click "Aa" in the toolbar to show/hide relationship labels.
- **Export** — Click the export button to download as:
  - **PNG** — Image of the current graph view
  - **JSON** — Full graph data (entities + relationships)
  - **CSV** — Entities and relationships in tabular format

#### Entities Tab
A tabular view with two side-by-side tables:
- **Entities** — Name, type, and description for every extracted entity
- **Relationships** — Source, relation, target, and description for every connection

#### Report Tab
Click **"Generate Report"** to produce an AI-written summary of the knowledge graph, covering key entities, relationships, and insights.

#### Q&A Tab
Ask natural-language questions about your knowledge graph. After the graph is built, suggested questions are auto-generated based on the graph data (e.g., "What are the key relationships involving [top entity]?"). Click any suggestion or type your own question.

### 4. Start Over

Click **"Start Over"** to reset everything — uploaded files, graph, stats, and all panels — and begin with a fresh dataset.

---

## Deployment

Orion runs as a **Dataiku Webapp** (Standard, Code-based). It consists of four files:

| File | Purpose |
|---|---|
| `python.py` | Flask backend — LLM pipeline, file parsing, session management |
| `html.html` | UI structure |
| `css.css` | Styling (Manus-inspired design system) |
| `js.js` | Frontend logic — graph rendering, interactions, export |

### Prerequisites

- **Dataiku DSS** instance with access to the LLM Mesh
- **LLM Connection**: At least one LLM configured in the project's LLM Mesh (e.g., `openai:MSOpenAI:gpt-4o`). All available models are automatically listed in the UI dropdown.
- **Python packages** (available in the Dataiku code env): `networkx`, `openpyxl`, `python-pptx`, `pdfplumber`
- **vis.js** is loaded from CDN (`unpkg.com/vis-network`)

### Setup

1. In Dataiku, create a new **Webapp** (Standard type, code-based).
2. Copy the contents of each file into the corresponding tab in the webapp editor:
   - `python.py` → Python tab
   - `html.html` → HTML tab
   - `css.css` → CSS tab
   - `js.js` → JS tab
3. Start the webapp backend. The app is ready to use.

### Customization

- **LLM model**: All models available in your Dataiku LLM Mesh are automatically listed in the header dropdown. Select your preferred model before building. No code changes needed.
- **Color palette**: Edit `ORION_COLORS` in `python.py` to match your brand.
- **Schema prompt**: Adjust `SCHEMA_PROMPT` to bias the ontology toward specific domains.
- **Chunk size**: Modify `chunk_size` in `build_graph_async()` to control how text is split for extraction (default: 3000 characters).

---

## Supported File Formats

| Format | Parsing Approach |
|---|---|
| `.txt`, `.md` | Read as plain text |
| `.csv` | Record-per-row format: each row becomes a `[Record N]` block with `Header: Value` pairs |
| `.xlsx` | Same as CSV — first sheet is read, headers paired with values per row |
| `.pdf` | Text extraction via `pdfplumber`, page by page |
| `.docx` | Paragraph-by-paragraph text extraction |
| `.pptx` | Slide-by-slide, extracting text from all shapes |
| `.msg` | Subject, sender, recipients, and body extracted |
| `.eml` | Standard email parsing (headers + body) |

---

## Architecture

```
Browser (vis.js)          Dataiku Webapp Backend (Flask)
┌──────────────┐         ┌──────────────────────────────┐
│  html/css/js │◀───────▶│  python.py                   │
│              │  REST   │                              │
│  - vis.js    │  API    │  POST /upload                │
│    graph     │         │  POST /build                 │
│  - detail    │         │  GET  /status/<id>           │
│    panel     │         │  POST /report/<id>           │
│  - search    │         │  POST /ask/<id>              │
│  - export    │         │                              │
└──────────────┘         │  ┌──────────┐  ┌──────────┐  │
                         │  │ NetworkX │  │ Dataiku  │  │
                         │  │ DiGraph  │  │ LLM Mesh │  │
                         │  └──────────┘  └──────────┘  │
                         └──────────────────────────────┘
```

- **Session-based**: Each graph build creates a session with a unique ID. Multiple users can build graphs concurrently.
- **Progressive rendering**: The frontend polls `/status/<id>` every 2 seconds during build, rendering new nodes and edges as they arrive.
- **In-memory**: Graph data lives in a Python dictionary (`sessions`). Restarting the webapp backend clears all sessions.
