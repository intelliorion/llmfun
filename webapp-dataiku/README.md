# Orion

**Morgan Stanley CS TTIA — AI-Powered Entity & Relationship Intelligence**

> *"We have 30 people, 5 cross-team initiatives, hundreds of goals, reviews, and dependencies — and no way to see how it all connects. Until now."*

---

## The Challenge

Every large technology division faces the same invisible problem: **your most critical data about people, projects, and performance lives in disconnected documents** — spreadsheets, review packets, goal trackers, org charts, email threads. Leaders make talent decisions, allocate resources, and plan succession based on incomplete pictures assembled manually from dozens of sources.

Consider a real scenario:

- **Sarah Chen** runs a 30-person division with $15M in budget across 5 major initiatives
- Her **annual talent review** spans 30 employees, 120+ goals, 90+ peer reviews, retention risks, succession plans, and cross-team dependencies
- **One question** — *"If Kevin O'Brien leaves, what breaks?"* — requires mentally tracing connections across people, projects, skills, and reporting lines that no single document captures
- **Traditional approach**: Weeks of manual analysis, PowerPoint slides, and spreadsheets that are outdated the moment they're created

This is not a data problem. It's a **connection problem**. The data exists — it's just trapped in text.

---

## What Orion Does

Orion transforms unstructured documents into a **live, interactive knowledge graph** — automatically discovering entities (people, teams, projects, goals, reviews) and mapping every relationship between them using a multi-agent LLM pipeline built on Dataiku.

**In under 2 minutes**, Orion turns a talent review packet into a fully explorable map where you can:

- See which employees are single points of failure across initiatives
- Trace how a retention risk cascades through project dependencies
- Identify skill gaps, blocked goals, and succession vulnerabilities
- Run **What-If simulations** — *"What happens if we lose our top ML engineer?"* — and watch AI agents model the ripple effects across the organization

---

## The Team Management Use Case

### Why This Matters for CS TTIA

Morgan Stanley's CS TTIA division has **30 employees across 5 teams and 3 locations** working on 5 major cross-functional initiatives totaling **$10.4M in budget**. The talent landscape includes:

| Dimension | Scale |
|---|---|
| Employees | 30 (MD → Analyst, across New York, London, Hong Kong) |
| Teams | 5 (Data Engineering, AI/ML, Analytics, Program Management, Cross-functional) |
| FY2026 Initiatives | 5 ($10.4M combined budget) |
| Individual Goals | 120+ (4-5 per employee) |
| 360 Reviews | 90+ feedback entries (peers, managers, skip-level, stakeholders) |
| Retention Risks | 4 flagged (2 HIGH — actively recruited by FAANG) |
| Succession Plans | 5 critical leadership positions mapped |

**No human can hold all of this in their head.** Traditional tools show you a flat org chart or a spreadsheet. Orion shows you the **living network** — who depends on whom, which projects share critical people, where the hidden risks are.

### What Orion Reveals

When you feed the TTIA talent review into Orion, it automatically discovers:

- **People ↔ Project connections**: Kevin O'Brien is the technical lead on Orion ($4.2M) AND leads the GenAI Training Program AND the RAG Framework — he's a 3x single point of failure
- **Cross-team dependencies**: The Analytics Marketplace ($1.8M) depends on David Kim's platform work AND Emily Nakamura's governance review — a bottleneck invisible in any org chart
- **Cascading risks**: If Raj Krishnamurthy (HIGH retention risk) leaves, it impacts Orion's frontend, the Analytics Marketplace architecture, the TTIA Design System, AND Ryan Patel loses his mentor
- **Goal alignment gaps**: Marcus Thompson's security reviews are a dependency for 2 of 5 initiatives — but his own goal is to reduce review time from 5 days to 2 days, creating tension between thoroughness and speed

### What-If Simulation

Orion's What-If engine goes beyond static analysis. Powered by multi-agent simulation inspired by swarm intelligence:

1. **Immediate Impact** — What breaks right now?
2. **Ripple Effects** — How does the impact propagate through the network?
3. **Adaptation** — How does the organization reorganize?

Ask: *"What if Kevin O'Brien accepts the Google DeepMind offer?"*

Orion's AI agents roleplay as each affected entity — modeling how Priya Kapoor reassigns work, how the Orion timeline slips, who can absorb the RAG Framework ownership, and what the $4.2M budget impact looks like. You can then **interview individual agents** to drill deeper: *"Kevin, what would it take to stay?"*

---

## How It Works

### Multi-Agent LLM Pipeline

Orion uses a **3-agent pipeline** powered by any LLM via Dataiku's LLM Mesh:

```
  Documents (PDF, XLSX, DOCX, PPTX, Images, Email, CSV, TXT)
     │
     ▼  LLM Vision OCR (for PDFs, images, presentations)
     │
     ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Agent 0         │         │   Agent 1         │         │   Agent 2         │
│   Schema          │────────▶│   Entity          │────────▶│   Deduplication   │
│   Inference       │ ontology│   Extraction      │ raw map │                   │
│                   │         │                   │         │   Merges variants, │
│ Reads data sample,│         │ Extracts entities │         │   typos, abbrevs  │
│ infers entity &   │         │ & relationships   │         │   into canonical  │
│ relationship types│         │ per chunk (live)   │         │   forms           │
└──────────────────┘         └──────────────────┘         └──────────────────┘
                                                                    │
                                                                    ▼
                                                          Final Knowledge Graph
                                                          + What-If Simulation
                                                          + Report & Q&A
```

