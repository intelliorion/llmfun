import streamlit as st
import networkx as nx
import json
import re
import dataiku

# --- Page Config ---
st.set_page_config(page_title="MiroFish POC", layout="wide")
st.title("MiroFish POC - Knowledge Graph Builder")

# --- LLM Setup ---
@st.cache_resource
def get_llm():
    client = dataiku.api_client()
    project = client.get_default_project()
    return project.get_llm("openaiLMSOpenAI:gpt-4o")

llm = get_llm()

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


def build_graph(extraction_result):
    G = nx.DiGraph()
    for entity in extraction_result["entities"]:
        G.add_node(entity["name"], type=entity["type"], description=entity["description"])
    for rel in extraction_result["relationships"]:
        if rel["source"] not in G:
            G.add_node(rel["source"], type="Unknown", description="")
        if rel["target"] not in G:
            G.add_node(rel["target"], type="Unknown", description="")
        G.add_edge(rel["source"], rel["target"],
                   relation=rel["relation"], description=rel["description"])
    return G


def get_full_context(G):
    lines = ["Knowledge Graph Summary:", ""]
    by_type = {}
    for node, data in G.nodes(data=True):
        t = data.get("type", "Unknown")
        by_type.setdefault(t, []).append((node, data))
    lines.append("ENTITIES:")
    for entity_type, nodes in by_type.items():
        lines.append(f"  {entity_type}:")
        for name, data in nodes:
            lines.append(f"    - {name}: {data.get('description', '')}")
    lines.append("\nRELATIONSHIPS:")
    for src, tgt, data in G.edges(data=True):
        lines.append(f"  {src} --[{data['relation']}]--> {tgt}: {data.get('description', '')}")
    return "\n".join(lines)


def generate_graph_html(G):
    """Generate interactive graph HTML using vis.js (no pyvis dependency needed)."""
    COLOR_MAP = {
        "Person": "#FF6B6B",
        "Organization": "#4ECDC4",
        "Division": "#45B7D1",
        "Metric": "#FFA07A",
        "Event": "#98D8C8",
        "Technology": "#C490D1",
        "Market": "#F7DC6F",
        "Unknown": "#BDC3C7",
    }

    nodes_js = []
    for node, data in G.nodes(data=True):
        node_type = data.get("type", "Unknown")
        color = COLOR_MAP.get(node_type, "#BDC3C7")
        label = node
        title = f"<b>{node}</b><br>Type: {node_type}<br>{data.get('description', '')}"
        nodes_js.append({
            "id": node, "label": label, "color": color,
            "title": title, "size": 25,
            "font": {"size": 14}
        })

    edges_js = []
    for src, tgt, data in G.edges(data=True):
        relation = data.get("relation", "")
        desc = data.get("description", "")
        edges_js.append({
            "from": src, "to": tgt, "label": relation,
            "title": f"{relation}: {desc}",
            "arrows": "to", "color": {"color": "#888"},
            "font": {"size": 10, "align": "middle"}
        })

    # Legend HTML
    legend_items = ""
    used_types = {G.nodes[n].get("type") for n in G.nodes()}
    for t, c in COLOR_MAP.items():
        if t in used_types:
            legend_items += f'<div><span style="display:inline-block;width:12px;height:12px;background:{c};border-radius:50%;margin-right:6px;"></span>{t}</div>'

    html = f"""
    <html>
    <head>
        <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style>
            #graph-container {{ width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px; position: relative; }}
            #legend {{ position: absolute; top: 10px; right: 10px; background: white; padding: 10px 14px; border: 1px solid #ccc; border-radius: 6px; font-family: Arial; font-size: 12px; z-index: 10; }}
            #legend div {{ margin: 3px 0; }}
        </style>
    </head>
    <body>
        <div style="position:relative;">
            <div id="graph-container"></div>
            <div id="legend"><b>Entity Types</b><br>{legend_items}</div>
        </div>
        <script>
            var nodes = new vis.DataSet({json.dumps(nodes_js)});
            var edges = new vis.DataSet({json.dumps(edges_js)});
            var container = document.getElementById("graph-container");
            var data = {{ nodes: nodes, edges: edges }};
            var options = {{
                physics: {{
                    barnesHut: {{ gravitationalConstant: -5000, springLength: 200, springConstant: 0.05 }}
                }},
                interaction: {{ hover: true, dragNodes: true, dragView: true, zoomView: true }}
            }};
            var network = new vis.Network(container, data, options);
        </script>
    </body>
    </html>
    """
    return html


