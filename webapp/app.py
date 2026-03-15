import streamlit as st
import networkx as nx
import json
import re
import time
import dataiku
import pandas as pd

# --- Page Config ---
st.set_page_config(page_title="MiroFish POC", layout="wide")
st.title("MiroFish POC - Knowledge Graph Builder")

# --- LLM Setup ---
@st.cache_resource
def get_llm():
    client = dataiku.api_client()
    project = client.get_default_project()
    return project.get_llm('openai:MSOpenAI:gpt-4o')

llm = get_llm()

# --- MiroFish Color Palette ---
MIROFISH_COLORS = ['#FF6B35', '#004E89', '#7B2D8E', '#1A936F', '#C5283D',
                   '#E9724C', '#3498db', '#9b59b6', '#27ae60', '#f39c12']

def get_type_color(entity_type, type_color_map):
    if entity_type not in type_color_map:
        idx = len(type_color_map) % len(MIROFISH_COLORS)
        type_color_map[entity_type] = MIROFISH_COLORS[idx]
    return type_color_map[entity_type]

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


def extract_entities(llm, text):
    completion = llm.new_completion()
    completion.with_message(EXTRACTION_PROMPT.format(text=text))
    resp = completion.execute()
    cleaned = clean_llm_json(resp.text)
    return json.loads(cleaned)


def chunk_text(text, chunk_size=500, overlap=50):
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


def build_graph(extraction_result):
    G = nx.DiGraph()
    for entity in extraction_result['entities']:
        G.add_node(entity['name'], type=entity['type'], description=entity['description'])
    for rel in extraction_result['relationships']:
        if rel['source'] not in G:
            G.add_node(rel['source'], type='Unknown', description='')
        if rel['target'] not in G:
            G.add_node(rel['target'], type='Unknown', description='')
        G.add_edge(rel['source'], rel['target'],
                   relation=rel['relation'], description=rel['description'])
    return G


def merge_graph(G, extraction_result):
    for entity in extraction_result['entities']:
        if entity['name'] not in G:
            G.add_node(entity['name'], type=entity['type'], description=entity['description'])
    for rel in extraction_result['relationships']:
        if rel['source'] not in G:
            G.add_node(rel['source'], type='Unknown', description='')
        if rel['target'] not in G:
            G.add_node(rel['target'], type='Unknown', description='')
        if not G.has_edge(rel['source'], rel['target']):
            G.add_edge(rel['source'], rel['target'],
                       relation=rel['relation'], description=rel['description'])
    return G


def get_full_context(G):
    lines = ['Knowledge Graph Summary:', '']
    by_type = {}
    for node, data in G.nodes(data=True):
        t = data.get('type', 'Unknown')
        by_type.setdefault(t, []).append((node, data))
    lines.append('ENTITIES:')
    for entity_type, nodes in by_type.items():
        lines.append(f'  {entity_type}:')
        for name, data in nodes:
            lines.append(f'    - {name}: {data.get("description", "")}')
    lines.append('\nRELATIONSHIPS:')
    for src, tgt, data in G.edges(data=True):
        lines.append(f'  {src} --[{data["relation"]}]--> {tgt}: {data.get("description", "")}')
    return '\n'.join(lines)


