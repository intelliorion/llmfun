# Orion

**Turn unstructured text into a living knowledge graph — in under two minutes.**

Orion reads documents, emails, reviews, reports, or any free-form text and automatically discovers the entities (people, teams, projects, systems, decisions) and relationships hidden inside. It then lets you explore, question, and simulate the resulting graph.

Ships in two flavours:

- **`webapp/`** — a standalone Flask server you can run locally with just an OpenAI API key
- **`webapp-dataiku/`** — the same app as a Dataiku Standard Webapp (uses Dataiku's LLM Mesh)

## Why Orion

Every team has the same invisible problem: the data about **who does what, with whom, for what outcome** lives trapped in disconnected documents. Spreadsheets, review packets, email threads, project updates. Traditional tools show you a flat org chart or a list. Orion shows you the *network*.

One natural-language question — *"If our lead engineer leaves, what breaks?"* — becomes a 60-second interactive exploration instead of a week of manual tracing.

## Features

- **Multi-agent extraction pipeline** — schema inference → entity extraction → deduplication, each stage an LLM agent
- **Domain templates** — pre-tuned ontologies for communication, process, code, workflow, legal, contracts, data analysis, and team management; or fully auto-detected
- **Interactive graph** — search, filter by type, zoom, fit, export as PNG / JSON / CSV
- **Natural-language Q&A** — ask questions grounded in the extracted graph
- **What-If simulation** — multi-round agent simulation of how the network adapts when you change it; interview individual entities in first person
- **Find connection** — shortest-path search between any two entities with an LLM-generated explanation of every hop
- **Document intelligence** — `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.txt`, `.md`, images, `.msg`, `.eml` all supported; PDFs and images go through LLM-Vision OCR
- **OpenAI + Azure OpenAI** support out of the box

## Quick start (standalone Flask)

```bash
git clone https://github.com/intelliorion/orion.git
cd orion/webapp

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and set OPENAI_API_KEY=sk-...

python app.py
# → http://localhost:5001
```

### Try the included example

Open `http://localhost:5001`, click **Get Started**, paste the contents of [`examples/portfolio_review.txt`](examples/portfolio_review.txt) into the Data drawer, and hit Build. You should see ~40 entities across people, teams, projects, and outcomes, with relationships like `LEADS`, `SPONSORS`, `DEPENDS_ON`, and `DELIVERED`.

### Azure OpenAI instead of OpenAI

Swap the three `OPENAI_*` variables in `.env` for:

```dotenv
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-12-01-preview
```

Orion auto-detects Azure when both `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` are present.

## Quick start (Dataiku)

See [`webapp-dataiku/README.md`](webapp-dataiku/README.md) for the full Dataiku deployment guide.

## Architecture

```
Browser (vis.js)                 Flask / Dataiku backend
+-----------------+              +------------------------------------+
|  Graph view     |              |  Session manager                   |
|  Entities tab   |   REST       |  Extraction pipeline               |
|  Report tab     |   + SSE      |    Agent 0 — schema inference      |
|  Q&A tab        |<------------>|    Agent 1 — entity extraction     |
|  What-If tab    |              |    Agent 2 — deduplication         |
|  Find-conn tab  |              |  NetworkX DiGraph in memory        |
+-----------------+              |  OpenAI / Azure OpenAI / LLM Mesh  |
                                 +------------------------------------+
```

- Sessions are in-memory; restart clears them.
- The graph renders progressively — entities appear in the UI as each chunk is extracted.
- All LLM calls are synchronous per chunk; the build runs in a background thread so the UI stays live.

## Repository layout

```
orion/
├── README.md               ← you are here
├── LICENSE                 ← MIT
├── examples/               ← sample inputs you can paste or upload
│   └── portfolio_review.txt
├── webapp/                 ← standalone Flask version
│   ├── app.py              ← Flask routes + extraction pipeline
│   ├── requirements.txt
│   ├── static/             ← vis.js frontend (html/css/js)
│   └── templates/
├── webapp-dataiku/         ← Dataiku Standard Webapp version
│   ├── python.py
│   ├── html.html
│   ├── css.css
│   ├── js.js
│   └── README.md           ← Dataiku-specific guide
├── config/                 ← shared tunables
└── lib/                    ← shared extraction primitives
```

## Configuration

Tunable constants live in `config/settings.py` and at the top of each webapp's Python entrypoint. You can override models via environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI auth | *required* (unless Azure) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI auth | — |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | — |
| `AZURE_OPENAI_API_VERSION` | Azure API version | `2024-12-01-preview` |
| `ORION_DEFAULT_MODEL` | Model to use by default | auto-pick |
| `ORION_MODELS` | Comma-separated model list shown in the UI | auto-probe |

## Contributing

Pull requests welcome. For significant changes, please open an issue first to discuss scope.

- Keep the two variants (Flask + Dataiku) functionally parity
- Don't commit secrets — `.env` is git-ignored by default
- Prefer small, focused commits with descriptive messages

## License

[MIT](LICENSE) — free for personal and commercial use.
