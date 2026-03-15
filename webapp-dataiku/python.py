import json
import re
import threading
import uuid
import networkx as nx
import dataiku

# --- State ---
sessions = {}

# --- LLM ---
def get_llm():
    client = dataiku.api_client()
    project = client.get_default_project()
    return project.get_llm('openai:MSOpenAI:gpt-4o')

llm = get_llm()

# --- MiroFish Colors ---
MIROFISH_COLORS = ['#FF6B35', '#004E89', '#7B2D8E', '#1A936F', '#C5283D',
                   '#E9724C', '#3498db', '#9b59b6', '#27ae60', '#f39c12']

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
            idx = len(type_color_map) % len(MIROFISH_COLORS)
            type_color_map[node_type] = MIROFISH_COLORS[idx]
        color = type_color_map[node_type]
        nodes.append({
            'id': node,
            'label': node if len(node) <= 12 else node[:11] + '...',
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


# --- Flask Routes ---
@app.route('/api/build', methods=['POST'])
def api_build():
    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        return json.dumps({'error': 'No text provided'}), 400

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

    return json.dumps({'session_id': session_id})


@app.route('/api/status/<session_id>')
def api_status(session_id):
    session = sessions.get(session_id)
    if not session:
        return json.dumps({'error': 'Session not found'}), 404
    return json.dumps({
        'status': session['status'],
        'current_chunk': session['current_chunk'],
        'total_chunks': session['total_chunks'],
        'graph_data': session['graph_data'],
        'errors': session.get('errors', [])
    })


@app.route('/api/report/<session_id>', methods=['POST'])
def api_report(session_id):
    session = sessions.get(session_id)
    if not session or not session.get('graph'):
        return json.dumps({'error': 'No graph built yet'}), 400

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
    return json.dumps({'report': resp.text})


@app.route('/api/ask/<session_id>', methods=['POST'])
def api_ask(session_id):
    session = sessions.get(session_id)
    if not session or not session.get('graph'):
        return json.dumps({'error': 'No graph built yet'}), 400

    data = request.get_json()
    question = data.get('question', '').strip()
    if not question:
        return json.dumps({'error': 'No question provided'}), 400

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

    return json.dumps({'answer': resp.text})
