import json
import re
import threading
import uuid
import networkx as nx
import dataiku
from flask import request, Response

# --- State ---
sessions = {}

# --- LLM ---
def get_llm():
    client = dataiku.api_client()
    project = client.get_default_project()
    return project.get_llm('openai:MSOpenAI:gpt-4o')

llm = get_llm()

# --- Orion / MS Color Palette ---
ORION_COLORS = ['#216CA6', '#1A936F', '#7B2D8E', '#C5283D', '#2E86AB',
                '#5ba3d9', '#e07a2f', '#6C757D', '#0d7377', '#8B5CF6']

# --- Prompts ---
EXTRACTION_PROMPT = """Analyze the following text and extract all entities and relationships.

Return a JSON object with exactly this structure:
{{
  "entities": [
    {{"name": "Entity Name", "type": "Person|Organization|Division|Metric|Event", "description": "brief description"}}
  ],
  "relationships": [
    {{"source": "Entity Name", "target": "Entity Name", "relation": "RELATIONSHIP_TYPE", "description": "brief description"}}
  ]
}}

Entity types: Person, Organization, Division, Metric, Event, Technology, Market
Relationship types: WORKS_AT, LEADS, PART_OF, COMPETES_WITH, REPORTS, INVESTS_IN, FORECASTS, IMPACTS

Be thorough. Extract every entity and relationship mentioned.
Return ONLY valid JSON, no markdown fences, no extra text.

Text:
{text}
"""

def json_response(data, status=200):
    return Response(json.dumps(data), status=status, mimetype='application/json')

# --- Helper Functions ---
def clean_llm_json(raw):
    text = raw.strip()
    text = re.sub(r'^```(?:json)?\s*\n?', '', text)
    text = re.sub(r'\n?```\s*$', '', text)
    text = text.replace('\\n', '\n')
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        text = match.group(0)
    return text.strip()


def extract_entities(text):
    completion = llm.new_completion()
    completion.with_message(EXTRACTION_PROMPT.format(text=text))
    resp = completion.execute()
    cleaned = clean_llm_json(resp.text)
    return json.loads(cleaned)


def chunk_text(text, chunk_size=400, overlap=30):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            for sep in ['. ', '\n\n', '\n', ' ']:
                last_sep = text[start:end].rfind(sep)
                if last_sep > chunk_size * 0.5:
                    end = start + last_sep + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap
    return chunks


def graph_to_json(G):
    type_color_map = {}
    nodes = []
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'Unknown')
        if node_type not in type_color_map:
            idx = len(type_color_map) % len(ORION_COLORS)
            type_color_map[node_type] = ORION_COLORS[idx]
        color = type_color_map[node_type]
        nodes.append({
            'id': node,
            'label': node,
            'fullName': node,
            'type': node_type,
            'description': data.get('description', ''),
            'color': color
        })
    edges = []
    for src, tgt, data in G.edges(data=True):
        edges.append({
            'from': src, 'to': tgt,
            'relation': data.get('relation', ''),
            'description': data.get('description', '')
        })
    return {'nodes': nodes, 'edges': edges, 'typeColors': type_color_map}


def get_full_context(G):
    lines = ['Knowledge Graph Summary:', '']
    by_type = {}
    for node, data in G.nodes(data=True):
        t = data.get('type', 'Unknown')
        by_type.setdefault(t, []).append((node, data))
    lines.append('ENTITIES:')
    for entity_type, nodes_list in by_type.items():
        lines.append('  ' + entity_type + ':')
        for name, data in nodes_list:
            lines.append('    - ' + name + ': ' + data.get('description', ''))
    lines.append('')
    lines.append('RELATIONSHIPS:')
    for src, tgt, data in G.edges(data=True):
        lines.append('  ' + src + ' --[' + data['relation'] + ']--> ' + tgt + ': ' + data.get('description', ''))
    return '\n'.join(lines)


# --- Background graph building ---
def build_graph_async(session_id, text):
    session = sessions[session_id]
    session['status'] = 'building'
    session['source_text'] = text

    chunks = chunk_text(text)
    total = len(chunks)
    session['total_chunks'] = total
    G = nx.DiGraph()

    for i, chunk in enumerate(chunks):
        session['current_chunk'] = i + 1
        try:
            result = extract_entities(chunk)
            for entity in result.get('entities', []):
                if entity['name'] not in G:
                    G.add_node(entity['name'], type=entity['type'],
                               description=entity['description'])
            for rel in result.get('relationships', []):
                if rel['source'] not in G:
                    G.add_node(rel['source'], type='Unknown', description='')
                if rel['target'] not in G:
                    G.add_node(rel['target'], type='Unknown', description='')
                if not G.has_edge(rel['source'], rel['target']):
                    G.add_edge(rel['source'], rel['target'],
                               relation=rel['relation'],
                               description=rel['description'])
            session['graph'] = G
            session['graph_data'] = graph_to_json(G)
        except Exception as e:
            session.setdefault('errors', []).append('Chunk ' + str(i+1) + ': ' + str(e))

    session['status'] = 'done'


