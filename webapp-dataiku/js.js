var sessionId = null;
var network = null;
var visNodes = null;
var visEdges = null;
var pollingTimer = null;

// --- Manus-style color palette for entities ---
var ENTITY_COLORS = {
    'Person': '#6366f1',
    'Organization': '#0ea5e9',
    'Division': '#8b5cf6',
    'Metric': '#f59e0b',
    'Event': '#ef4444',
    'Technology': '#10b981',
    'Market': '#ec4899',
    'Unknown': '#94a3b8'
};

// --- Get backend URL (Dataiku standard webapp) ---
function getBackendUrl(path) {
    if (typeof dataiku !== 'undefined' && dataiku.getWebAppBackendUrl) {
        return dataiku.getWebAppBackendUrl(path);
    }
    return '/web-apps-backends/' + path;
}

// --- Wait for vis.js to load ---
function waitForVis(callback) {
    if (typeof vis !== 'undefined') {
        callback();
    } else {
        setTimeout(function() { waitForVis(callback); }, 100);
    }
}

// --- Tab switching ---
var allTabs = document.querySelectorAll('.tab');
var allPanels = document.querySelectorAll('.tab-panel');

for (var i = 0; i < allTabs.length; i++) {
    (function(tab) {
        tab.addEventListener('click', function() {
            for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
            for (var j = 0; j < allPanels.length; j++) allPanels[j].classList.remove('active');
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
            if (tab.getAttribute('data-target') === 'panel-graph' && network) {
                setTimeout(function() { network.fit(); }, 100);
            }
        });
    })(allTabs[i]);
}

// --- File upload ---
var fileUpload = document.getElementById('file-upload');
var fileInput = document.getElementById('file-input');
var textarea = document.getElementById('text-input');

fileUpload.addEventListener('click', function() { fileInput.click(); });
fileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;

    var textExts = ['txt', 'md', 'csv'];
    var ext = file.name.split('.').pop().toLowerCase();

    if (textExts.indexOf(ext) !== -1) {
        var reader = new FileReader();
        reader.onload = function(ev) {
            textarea.value = ev.target.result;
            fileUpload.innerHTML = 'Loaded: ' + file.name + '<div class="file-types">.txt .md .pdf .docx .pptx .xlsx .msg .eml</div>';
        };
        reader.readAsText(file);
    } else {
        fileUpload.innerHTML = '<span class="spinner"></span> Parsing ' + file.name + '...';
        var formData = new FormData();
        formData.append('file', file);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', getBackendUrl('upload'));
        xhr.onload = function() {
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                textarea.value = data.text;
                fileUpload.innerHTML = 'Loaded: ' + file.name + '<div class="file-types">.txt .md .pdf .docx .pptx .xlsx .msg .eml</div>';
            } else {
                fileUpload.innerHTML = 'Error parsing file<div class="file-types">.txt .md .pdf .docx .pptx .xlsx .msg .eml</div>';
            }
        };
        xhr.onerror = function() {
            fileUpload.innerHTML = 'Upload failed<div class="file-types">.txt .md .pdf .docx .pptx .xlsx .msg .eml</div>';
        };
        xhr.send(formData);
    }
});

// --- Step indicator helpers ---
function resetSteps() {
    var steps = document.querySelectorAll('.step-indicator');
    for (var i = 0; i < steps.length; i++) {
        steps[i].classList.remove('active', 'done');
    }
    document.getElementById('step-indicators').style.display = 'none';
    document.getElementById('progress-container').style.display = 'none';
    document.getElementById('progress-bar').style.width = '0%';
}

function setStep(stepId, state) {
    document.getElementById('step-indicators').style.display = 'flex';
    var el = document.getElementById(stepId);
    el.classList.remove('active', 'done');
    if (state) el.classList.add(state);
}

function setProgress(pct) {
    document.getElementById('progress-container').style.display = 'block';
    document.getElementById('progress-bar').style.width = pct + '%';
}

// --- Build graph ---
var buildBtn = document.getElementById('btn-build');