1. **Agent 0 — Schema Inference**: Analyzes a sample and defines a focused ontology (3–8 entity types, 3–10 relationship types). Domain templates (e.g., Team Management) can pre-seed the schema for specialized use cases.
2. **Agent 1 — Entity Extraction**: Processes text in chunks, extracting entities and relationships. The graph renders progressively in real-time.
3. **Agent 2 — Deduplication**: Scans all entity names, identifies duplicates (abbreviations, typos, partial names), and merges them into canonical forms.

### Document Intelligence

Orion uses **LLM Vision OCR** — a world-class, enterprise-grade document extraction engine — for PDFs, images, and presentations. Every page is rendered as a high-resolution image and processed by the multimodal LLM, capturing:

- Text, tables, charts, and diagrams
- Embedded images and annotations
- Layout and structural relationships
- Handwritten notes and scanned documents

| Format | Extraction Method |
|---|---|
| `.pdf` | LLM Vision OCR — every page rendered as 2x PNG |
| `.pptx` | LLM Vision OCR + speaker notes extraction |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`, `.webp` | Direct LLM Vision OCR |
| `.csv`, `.xlsx` | Structured: headers paired with values per row |
| `.docx` | Paragraph-by-paragraph text extraction |
| `.msg`, `.eml` | Email parsing (subject, sender, recipients, body) |
| `.txt`, `.md` | Plain text |

### Interactive Exploration

- **Graph View**: Click nodes/edges for detail panels. Search, filter by type, toggle labels, zoom/fit. Export as PNG, JSON, or CSV.
- **Entities Tab**: Tabular view of all entities and relationships with descriptions.
- **Report Tab**: AI-generated executive summary of key findings.
- **Q&A Tab**: Natural language questions with auto-suggested queries based on your data.
- **What-If Tab**: Multi-round agent simulation with entity interviews.

### Performance Optimization

Orion automatically adapts to large graphs:
- **50+ nodes**: Auto-clusters entity types for cleaner visualization
- **80+ nodes**: Performance mode — simplified rendering, straight edges, reduced physics
- Physics engine freezes after stabilization for smooth interaction

---

## Quick Start

### Prerequisites

- **Dataiku DSS** with LLM Mesh access
- **LLM Connection**: At least one LLM (e.g., `openai:MSOpenAI:gpt-4o`). Multimodal model recommended for Vision OCR.
- **Python packages**: `networkx`, `openpyxl`, `python-pptx`, `PyMuPDF` (fitz)
- **vis.js** loaded from CDN

### Setup

1. Create a new **Webapp** in Dataiku (Standard, code-based)
2. Copy files into the webapp editor:

| File | Tab |
|---|---|
| `python.py` | Python |
| `html.html` | HTML |
| `css.css` | CSS |
| `js.js` | JS |

3. Start the backend. Upload the included `demo_team_management.txt` to see Orion in action.

### Demo: Team Management

1. Select **"Team Management & Performance"** from the domain dropdown
2. Upload `demo_team_management.txt` (30-employee talent review packet)
3. Click **Build Knowledge Graph** — watch the org map emerge in real-time
4. Explore: Click on Kevin O'Brien to see his 4 project dependencies
5. Switch to **What-If** tab → Try: *"What if Kevin O'Brien leaves for Google DeepMind?"*
6. Interview the agents: Click on Priya Kapoor's card to ask how she'd reorganize

---

## Architecture

```
Browser (vis.js)              Dataiku Webapp Backend (Flask)
┌──────────────────┐         ┌─────────────────────────────────────┐
│  html/css/js     │◀───────▶│  python.py                          │
│                  │  REST   │                                     │
│  - Knowledge     │  API    │  GET  /models                      │
│    Graph (vis.js)│  + SSE  │  POST /upload          (SSE stream) │
│  - Detail Panel  │         │  POST /build                        │
│  - Search/Filter │         │  GET  /status/<id>                  │
│  - What-If Sim   │         │  POST /report/<id>                  │
│  - Report & Q&A  │         │  POST /ask/<id>                     │
│  - Export        │         │  POST /whatif/<id>                   │
│                  │         │  POST /whatif_interview/<id>         │
│                  │         │  POST /whatif_suggestions/<id>       │
└──────────────────┘         │                                     │
                             │  ┌──────────┐  ┌─────────────────┐  │
                             │  │ NetworkX │  │ Dataiku LLM Mesh│  │
                             │  │ DiGraph  │  │ (multimodal)    │  │
                             │  └──────────┘  └─────────────────┘  │
                             └─────────────────────────────────────┘
```

- **Session-based**: Each build creates a unique session. Multiple users work concurrently.
- **Progressive rendering**: Frontend polls `/status/<id>` every 2s, rendering entities as they arrive.
- **SSE streaming**: File upload progress streams in real-time with technique badges (e.g., "LLM Vision OCR").
- **In-memory**: Sessions live in a Python dict. Restart clears all data.

---

## Customization

- **LLM model**: Select from the header dropdown — all Dataiku LLM Mesh models listed automatically
- **Domain templates**: Pre-built schemas for Team Management, and extensible for other domains
- **Color palette**: Edit `ORION_COLORS` in `python.py`
- **Schema prompt**: Adjust `SCHEMA_PROMPT` for domain-specific ontology bias
- **Chunk size**: Modify `chunk_size` in `build_graph_async()` (default: 3000 chars)

---

*Built by CS TTIA. Powered by Dataiku LLM Mesh.*
