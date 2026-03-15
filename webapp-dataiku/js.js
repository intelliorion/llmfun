var sessionId = null;
var network = null;
var visNodes = null;
var visEdges = null;
var pollingTimer = null;

// --- Get backend URL (Dataiku standard webapp) ---
function getBackendUrl(path) {
    // Dataiku standard webapps: backend is at the same origin
    // The webapp backend routes are relative to the webapp URL
    // Try dataiku.getWebAppBackendUrl if available, fallback to relative path
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
            fileUpload.innerHTML = 'Loaded: ' + file.name + '<br><span style="font-size:11px;color:#999;">.txt .md .pdf .docx .pptx .xlsx .msg .eml</span>';
        };
        reader.readAsText(file);
    } else {
        // Send binary files to backend for parsing
        fileUpload.innerHTML = '<span class="spinner"></span> Parsing ' + file.name + '...';
        var formData = new FormData();
        formData.append('file', file);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', getBackendUrl('upload'));
        xhr.onload = function() {
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                textarea.value = data.text;
                fileUpload.innerHTML = 'Loaded: ' + file.name + '<br><span style="font-size:11px;color:#999;">.txt .md .pdf .docx .pptx .xlsx .msg .eml</span>';
            } else {
                fileUpload.innerHTML = 'Error parsing file<br><span style="font-size:11px;color:#999;">.txt .md .pdf .docx .pptx .xlsx .msg .eml</span>';
            }
        };
        xhr.onerror = function() {
            fileUpload.innerHTML = 'Upload failed<br><span style="font-size:11px;color:#999;">.txt .md .pdf .docx .pptx .xlsx .msg .eml</span>';
        };
        xhr.send(formData);
    }
});

// --- Build graph ---
var buildBtn = document.getElementById('btn-build');

buildBtn.addEventListener('click', function() {
    var text = textarea.value.trim();
    if (!text) { alert('Please provide some text first.'); return; }

    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';

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
            }
        };
        xhr.onerror = function() {
            alert('Network error');
            buildBtn.disabled = false;
            buildBtn.textContent = 'Build Knowledge Graph';
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
                gravitationalConstant: -4000,
                springLength: 150,
                springConstant: 0.05,
                damping: 0.09
            },
            stabilization: {iterations: 100}
        },
        interaction: {
            hover: true, dragNodes: true, dragView: true,
            zoomView: true, tooltipDelay: 200
        },
        nodes: {
            shape: 'dot', size: 20, borderWidth: 2.5, borderWidthSelected: 4,
            color: { border: '#ffffff', highlight: {border: '#333333'}, hover: {border: '#333333'} },
            shadow: {enabled: true, color: 'rgba(0,0,0,0.15)', size: 6},
            font: {size: 11, color: '#333333', face: 'Arial', multi: 'html', vadjust: -4}
        },
        edges: {
            arrows: 'to',
            color: {color: '#C0C0C0', highlight: '#3498db', hover: '#888'},
            width: 1.5, selectionWidth: 3,
            font: {size: 9, align: 'middle', color: '#666', background: 'rgba(255,255,255,0.9)', strokeWidth: 0},
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
                hintText.textContent = 'Building graph... ' + data.current_chunk + '/' + data.total_chunks + ' (' + pct + '%)';
            }

            updateGraph(data.graph_data);

            if (data.status === 'done') {
                clearInterval(pollingTimer);
                pollingTimer = null;
                hint.classList.remove('visible');
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build Knowledge Graph';
                // Full refresh after dedup — clear and rebuild
                visNodes.clear();
                visEdges.clear();
                updateGraph(data.graph_data);
                updateTables(data.graph_data);
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
            visNodes.add({
                id: n.id, label: n.label,
                title: '<b>' + n.fullName + '</b><br>Type: ' + n.type + '<br>' + n.description,
                color: {
                    background: n.color, border: '#ffffff',
                    highlight: {background: n.color, border: '#333333'},
                    hover: {background: n.color, border: '#333333'}
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
        var item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = '<span class="legend-dot" style="background:' + typeColors[type] + '"></span>' + type;
        container.appendChild(item);
    }
}

function updateTables(graphData) {
    var tbody1 = document.getElementById('entities-table-body');
    tbody1.innerHTML = '';
    graphData.nodes.forEach(function(n) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + n.fullName + '</td>' +
            '<td><span class="type-badge" style="background:' + n.color + '">' + n.type + '</span></td>' +
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