def generate_graph_html(G):
    """Generate interactive graph HTML with circular nodes matching MiroFish style."""
    type_color_map = {}

    nodes_js = []
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'Unknown')
        color = get_type_color(node_type, type_color_map)
        label = node if len(node) <= 12 else node[:11] + '...'
        title = '<b>{}</b><br>Type: {}<br>{}'.format(node, node_type, data.get('description', ''))
        nodes_js.append({
            'id': node, 'label': label, 'title': title,
            'color': {
                'background': color,
                'border': '#ffffff',
                'highlight': {'background': color, 'border': '#333333'},
                'hover': {'background': color, 'border': '#333333'}
            },
            'shape': 'dot',
            'size': 20,
            'borderWidth': 2.5,
            'borderWidthSelected': 4,
            'font': {'size': 11, 'color': '#333333', 'face': 'Arial'}
        })

    edges_js = []
    edge_count = {}
    for src, tgt, data in G.edges(data=True):
        key = tuple(sorted([src, tgt]))
        edge_count[key] = edge_count.get(key, 0) + 1
        relation = data.get('relation', '')
        desc = data.get('description', '')
        smooth = {}
        if edge_count[key] > 1:
            smooth = {'type': 'curvedCW', 'roundness': 0.2 * edge_count[key]}
        edges_js.append({
            'from': src, 'to': tgt, 'label': relation,
            'title': '{}: {}'.format(relation, desc),
            'arrows': 'to',
            'color': {'color': '#C0C0C0', 'highlight': '#3498db', 'hover': '#888'},
            'width': 1.5,
            'selectionWidth': 3,
            'font': {'size': 9, 'align': 'middle', 'color': '#666',
                     'background': 'rgba(255,255,255,0.9)', 'strokeWidth': 0},
            'smooth': smooth if smooth else False
        })

    # Legend
    legend_items = ''
    for t, c in type_color_map.items():
        legend_items += '<div style="display:flex;align-items:center;margin:4px 0;">'
        legend_items += '<span style="display:inline-block;width:12px;height:12px;background:{};border-radius:50%;border:2px solid #fff;margin-right:8px;box-shadow:0 0 2px rgba(0,0,0,0.3);"></span>'.format(c)
        legend_items += '<span style="color:#333;font-size:12px;">{}</span></div>'.format(t)

    html = """
    <html>
    <head>
        <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style>
            body {{ margin: 0; padding: 0; }}
            #graph-container {{
                width: 100%; height: 620px;
                border: 1px solid #e0e0e0; border-radius: 8px;
                background: #FAFAFA;
                background-image: radial-gradient(#D0D0D0 1px, transparent 1px);
                background-size: 24px 24px;
            }}
            #legend {{
                position: absolute; bottom: 16px; left: 16px;
                background: rgba(255,255,255,0.95); padding: 12px 16px;
                border: 1px solid #e0e0e0; border-radius: 8px;
                font-family: Arial, sans-serif; z-index: 10;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }}
            #legend b {{ font-size: 13px; color: #333; }}
            #status-hint {{
                position: absolute; bottom: 16px; left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.65); color: #fff;
                padding: 8px 20px; border-radius: 20px;
                font-family: Arial; font-size: 13px;
                backdrop-filter: blur(8px); z-index: 10;
                display: flex; align-items: center; gap: 8px;
            }}
            #status-hint .dot {{
                width: 8px; height: 8px; border-radius: 50%;
                background: #4CAF50;
                animation: breathe 2s ease-in-out infinite;
            }}
            @keyframes breathe {{
                0%, 100% {{ opacity: 0.7; transform: scale(1); box-shadow: 0 0 2px rgba(76,175,80,0.3); }}
                50% {{ opacity: 1; transform: scale(1.3); box-shadow: 0 0 8px rgba(76,175,80,0.6); }}
            }}
        </style>
    </head>
    <body>
        <div style="position:relative;">
            <div id="graph-container"></div>
            <div id="legend"><b>Entity Types</b><br>{legend}</div>
        </div>
        <script>
            var nodes = new vis.DataSet({nodes});
            var edges = new vis.DataSet({edges});
            var container = document.getElementById("graph-container");
            var data = {{ nodes: nodes, edges: edges }};
            var options = {{
                physics: {{
                    barnesHut: {{
                        gravitationalConstant: -4000,
                        springLength: 150,
                        springConstant: 0.05,
                        damping: 0.09
                    }},
                    stabilization: {{ iterations: 100 }}
                }},
                interaction: {{
                    hover: true, dragNodes: true, dragView: true,
                    zoomView: true, tooltipDelay: 200
                }},
                nodes: {{
                    shape: "dot",
                    borderWidth: 2.5,
                    shadow: {{ enabled: true, color: "rgba(0,0,0,0.15)", size: 6 }}
                }},
                edges: {{
                    smooth: {{ type: "continuous" }}
                }}
            }};
            var network = new vis.Network(container, data, options);
        </script>
    </body>
    </html>
    """.format(
        legend=legend_items,
        nodes=json.dumps(nodes_js),
        edges=json.dumps(edges_js)
    )
    return html