# --- Session State ---
if "graph" not in st.session_state:
    st.session_state.graph = None
if "result" not in st.session_state:
    st.session_state.result = None
if "source_text" not in st.session_state:
    st.session_state.source_text = ""
if "messages" not in st.session_state:
    st.session_state.messages = []

# --- Sidebar: Input ---
with st.sidebar:
    st.header("1. Input Text")
    input_method = st.radio("Source:", ["Paste Text", "Upload File"])

    if input_method == "Paste Text":
        text_input = st.text_area("Paste your text here:", height=300,
            value="""Morgan Stanley's wealth management division reported strong Q4 2025 results, driven by increased client assets and higher fee-based revenues. CEO Ted Pick highlighted the firm's strategic focus on integrating technology across its advisory platform. The division saw net new assets of $120 billion for the year.

Meanwhile, the institutional securities group faced headwinds from lower trading volumes in fixed income markets. CFO Sharon Yeshaya noted that the firm is investing heavily in AI-driven risk analytics to improve trading desk performance.

Competitor Goldman Sachs also reported mixed results, with its asset management division outperforming while investment banking revenues declined. JPMorgan Chase continued to lead in overall revenue, benefiting from its diversified business model.

Industry analysts from Barclays and UBS forecast that wealth management will remain the key growth driver for large banks in 2026, as interest rate cuts are expected to boost asset valuations and client activity.""")
    else:
        uploaded_file = st.file_uploader("Upload a file", type=["txt", "md", "pdf"])
        text_input = ""
        if uploaded_file:
            if uploaded_file.name.endswith(".pdf"):
                try:
                    import fitz
                    pdf = fitz.open(stream=uploaded_file.read(), filetype="pdf")
                    text_input = "\n".join([page.get_text() for page in pdf])
                except ImportError:
                    st.error("PyMuPDF not available. Upload a .txt file instead.")
            else:
                text_input = uploaded_file.read().decode("utf-8")

    if st.button("Build Knowledge Graph", type="primary", use_container_width=True):
        if text_input.strip():
            st.session_state.source_text = text_input.strip()
            with st.spinner("Extracting entities & relationships..."):
                try:
                    st.session_state.result = extract_entities(llm, text_input.strip())
                    st.session_state.graph = build_graph(st.session_state.result)
                    st.session_state.messages = []
                    st.success(f"Done! {st.session_state.graph.number_of_nodes()} entities, {st.session_state.graph.number_of_edges()} relationships")
                except Exception as e:
                    st.error(f"Error: {e}")
        else:
            st.warning("Please provide some text first.")

# --- Main Area ---
if st.session_state.graph is not None:
    G = st.session_state.graph

    # --- Tabs ---
    tab1, tab2, tab3, tab4 = st.tabs(["Graph", "Entities", "Report", "Q&A"])

    # --- Tab 1: Interactive Graph ---
    with tab1:
        st.subheader("Knowledge Graph")
        graph_html = generate_graph_html(G)
        st.components.v1.html(graph_html, height=650, scrolling=False)

    # --- Tab 2: Entities & Relationships ---
    with tab2:
        col1, col2 = st.columns(2)
        with col1:
            st.subheader("Entities")
            import pandas as pd
            nodes_df = pd.DataFrame([
                {"Name": n, "Type": d.get("type", ""), "Description": d.get("description", "")}
                for n, d in G.nodes(data=True)
            ])
            st.dataframe(nodes_df, use_container_width=True)

        with col2:
            st.subheader("Relationships")
            edges_df = pd.DataFrame([
                {"Source": s, "Relation": d.get("relation", ""), "Target": t, "Description": d.get("description", "")}
                for s, t, d in G.edges(data=True)
            ])
            st.dataframe(edges_df, use_container_width=True)

    # --- Tab 3: Report ---
    with tab3:
        st.subheader("Generated Report")
        if st.button("Generate Report"):
            with st.spinner("Generating report..."):
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
        st.subheader("Ask Questions About Your Data")

        # Display chat history
        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        # Chat input
        if question := st.chat_input("Ask a question about the knowledge graph..."):
            st.session_state.messages.append({"role": "user", "content": question})
            with st.chat_message("user"):
                st.markdown(question)

            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
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
                    st.session_state.messages.append({"role": "assistant", "content": resp.text})

else:
    st.info("Paste text or upload a file in the sidebar, then click 'Build Knowledge Graph' to get started.")