buildBtn.addEventListener('click', function() {
    var text = textarea.value.trim();
    if (!text) { alert('Please provide some text first.'); return; }

    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';
    resetSteps();

    document.getElementById('entities-table-body').innerHTML = '';
    document.getElementById('relationships-table-body').innerHTML = '';
    document.getElementById('report-content').innerHTML = '';
    document.getElementById('chat-messages').innerHTML = '';

    waitForVis(function() {
        initGraph();
        var hint = document.getElementById('building-hint');
        hint.classList.add('visible');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', getBackendUrl('build'));
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function() {
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                sessionId = data.session_id;
                startPolling();
            } else {
                alert('Error starting build: ' + xhr.status + ' ' + xhr.responseText.substring(0, 200));
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build Knowledge Graph';
                resetSteps();
            }
        };
        xhr.onerror = function() {
            alert('Network error');
            buildBtn.disabled = false;
            buildBtn.textContent = 'Build Knowledge Graph';
            resetSteps();
        };
        xhr.send(JSON.stringify({text: text}));
    });
});

// --- Init vis.js ---
function initGraph() {
    var container = document.getElementById('vis-graph');
    visNodes = new vis.DataSet([]);
    visEdges = new vis.DataSet([]);

    var options = {
        physics: {
            barnesHut: {
                gravitationalConstant: -3000,
                springLength: 180,
                springConstant: 0.04,
                damping: 0.09
            },
            stabilization: {iterations: 120}
        },
        interaction: {
            hover: true, dragNodes: true, dragView: true,
            zoomView: true, tooltipDelay: 200
        },
        nodes: {
            shape: 'dot', size: 18, borderWidth: 2, borderWidthSelected: 3,
            color: {
                border: 'rgba(255,255,255,0.8)',
                highlight: {border: '#1a1a1a'},
                hover: {border: '#1a1a1a'}
            },
            shadow: {enabled: true, color: 'rgba(0,0,0,0.08)', size: 8, x: 0, y: 2},
            font: {size: 11, color: '#1a1a1a', face: 'system-ui, sans-serif', multi: 'html', vadjust: -4}
        },
        edges: {
            arrows: {to: {enabled: true, scaleFactor: 0.6}},
            color: {color: '#d4d4d4', highlight: '#6366f1', hover: '#a3a3a3'},
            width: 1.2, selectionWidth: 2,
            font: {size: 9, align: 'middle', color: '#999', background: 'rgba(248,248,247,0.95)', strokeWidth: 0},
            smooth: {type: 'continuous'}
        }
    };

    network = new vis.Network(container, {nodes: visNodes, edges: visEdges}, options);
}

// --- Polling ---
function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(function() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', getBackendUrl('status/' + sessionId));
        xhr.onload = function() {
            if (xhr.status !== 200) return;
            var data = JSON.parse(xhr.responseText);

            var hint = document.getElementById('building-hint');
            var hintText = document.getElementById('hint-text');

            if (data.status === 'building') {
                var pct = Math.round((data.current_chunk / data.total_chunks) * 100);
                hintText.textContent = 'Extracting entities... ' + data.current_chunk + '/' + data.total_chunks;
                setProgress(pct * 0.8); // 80% for extraction
                setStep('step-extract', 'active');
            } else if (data.status === 'deduplicating') {
                hintText.textContent = 'Resolving duplicate entities...';
                setProgress(90);
                setStep('step-extract', 'done');
                setStep('step-dedup', 'active');
            }

            updateGraph(data.graph_data);

            if (data.status === 'done') {
                clearInterval(pollingTimer);
                pollingTimer = null;
                hint.classList.remove('visible');
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build Knowledge Graph';
                setProgress(100);
                setStep('step-extract', 'done');
                setStep('step-dedup', 'done');
                setStep('step-done', 'done');
                // Full refresh after dedup
                visNodes.clear();
                visEdges.clear();
                updateGraph(data.graph_data);
                updateTables(data.graph_data);
                // Fade out progress after a moment
                setTimeout(function() {
                    document.getElementById('progress-container').style.display = 'none';
                }, 2000);
            }
        };
        xhr.send();
    }, 1500);
}