# --- File parsing ---
def extract_text_from_file(file_obj, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext in ('txt', 'md', 'csv'):
        return file_obj.read().decode('utf-8', errors='ignore')

    elif ext == 'pdf':
        try:
            import fitz
            pdf = fitz.open(stream=file_obj.read(), filetype='pdf')
            return '\n'.join([page.get_text() for page in pdf])
        except ImportError:
            return '[Error: PyMuPDF not installed for PDF support]'

    elif ext == 'docx':
        try:
            from docx import Document
            import io
            doc = Document(io.BytesIO(file_obj.read()))
            return '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
        except ImportError:
            return '[Error: python-docx not installed for DOCX support]'

    elif ext == 'pptx':
        try:
            from pptx import Presentation
            import io
            prs = Presentation(io.BytesIO(file_obj.read()))
            texts = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for para in shape.text_frame.paragraphs:
                            t = para.text.strip()
                            if t:
                                texts.append(t)
            return '\n'.join(texts)
        except ImportError:
            return '[Error: python-pptx not installed for PPTX support]'

    elif ext == 'xlsx':
        try:
            import openpyxl
            import io
            wb = openpyxl.load_workbook(io.BytesIO(file_obj.read()), read_only=True)
            texts = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    vals = [str(c) for c in row if c is not None]
                    if vals:
                        texts.append(' | '.join(vals))
            return '\n'.join(texts)
        except ImportError:
            return '[Error: openpyxl not installed for XLSX support]'

    elif ext == 'eml':
        try:
            import email
            from email import policy
            msg = email.message_from_bytes(file_obj.read(), policy=policy.default)
            parts = []
            parts.append('From: ' + str(msg.get('From', '')))
            parts.append('To: ' + str(msg.get('To', '')))
            parts.append('Date: ' + str(msg.get('Date', '')))
            parts.append('Subject: ' + str(msg.get('Subject', '')))
            parts.append('')
            body = msg.get_body(preferencelist=('plain', 'html'))
            if body:
                content = body.get_content()
                if body.get_content_type() == 'text/html':
                    import re as _re
                    content = _re.sub(r'<[^>]+>', ' ', content)
                parts.append(content)
            return '\n'.join(parts)
        except Exception as e:
            return '[Error parsing EML: ' + str(e) + ']'

    elif ext == 'msg':
        try:
            import extract_msg
            import io
            msg = extract_msg.Message(io.BytesIO(file_obj.read()))
            parts = []
            parts.append('From: ' + str(msg.sender or ''))
            parts.append('To: ' + str(msg.to or ''))
            parts.append('Date: ' + str(msg.date or ''))
            parts.append('Subject: ' + str(msg.subject or ''))
            parts.append('')
            parts.append(str(msg.body or ''))
            return '\n'.join(parts)
        except ImportError:
            return '[Error: extract-msg not installed for MSG support]'

    else:
        return file_obj.read().decode('utf-8', errors='ignore')


# --- Flask Routes ---
@app.route('/upload', methods=['POST'])
def api_upload():
    if 'file' not in request.files:
        return json_response({'error': 'No file provided'}, 400)
    f = request.files['file']
    if not f.filename:
        return json_response({'error': 'No file selected'}, 400)
    text = extract_text_from_file(f, f.filename)
    return json_response({'text': text, 'filename': f.filename})


@app.route('/build', methods=['POST'])
def api_build():
    data = request.get_json(force=True)
    text = data.get('text', '').strip()
    if not text:
        return json_response({'error': 'No text provided'}, 400)

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        'status': 'starting',
        'current_chunk': 0,
        'total_chunks': 0,
        'graph': None,
        'graph_data': {'nodes': [], 'edges': [], 'typeColors': {}},
        'source_text': text,
        'messages': [],
        'errors': []
    }

    thread = threading.Thread(target=build_graph_async, args=(session_id, text))
    thread.daemon = True
    thread.start()

    return json_response({'session_id': session_id})


@app.route('/status/<session_id>')
def api_status(session_id):
    session = sessions.get(session_id)
    if not session:
        return json_response({'error': 'Session not found'}, 404)
    return json_response({
        'status': session['status'],
        'current_chunk': session['current_chunk'],
        'total_chunks': session['total_chunks'],
        'graph_data': session['graph_data'],
        'errors': session.get('errors', [])
    })


@app.route('/report/<session_id>', methods=['POST'])
def api_report(session_id):
    session = sessions.get(session_id)
    if not session or not session.get('graph'):
        return json_response({'error': 'No graph built yet'}, 400)

    ctx = get_full_context(session['graph'])
    prompt = """You are an analyst generating a research report.
Based on the following knowledge graph data, write a detailed analysis report.

""" + ctx + """

Original source text:
""" + session['source_text'] + """

Write a report with these sections:
1. Executive Summary (2-3 sentences)
2. Key Entities & Their Roles
3. Key Relationships & Dynamics
4. Outlook & Implications

Be concise and professional."""

    completion = llm.new_completion()
    completion.with_message(prompt)
    resp = completion.execute()
    return json_response({'report': resp.text})


@app.route('/ask/<session_id>', methods=['POST'])
def api_ask(session_id):
    session = sessions.get(session_id)
    if not session or not session.get('graph'):
        return json_response({'error': 'No graph built yet'}, 400)

    data = request.get_json(force=True)
    question = data.get('question', '').strip()
    if not question:
        return json_response({'error': 'No question provided'}, 400)

    ctx = get_full_context(session['graph'])
    prompt = """You are a research assistant. Answer the question using ONLY the provided data.
If the answer is not in the data, say so.

Knowledge Graph:
""" + ctx + """

Source Text:
""" + session['source_text'] + """

Question: """ + question + """

Answer concisely."""

    completion = llm.new_completion()
    completion.with_message(prompt)
    resp = completion.execute()

    session['messages'].append({'role': 'user', 'content': question})
    session['messages'].append({'role': 'assistant', 'content': resp.text})

    return json_response({'answer': resp.text})
