// --- State ---
let sessionId = null;
let network = null;
let visNodes = null;
let visEdges = null;
let pollingTimer = null;

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');

        // Resize graph when switching to graph tab
        if (tab.dataset.target === 'panel-graph' && network) {
            setTimeout(() => network.fit(), 100);
        }
    });
});

// --- File upload ---
const fileUpload = document.getElementById('file-upload');
const fileInput = document.getElementById('file-input');
const textarea = document.getElementById('text-input');

fileUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        textarea.value = ev.target.result;
        fileUpload.textContent = 'Loaded: ' + file.name;
    };
    reader.readAsText(file);
});

// --- Build graph ---
const buildBtn = document.getElementById('btn-build');

buildBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return alert('Please provide some text first.');

    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';

    // Reset UI
    document.getElementById('entities-table-body').innerHTML = '';
    document.getElementById('relationships-table-body').innerHTML = '';
    document.getElementById('report-content').innerHTML = '';
    document.getElementById('chat-messages').innerHTML = '';

    // Init vis.js graph
    initGraph();

    // Show building hint
    const hint = document.getElementById('building-hint');
    hint.classList.add('visible');

    try {
        const resp = await fetch('/api/build', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text: text})
        });
        const data = await resp.json();
        sessionId = data.session_id;

        // Start polling for updates
        startPolling();
    } catch (err) {
        alert('Error: ' + err.message);
        buildBtn.disabled = false;
        buildBtn.textContent = 'Build Knowledge Graph';
    }
});

// --- Init vis.js ---
function initGraph() {
    const container = document.getElementById('vis-graph');
    visNodes = new vis.DataSet([]);
    visEdges = new vis.DataSet([]);

    const options = {
        physics: {
            barnesHut: {
                gravitationalConstant: -4000,
                springLength: 150,
                springConstant: 0.05,
                damping: 0.09
            },
            stabilization: {iterations: 100}
        },
        interaction: {
            hover: true,
            dragNodes: true,
            dragView: true,
            zoomView: true,
            tooltipDelay: 200
        },
        nodes: {
            shape: 'dot',
            size: 20,
            borderWidth: 2.5,
            borderWidthSelected: 4,
            color: {
                border: '#ffffff',
                highlight: {border: '#333333'},
                hover: {border: '#333333'}
            },
            shadow: {enabled: true, color: 'rgba(0,0,0,0.15)', size: 6},
            font: {size: 11, color: '#333333', face: 'Arial'}
        },
        edges: {
            arrows: 'to',
            color: {color: '#C0C0C0', highlight: '#3498db', hover: '#888'},
            width: 1.5,
            selectionWidth: 3,
            font: {size: 9, align: 'middle', color: '#666',
                   background: 'rgba(255,255,255,0.9)', strokeWidth: 0},
            smooth: {type: 'continuous'}
        }
    };

    network = new vis.Network(container, {nodes: visNodes, edges: visEdges}, options);
}

// --- Poll for graph updates ---
function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(async () => {
        try {
            const resp = await fetch('/api/status/' + sessionId);
            const data = await resp.json();

            // Update hint
            const hint = document.getElementById('building-hint');
            const hintText = document.getElementById('hint-text');
            if (data.status === 'building') {
                const pct = Math.round((data.current_chunk / data.total_chunks) * 100);
                hintText.textContent = 'Building graph... ' + data.current_chunk + '/' + data.total_chunks + ' (' + pct + '%)';
            }

            // Update graph progressively
            updateGraph(data.graph_data);

            // Done?
            if (data.status === 'done') {
                clearInterval(pollingTimer);
                pollingTimer = null;
                hint.classList.remove('visible');
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build Knowledge Graph';

                // Final update
                updateGraph(data.graph_data);
                updateTables(data.graph_data);

                // Switch to graph tab
                document.querySelector('[data-target="panel-graph"]').click();
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }, 1500);
}

// --- Update vis.js graph incrementally ---
function updateGraph(graphData) {
    if (!graphData || !visNodes || !visEdges) return;

    const existingNodeIds = new Set(visNodes.getIds());
    const existingEdgeKeys = new Set(visEdges.get().map(e => e.from + '>>>' + e.to));

    // Add new nodes
    graphData.nodes.forEach(n => {
        if (!existingNodeIds.has(n.id)) {
            visNodes.add({
                id: n.id,
                label: n.label,
                title: '<b>' + n.fullName + '</b><br>Type: ' + n.type + '<br>' + n.description,
                color: {
                    background: n.color,
                    border: '#ffffff',
                    highlight: {background: n.color, border: '#333333'},
                    hover: {background: n.color, border: '#333333'}
                }
            });
        }
    });

    // Add new edges
    graphData.edges.forEach(e => {
        const key = e.from + '>>>' + e.to;
        if (!existingEdgeKeys.has(key)) {
            visEdges.add({
                from: e.from,
                to: e.to,
                label: e.relation,
                title: e.relation + ': ' + e.description
            });
        }
    });

    // Update legend
    updateLegend(graphData.typeColors);
}

// --- Update legend ---
function updateLegend(typeColors) {
    const container = document.getElementById('legend-items');
    container.innerHTML = '';
    for (const [type, color] of Object.entries(typeColors)) {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = '<span class="legend-dot" style="background:' + color + '"></span>' + type;
        container.appendChild(item);
    }
}

// --- Update entity/relationship tables ---
function updateTables(graphData) {
    // Entities
    const tbody1 = document.getElementById('entities-table-body');
    tbody1.innerHTML = '';
    graphData.nodes.forEach(n => {
        const color = n.color;
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + n.fullName + '</td>' +
            '<td><span class="type-badge" style="background:' + color + '">' + n.type + '</span></td>' +
            '<td>' + n.description + '</td>';
        tbody1.appendChild(tr);
    });

    // Relationships
    const tbody2 = document.getElementById('relationships-table-body');
    tbody2.innerHTML = '';
    graphData.edges.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + e.from + '</td>' +
            '<td><b>' + e.relation + '</b></td>' +
            '<td>' + e.to + '</td>' +
            '<td>' + e.description + '</td>';
        tbody2.appendChild(tr);
    });
}

// --- Generate Report ---
document.getElementById('btn-report').addEventListener('click', async () => {
    if (!sessionId) return alert('Build a graph first.');

    const btn = document.getElementById('btn-report');
    const content = document.getElementById('report-content');
    btn.disabled = true;
    content.innerHTML = '<div class="spinner"></div> Generating report...';

    try {
        const resp = await fetch('/api/report/' + sessionId, {method: 'POST'});
        const data = await resp.json();
        content.innerHTML = formatMarkdown(data.report);
    } catch (err) {
        content.innerHTML = 'Error: ' + err.message;
    }
    btn.disabled = false;
});

// --- Q&A Chat ---
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    if (!sessionId) return alert('Build a graph first.');
    const question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = '';
    chatSendBtn.disabled = true;

    // Add user message
    addChatMessage('user', question);

    // Add loading
    const loadingEl = addChatMessage('assistant', '<div class="spinner"></div> Thinking...');

    try {
        const resp = await fetch('/api/ask/' + sessionId, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        const data = await resp.json();
        loadingEl.querySelector('.chat-bubble').innerHTML = formatMarkdown(data.answer);
    } catch (err) {
        loadingEl.querySelector('.chat-bubble').innerHTML = 'Error: ' + err.message;
    }
    chatSendBtn.disabled = false;
    chatInput.focus();
}

function addChatMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message ' + role;
    div.innerHTML = '<div class="chat-bubble">' + content + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

// --- Simple markdown to HTML ---
function formatMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}