// --- Update graph incrementally ---
function updateGraph(graphData) {
    if (!graphData || !visNodes || !visEdges) return;

    var existingNodeIds = {};
    visNodes.getIds().forEach(function(id) { existingNodeIds[id] = true; });

    var existingEdgeKeys = {};
    visEdges.get().forEach(function(e) { existingEdgeKeys[e.from + '>>>' + e.to] = true; });

    graphData.nodes.forEach(function(n) {
        if (!existingNodeIds[n.id]) {
            var nodeColor = ENTITY_COLORS[n.type] || ENTITY_COLORS['Unknown'];
            visNodes.add({
                id: n.id, label: n.label,
                title: '<b>' + n.fullName + '</b><br>Type: ' + n.type + '<br>' + n.description,
                color: {
                    background: nodeColor,
                    border: 'rgba(255,255,255,0.8)',
                    highlight: {background: nodeColor, border: '#1a1a1a'},
                    hover: {background: nodeColor, border: '#1a1a1a'}
                }
            });
        }
    });

    graphData.edges.forEach(function(e) {
        var key = e.from + '>>>' + e.to;
        if (!existingEdgeKeys[key]) {
            visEdges.add({
                from: e.from, to: e.to,
                label: e.relation,
                title: e.relation + ': ' + e.description
            });
        }
    });

    updateLegend(graphData.typeColors);
}

function updateLegend(typeColors) {
    var container = document.getElementById('legend-items');
    container.innerHTML = '';
    for (var type in typeColors) {
        var color = ENTITY_COLORS[type] || typeColors[type];
        var item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = '<span class="legend-dot" style="background:' + color + '"></span>' + type;
        container.appendChild(item);
    }
}

function updateTables(graphData) {
    var tbody1 = document.getElementById('entities-table-body');
    tbody1.innerHTML = '';
    graphData.nodes.forEach(function(n) {
        var color = ENTITY_COLORS[n.type] || n.color;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + n.fullName + '</td>' +
            '<td><span class="type-badge" style="background:' + color + '">' + n.type + '</span></td>' +
            '<td>' + n.description + '</td>';
        tbody1.appendChild(tr);
    });

    var tbody2 = document.getElementById('relationships-table-body');
    tbody2.innerHTML = '';
    graphData.edges.forEach(function(e) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + e.from + '</td>' +
            '<td><b>' + e.relation + '</b></td>' +
            '<td>' + e.to + '</td>' +
            '<td>' + e.description + '</td>';
        tbody2.appendChild(tr);
    });
}

// --- Report ---
document.getElementById('btn-report').addEventListener('click', function() {
    if (!sessionId) { alert('Build a graph first.'); return; }

    var btn = document.getElementById('btn-report');
    var content = document.getElementById('report-content');
    btn.disabled = true;
    content.innerHTML = '<span class="spinner"></span> Generating report...';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', getBackendUrl('report/' + sessionId));
    xhr.onload = function() {
        var data = JSON.parse(xhr.responseText);
        content.innerHTML = formatMarkdown(data.report);
        btn.disabled = false;
    };
    xhr.onerror = function() {
        content.innerHTML = 'Error generating report.';
        btn.disabled = false;
    };
    xhr.send();
});

// --- Q&A Chat ---
var chatInput = document.getElementById('chat-input');
var chatSendBtn = document.getElementById('chat-send');

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function sendMessage() {
    if (!sessionId) { alert('Build a graph first.'); return; }
    var question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = '';
    chatSendBtn.disabled = true;

    addChatMessage('user', question);
    var loadingEl = addChatMessage('assistant', '<span class="spinner"></span> Thinking...');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', getBackendUrl('ask/' + sessionId));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        var data = JSON.parse(xhr.responseText);
        loadingEl.querySelector('.chat-bubble').innerHTML = formatMarkdown(data.answer);
        chatSendBtn.disabled = false;
        chatInput.focus();
    };
    xhr.onerror = function() {
        loadingEl.querySelector('.chat-bubble').innerHTML = 'Error getting answer.';
        chatSendBtn.disabled = false;
    };
    xhr.send(JSON.stringify({question: question}));
}

function addChatMessage(role, content) {
    var container = document.getElementById('chat-messages');
    var empty = document.getElementById('chat-empty');
    if (empty) empty.remove();

    var div = document.createElement('div');
    div.className = 'chat-message ' + role;
    div.innerHTML = '<div class="chat-bubble">' + content + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function formatMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
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