def generate_building_html(G, chunk_idx, total_chunks):
    """Generate graph HTML with building animation hint."""
    base_html = generate_graph_html(G)
    progress_pct = int((chunk_idx + 1) / total_chunks * 100)
    hint = '<div id="status-hint"><div class="dot"></div>Building graph... {}/{}  ({}%)</div>'.format(
        chunk_idx + 1, total_chunks, progress_pct)
    base_html = base_html.replace('</div>\n        <script>', hint + '</div>\n        <script>')
    return base_html


# --- Session State ---
if 'graph' not in st.session_state:
    st.session_state.graph = None
if 'result' not in st.session_state:
    st.session_state.result = None
if 'source_text' not in st.session_state:
    st.session_state.source_text = ''
if 'messages' not in st.session_state:
    st.session_state.messages = []
if 'building' not in st.session_state:
    st.session_state.building = False

# --- Sidebar: Input ---
with st.sidebar:
    st.header('1. Input Text')
    input_method = st.radio('Source:', ['Paste Text', 'Upload File'])

    if input_method == 'Paste Text':
        text_input = st.text_area('Paste your text here:', height=300,
            value="""Morgan Stanley's wealth management division reported strong Q4 2025 results, driven by increased client assets and higher fee-based revenues. CEO Ted Pick highlighted the firm's strategic focus on integrating technology across its advisory platform. The division saw net new assets of $120 billion for the year.

Meanwhile, the institutional securities group faced headwinds from lower trading volumes in fixed income markets. CFO Sharon Yeshaya noted that the firm is investing heavily in AI-driven risk analytics to improve trading desk performance.

Competitor Goldman Sachs also reported mixed results, with its asset management division outperforming while investment banking revenues declined. JPMorgan Chase continued to lead in overall revenue, benefiting from its diversified business model.

Industry analysts from Barclays and UBS forecast that wealth management will remain the key growth driver for large banks in 2026, as interest rate cuts are expected to boost asset valuations and client activity.""")
    else:
        uploaded_file = st.file_uploader('Upload a file', type=['txt', 'md', 'pdf'])
        text_input = ''
        if uploaded_file:
            if uploaded_file.name.endswith('.pdf'):
                try:
                    import fitz
                    pdf = fitz.open(stream=uploaded_file.read(), filetype='pdf')
                    text_input = '\n'.join([page.get_text() for page in pdf])
                except ImportError:
                    st.error('PyMuPDF not available. Upload a .txt file instead.')
            else:
                text_input = uploaded_file.read().decode('utf-8')

    build_clicked = st.button('Build Knowledge Graph', type='primary', use_container_width=True)

# --- Main Area ---
graph_placeholder = st.empty()
status_placeholder = st.empty()

if build_clicked and text_input.strip():
    st.session_state.source_text = text_input.strip()
    st.session_state.messages = []
    st.session_state.graph = None
    st.session_state.result = {'entities': [], 'relationships': []}

    # Chunk the text for progressive building
    chunks = chunk_text(text_input.strip(), chunk_size=400, overlap=30)

    G = nx.DiGraph()
    total = len(chunks)

    for i, chunk in enumerate(chunks):
        status_placeholder.markdown(
            '<div style="text-align:center;padding:8px;background:rgba(0,0,0,0.05);border-radius:8px;">'
            '<span style="color:#4CAF50;font-size:18px;">&#9679;</span> '
            '<b>Processing chunk {}/{}</b> — extracting entities...'
            '</div>'.format(i + 1, total),
            unsafe_allow_html=True
        )
        try:
            result = extract_entities(llm, chunk)
            G = merge_graph(G, result)
            # Merge into cumulative result
            st.session_state.result['entities'].extend(result.get('entities', []))
            st.session_state.result['relationships'].extend(result.get('relationships', []))
        except Exception as e:
            status_placeholder.warning('Chunk {} failed: {}'.format(i + 1, e))
            continue

        # Update graph display progressively
        html = generate_building_html(G, i, total)
        graph_placeholder.components.v1.html(html, height=660, scrolling=False)
        time.sleep(0.3)

    st.session_state.graph = G
    status_placeholder.success(
        'Done! {} entities, {} relationships extracted from {} chunks.'.format(
            G.number_of_nodes(), G.number_of_edges(), total))

    # Final render without building hint
    final_html = generate_graph_html(G)
    graph_placeholder.components.v1.html(final_html, height=660, scrolling=False)

elif st.session_state.graph is not None:
    G = st.session_state.graph

    # --- Tabs ---
    tab1, tab2, tab3, tab4 = st.tabs(['Graph', 'Entities', 'Report', 'Q&A'])

    # --- Tab 1: Interactive Graph ---
    with tab1:
        graph_html = generate_graph_html(G)
        st.components.v1.html(graph_html, height=660, scrolling=False)

    # --- Tab 2: Entities & Relationships ---
    with tab2:
        col1, col2 = st.columns(2)
        with col1:
            st.subheader('Entities')
            nodes_df = pd.DataFrame([
                {'Name': n, 'Type': d.get('type', ''), 'Description': d.get('description', '')}
                for n, d in G.nodes(data=True)
            ])
            st.dataframe(nodes_df, use_container_width=True)

        with col2:
            st.subheader('Relationships')
            edges_df = pd.DataFrame([
                {'Source': s, 'Relation': d.get('relation', ''), 'Target': t, 'Description': d.get('description', '')}
                for s, t, d in G.edges(data=True)
            ])
            st.dataframe(edges_df, use_container_width=True)

    # --- Tab 3: Report ---
    with tab3:
        st.subheader('Generated Report')
        if st.button('Generate Report'):
            with st.spinner('Generating report...'):
                ctx = get_full_context(G)
                prompt = f"""You are an analyst generating a research report.
Based on the following knowledge graph data, write a detailed analysis report.

{ctx}

Original source text:
{st.session_state.source_text}

Write a report with these sections:
1. Executive Summary (2-3 sentences)
2. Key Entities & Their Roles
3. Key Relationships & Dynamics
4. Outlook & Implications

Be concise and professional."""
                completion = llm.new_completion()
                completion.with_message(prompt)
                resp = completion.execute()
                st.markdown(resp.text)

    # --- Tab 4: Q&A ---
    with tab4:
        st.subheader('Ask Questions About Your Data')

        for msg in st.session_state.messages:
            with st.chat_message(msg['role']):
                st.markdown(msg['content'])

        if question := st.chat_input('Ask a question about the knowledge graph...'):
            st.session_state.messages.append({'role': 'user', 'content': question})
            with st.chat_message('user'):
                st.markdown(question)

            with st.chat_message('assistant'):
                with st.spinner('Thinking...'):
                    ctx = get_full_context(G)
                    prompt = f"""You are a research assistant. Answer the question using ONLY the provided data.
If the answer is not in the data, say so.

Knowledge Graph:
{ctx}

Source Text:
{st.session_state.source_text}

Question: {question}

Answer concisely."""
                    completion = llm.new_completion()
                    completion.with_message(prompt)
                    resp = completion.execute()
                    st.markdown(resp.text)
                    st.session_state.messages.append({'role': 'assistant', 'content': resp.text})

else:
    st.info('Paste text or upload a file in the sidebar, then click "Build Knowledge Graph" to get started.')
