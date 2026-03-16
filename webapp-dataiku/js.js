var sessionId = null;
var network = null;
var visNodes = null;
var visEdges = null;
var pollingTimer = null;
var graphDataStore = null; // Full graph data for lookups
var edgeLabelsVisible = true;
var hiddenTypes = {};
var selectedModel = 'gpt-4o';

// --- Dynamic color palette for entity types ---
var COLOR_PALETTE = [
    '#6366f1', '#0ea5e9', '#8b5cf6', '#f97316', '#14b8a6',
    '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#06b6d4',
    '#a855f7', '#84cc16', '#f43f5e', '#22d3ee', '#e879f9'
];
var ENTITY_COLORS = {};
var colorIndex = 0;

function getEntityColor(type) {
    if (!ENTITY_COLORS[type]) {
        ENTITY_COLORS[type] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
        colorIndex++;
    }
    return ENTITY_COLORS[type];
}

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

// --- Input mode toggle ---
var toggleBtns = document.querySelectorAll('.toggle-btn');
var inputModes = document.querySelectorAll('.input-mode');
var currentMode = 'text';
var uploadedText = '';

for (var t = 0; t < toggleBtns.length; t++) {
    (function(btn) {
        btn.addEventListener('click', function() {
            currentMode = btn.getAttribute('data-mode');
            for (var k = 0; k < toggleBtns.length; k++) toggleBtns[k].classList.remove('active');
            for (var k = 0; k < inputModes.length; k++) inputModes[k].classList.remove('active');
            btn.classList.add('active');
            document.getElementById('mode-' + currentMode).classList.add('active');
        });
    })(toggleBtns[t]);
}

// --- Model selector (dynamic) ---
var modelSelect = document.getElementById('model-select');

function loadModels() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', getBackendUrl('models'));
    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var models = data.models || [];
            modelSelect.innerHTML = '';
            if (models.length === 0) {
                modelSelect.innerHTML = '<option value="">No models available</option>';
                return;
            }
            for (var i = 0; i < models.length; i++) {
                var opt = document.createElement('option');
                opt.value = models[i];
                // Show a friendly label: extract model name from ID like "openai:MSOpenAI:gpt-4o"
                var parts = models[i].split(':');
                opt.textContent = parts[parts.length - 1];
                modelSelect.appendChild(opt);
            }
            selectedModel = models[0];
        }
    };
    xhr.onerror = function() {
        modelSelect.innerHTML = '<option value="">Failed to load</option>';
    };
    xhr.send();
}

modelSelect.addEventListener('change', function() {
    selectedModel = modelSelect.value;
});

loadModels();

// --- Domain selector (dynamic) ---
var domainSelect = document.getElementById('domain-select');
var selectedDomain = 'auto';

function loadDomains() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', getBackendUrl('domains'));
    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var domains = data.domains || [];
            domainSelect.innerHTML = '';
            for (var i = 0; i < domains.length; i++) {
                var opt = document.createElement('option');
                opt.value = domains[i].key;
                opt.textContent = domains[i].name;
                domainSelect.appendChild(opt);
            }
            selectedDomain = 'auto';
        }
    };
    xhr.send();
}

domainSelect.addEventListener('change', function() {
    selectedDomain = domainSelect.value;
});

loadDomains();

// --- File upload (multi-file) ---
var fileUpload = document.getElementById('file-upload');
var fileInput = document.getElementById('file-input');
var fileListEl = document.getElementById('file-list');
var textarea = document.getElementById('text-input');
var uploadedFiles = [];
var fileIdCounter = 0;

var UPLOAD_AREA_HTML = '<div class="upload-icon">+</div><div class="upload-text">Drop files or click to upload</div><div class="file-types">.txt .md .csv .pdf .docx .pptx .xlsx .msg .eml .png .jpg .jpeg .gif .tiff .webp</div>';

function addFile(name, text) {
    var id = ++fileIdCounter;
    uploadedFiles.push({name: name, text: text, id: id});
    uploadedText = uploadedFiles.map(function(f) { return '=== ' + f.name + ' ===\n' + f.text; }).join('\n\n');
    renderFileList();
}

function removeFile(id) {
    uploadedFiles = uploadedFiles.filter(function(f) { return f.id !== id; });
    uploadedText = uploadedFiles.map(function(f) { return '=== ' + f.name + ' ===\n' + f.text; }).join('\n\n');
    renderFileList();
}

function renderFileList() {
    fileListEl.innerHTML = '';
    uploadedFiles.forEach(function(f) {
        var ext = f.name.split('.').pop().toLowerCase();
        var chars = f.text.length;
        var meta = ext.toUpperCase() + ' \u00b7 ' + (chars > 1000 ? Math.round(chars / 1000) + 'k' : chars) + ' chars';
        var item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = '<div class="file-item-icon">' + ext + '</div>' +
            '<div class="file-item-info"><div class="file-item-name">' + f.name + '</div><div class="file-item-meta">' + meta + '</div></div>' +
            '<button class="file-item-remove" data-id="' + f.id + '">\u00d7</button>';
        fileListEl.appendChild(item);
    });
    var removeBtns = fileListEl.querySelectorAll('.file-item-remove');
    for (var i = 0; i < removeBtns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() { removeFile(parseInt(btn.getAttribute('data-id'))); });
        })(removeBtns[i]);
    }
}

function processFiles(files) {
    for (var i = 0; i < files.length; i++) {
        (function(file) {
            var textExts = ['txt', 'md'];
            var ext = file.name.split('.').pop().toLowerCase();
            if (textExts.indexOf(ext) !== -1) {
                var reader = new FileReader();
                reader.onload = function(ev) { addFile(file.name, ev.target.result); };
                reader.readAsText(file);
            } else {
                fileUpload.innerHTML = '<span class="spinner"></span><div class="upload-text">Uploading ' + file.name + '...</div><div class="upload-status" id="upload-status"></div>';
                var formData = new FormData();
                formData.append('file', file);
                var modelSel = document.getElementById('model-select');
                if (modelSel && modelSel.value) formData.append('model', modelSel.value);
                // SSE via fetch for streaming progress
                fetch(getBackendUrl('upload'), { method: 'POST', body: formData })
                    .then(function(response) {
                        var reader = response.body.getReader();
                        var decoder = new TextDecoder();
                        var buffer = '';
                        function read() {
                            reader.read().then(function(result) {
                                if (result.done) {
                                    fileUpload.innerHTML = UPLOAD_AREA_HTML;
                                    return;
                                }
                                buffer += decoder.decode(result.value, { stream: true });
                                var lines = buffer.split('\n');
                                buffer = lines.pop();
                                for (var li = 0; li < lines.length; li++) {
                                    var line = lines[li].trim();
                                    if (line.indexOf('data: ') === 0) {
                                        try {
                                            var evt = JSON.parse(line.substring(6));
                                            if (evt.progress) {
                                                var statusEl = document.getElementById('upload-status');
                                                if (statusEl) {
                                                    statusEl.innerHTML = '<span class="upload-technique">' + evt.technique + '</span> ' + evt.progress;
                                                }
                                                var uploadText = fileUpload.querySelector('.upload-text');
                                                if (uploadText) uploadText.textContent = 'Processing ' + file.name + '...';
                                            }
                                            if (evt.done) {
                                                fileUpload.innerHTML = UPLOAD_AREA_HTML;
                                                addFile(file.name, evt.text);
                                            }
                                            if (evt.error) {
                                                fileUpload.innerHTML = UPLOAD_AREA_HTML;
                                                alert('Error parsing ' + file.name + ': ' + evt.error);
                                            }
                                        } catch(e) {}
                                    }
                                }
                                read();
                            });
                        }
                        read();
                    })
                    .catch(function() {
                        fileUpload.innerHTML = UPLOAD_AREA_HTML;
                        alert('Upload failed for ' + file.name);
                    });
            }
        })(files[i]);
    }
}

fileUpload.addEventListener('click', function() { fileInput.click(); });
fileUpload.addEventListener('dragover', function(e) { e.preventDefault(); fileUpload.style.borderColor = 'var(--text-secondary)'; });
fileUpload.addEventListener('dragleave', function() { fileUpload.style.borderColor = ''; });
fileUpload.addEventListener('drop', function(e) {
    e.preventDefault();
    fileUpload.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) processFiles(e.target.files);
    fileInput.value = '';
});

// --- Start Over ---
var resetBtn = document.getElementById('btn-reset');
resetBtn.addEventListener('click', function() {
    sessionId = null;
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
    uploadedFiles = [];
    uploadedText = '';
    fileIdCounter = 0;
    renderFileList();
    fileInput.value = '';
    textarea.value = '';
    if (visNodes) visNodes.clear();
    if (visEdges) visEdges.clear();
    ENTITY_COLORS = {};
    colorIndex = 0;
    graphDataStore = null;
    hiddenTypes = {};
    document.getElementById('legend-items').innerHTML = '';
    document.getElementById('entities-table-body').innerHTML = '';
    document.getElementById('relationships-table-body').innerHTML = '';
    document.getElementById('report-content').innerHTML = '<p style="color:var(--text-tertiary);">Report auto-generates when build completes.</p>';
    document.getElementById('btn-report').textContent = 'Generate Report';
    document.getElementById('summary-card').classList.remove('visible');
    document.getElementById('entities-building').classList.remove('visible');
    document.getElementById('report-building').classList.remove('visible');
    document.getElementById('qa-building').classList.remove('visible');
    document.getElementById('chat-messages').innerHTML = '<div class="empty-state" id="chat-empty"><div><p style="font-size:14px;">Ask questions about your data</p></div></div>';
    document.getElementById('suggested-questions').innerHTML = '';
    document.getElementById('suggested-questions').classList.remove('visible');
    document.getElementById('stats-bar').classList.remove('visible');
    document.getElementById('stats-bar').innerHTML = '';
    document.getElementById('schema-display').style.display = 'none';
    document.getElementById('detected-mode').style.display = 'none';
    document.getElementById('graph-toolbar').style.display = 'none';
    document.getElementById('detail-panel').classList.remove('open');
    document.getElementById('graph-search').value = '';
    resetSteps();
    document.getElementById('building-hint').classList.remove('visible');
    buildBtn.disabled = false;
    buildBtn.textContent = 'Build';
    resetBtn.style.display = 'none';
    for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
    for (var j = 0; j < allPanels.length; j++) allPanels[j].classList.remove('active');
    allTabs[0].classList.add('active');
    allPanels[0].classList.add('active');
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

// --- Stats bar ---
function updateStats(graphData) {
    if (!graphData) return;
    var bar = document.getElementById('stats-bar');
    var nodeCount = graphData.nodes.length;
    var edgeCount = graphData.edges.length;
    var types = {};
    graphData.nodes.forEach(function(n) { types[n.type] = true; });
    var typeCount = Object.keys(types).length;
    if (nodeCount > 0) {
        bar.innerHTML = '<b>' + nodeCount + '</b> entities' +
            '<span class="stat-sep">\u00b7</span>' +
            '<b>' + edgeCount + '</b> relationships' +
            '<span class="stat-sep">\u00b7</span>' +
            '<b>' + typeCount + '</b> types';
        bar.classList.add('visible');
    }
}

// --- Summary card ---
function showSummaryCard(text) {
    var card = document.getElementById('summary-card');
    card.textContent = text;
    card.classList.add('visible');
    // Auto-hide after 8 seconds
    setTimeout(function() {
        card.classList.remove('visible');
    }, 8000);
}

// --- Stop build ---
var stopBtn = document.getElementById('btn-stop');
stopBtn.addEventListener('click', function() {
    if (!sessionId) return;
    // Send stop request to backend
    var xhr = new XMLHttpRequest();
    xhr.open('POST', getBackendUrl('stop/' + sessionId));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{}');
    // Immediately stop polling and clean up UI
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
    document.getElementById('building-hint').classList.remove('visible');
    document.getElementById('entities-building').classList.remove('visible');
    document.getElementById('report-building').classList.remove('visible');
    document.getElementById('qa-building').classList.remove('visible');
    buildBtn.disabled = false;
    buildBtn.textContent = 'Build';
    resetBtn.style.display = 'block';
    document.getElementById('progress-container').style.display = 'none';
    // Show toolbar if there are any nodes already
    if (visNodes && visNodes.length > 0) {
        document.getElementById('graph-toolbar').style.display = 'flex';
        if (graphDataStore) {
            updateTables(graphDataStore);
            updateStats(graphDataStore);
            generateSuggestedQuestions(graphDataStore);
        }
    }
});

// --- Build graph ---
var buildBtn = document.getElementById('btn-build');

buildBtn.addEventListener('click', function() {
    var text = currentMode === 'upload' ? uploadedText.trim() : textarea.value.trim();
    if (!text) { alert('Please provide some text first.'); return; }

    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';
    resetSteps();
    document.getElementById('schema-display').style.display = 'none';
    document.getElementById('detected-mode').style.display = 'none';
    document.getElementById('stats-bar').classList.remove('visible');

    document.getElementById('entities-table-body').innerHTML = '';
    document.getElementById('relationships-table-body').innerHTML = '';
    document.getElementById('report-content').innerHTML = '';
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('suggested-questions').innerHTML = '';
    document.getElementById('suggested-questions').classList.remove('visible');

    // Show building indicators on other panels
    document.getElementById('entities-building').classList.add('visible');
    document.getElementById('report-building').classList.add('visible');
    document.getElementById('qa-building').classList.add('visible');

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
                buildBtn.textContent = 'Build';
                resetSteps();
            }
        };
        xhr.onerror = function() {
            alert('Network error');
            buildBtn.disabled = false;
            buildBtn.textContent = 'Build';
            resetSteps();
        };
        xhr.send(JSON.stringify({text: text, model: selectedModel, domain: selectedDomain}));
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

    // --- Node/Edge click handler for detail panel + neighborhood highlight ---
    network.on('click', function(params) {
        var detailPanel = document.getElementById('detail-panel');
        if (params.nodes.length > 0) {
            showNodeDetail(params.nodes[0]);
            highlightNeighborhood(params.nodes[0]);
        } else if (params.edges.length > 0) {
            showEdgeDetail(params.edges[0]);
        } else {
            detailPanel.classList.remove('open');
            resetHighlight();
        }
    });
}

// --- Detail panel ---
function showNodeDetail(nodeId) {
    if (!graphDataStore) return;
    var node = null;
    graphDataStore.nodes.forEach(function(n) { if (n.id === nodeId) node = n; });
    if (!node) return;

    var color = getEntityColor(node.type);
    var html = '<div class="detail-section">' +
        '<div class="detail-section-title">Type</div>' +
        '<span class="detail-badge" style="background:' + color + '">' + node.type + '</span>' +
        '</div>';

    html += '<div class="detail-section">' +
        '<div class="detail-section-title">Description</div>' +
        '<div class="detail-value">' + (node.description || 'No description') + '</div>' +
        '</div>';

    // Find all connections
    var connections = [];
    graphDataStore.edges.forEach(function(e) {
        if (e.from === nodeId) {
            connections.push({dir: 'out', rel: e.relation, target: e.to, desc: e.description});
        }
        if (e.to === nodeId) {
            connections.push({dir: 'in', rel: e.relation, target: e.from, desc: e.description});
        }
    });

    if (connections.length > 0) {
        html += '<div class="detail-section">' +
            '<div class="detail-section-title">Connections (' + connections.length + ')</div>';
        connections.forEach(function(c) {
            var arrow = c.dir === 'out' ? '\u2192' : '\u2190';
            html += '<div class="detail-rel">' +
                '<div class="detail-rel-label">' + arrow + ' ' + c.rel + ' ' + arrow + ' ' + c.target + '</div>' +
                (c.desc ? '<div class="detail-rel-desc">' + c.desc + '</div>' : '') +
                '</div>';
        });
        html += '</div>';
    }

    document.getElementById('detail-title').textContent = node.fullName;
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-panel').classList.add('open');
}

function showEdgeDetail(edgeId) {
    if (!graphDataStore) return;
    var visEdge = visEdges.get(edgeId);
    if (!visEdge) return;

    var edge = null;
    graphDataStore.edges.forEach(function(e) {
        if (e.from === visEdge.from && e.to === visEdge.to) edge = e;
    });
    if (!edge) return;

    var html = '<div class="detail-section">' +
        '<div class="detail-section-title">Source</div>' +
        '<div class="detail-value">' + edge.from + '</div>' +
        '</div>';
    html += '<div class="detail-section">' +
        '<div class="detail-section-title">Relationship</div>' +
        '<div class="detail-value"><b>' + edge.relation + '</b></div>' +
        '</div>';
    html += '<div class="detail-section">' +
        '<div class="detail-section-title">Target</div>' +
        '<div class="detail-value">' + edge.to + '</div>' +
        '</div>';
    html += '<div class="detail-section">' +
        '<div class="detail-section-title">Description</div>' +
        '<div class="detail-value">' + (edge.description || 'No description') + '</div>' +
        '</div>';

    document.getElementById('detail-title').textContent = edge.relation;
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('detail-panel').classList.add('open');
}

document.getElementById('detail-close').addEventListener('click', function() {
    document.getElementById('detail-panel').classList.remove('open');
    resetHighlight();
});

// --- Neighborhood highlight ---
function highlightNeighborhood(nodeId) {
    if (!graphDataStore || !network) return;
    var neighborIds = {};
    neighborIds[nodeId] = true;
    var connectedEdgeIds = {};

    // Find all directly connected nodes
    graphDataStore.edges.forEach(function(e) {
        if (e.from === nodeId) { neighborIds[e.to] = true; }
        if (e.to === nodeId) { neighborIds[e.from] = true; }
    });

    // Get connected edge vis IDs
    try {
        var edgeIds = network.getConnectedEdges(nodeId);
        edgeIds.forEach(function(eid) { connectedEdgeIds[eid] = true; });
    } catch(ex) {}

    // Dim non-neighbor nodes
    var nodeUpdates = [];
    visNodes.forEach(function(n) {
        if (neighborIds[n.id]) {
            var nodeColor = getEntityColor(n._type || 'Unknown');
            nodeUpdates.push({
                id: n.id,
                color: {background: nodeColor, border: nodeColor},
                opacity: 1,
                font: {color: '#1a1a1a'},
                size: n.id === nodeId ? 24 : 18
            });
        } else {
            nodeUpdates.push({
                id: n.id,
                opacity: 0.12,
                font: {color: 'rgba(0,0,0,0.08)'},
                size: 14
            });
        }
    });
    visNodes.update(nodeUpdates);

    // Dim non-connected edges
    var edgeUpdates = [];
    visEdges.forEach(function(e) {
        if (connectedEdgeIds[e.id]) {
            edgeUpdates.push({
                id: e.id,
                color: {color: '#6366f1', opacity: 1},
                width: 2.5,
                font: {color: '#6366f1', size: edgeLabelsVisible ? 10 : 0}
            });
        } else {
            edgeUpdates.push({
                id: e.id,
                color: {color: '#e8e8e5', opacity: 0.15},
                width: 0.5,
                font: {color: 'transparent', size: 0}
            });
        }
    });
    visEdges.update(edgeUpdates);
}

function resetHighlight() {
    if (!graphDataStore || !network) return;
    // Restore all nodes
    var nodeUpdates = [];
    visNodes.forEach(function(n) {
        var nodeColor = getEntityColor(n._type || 'Unknown');
        nodeUpdates.push({
            id: n.id,
            color: {background: nodeColor, border: nodeColor},
            opacity: 1,
            font: {color: '#1a1a1a'},
            size: 16
        });
    });
    visNodes.update(nodeUpdates);

    // Restore all edges
    var edgeUpdates = [];
    visEdges.forEach(function(e) {
        edgeUpdates.push({
            id: e.id,
            color: {color: '#d4d4d4', opacity: 1},
            width: 1.2,
            font: {color: '#999', size: edgeLabelsVisible ? 9 : 0}
        });
    });
    visEdges.update(edgeUpdates);
}

// --- Graph toolbar ---
document.getElementById('btn-zoom-in').addEventListener('click', function() {
    if (network) {
        var scale = network.getScale() * 1.3;
        network.moveTo({scale: scale});
    }
});
document.getElementById('btn-zoom-out').addEventListener('click', function() {
    if (network) {
        var scale = network.getScale() / 1.3;
        network.moveTo({scale: scale});
    }
});
document.getElementById('btn-fit').addEventListener('click', function() {
    if (network) network.fit({animation: true});
});

// Edge label toggle
document.getElementById('btn-edge-labels').addEventListener('click', function() {
    edgeLabelsVisible = !edgeLabelsVisible;
    this.classList.toggle('active', edgeLabelsVisible);
    if (network) {
        network.setOptions({
            edges: { font: { size: edgeLabelsVisible ? 9 : 0 } }
        });
    }
});

// --- Search & Highlight ---
document.getElementById('graph-search').addEventListener('input', function() {
    var query = this.value.trim().toLowerCase();
    if (!visNodes || !graphDataStore) return;

    if (!query) {
        // Restore all nodes
        graphDataStore.nodes.forEach(function(n) {
            var nodeColor = getEntityColor(n.type);
            visNodes.update({
                id: n.id, size: 18, borderWidth: 2,
                color: {
                    background: nodeColor,
                    border: 'rgba(255,255,255,0.8)',
                    highlight: {background: nodeColor, border: '#1a1a1a'},
                    hover: {background: nodeColor, border: '#1a1a1a'}
                },
                font: {color: '#1a1a1a'}
            });
        });
        return;
    }

    var firstMatch = null;
    graphDataStore.nodes.forEach(function(n) {
        var match = n.fullName.toLowerCase().indexOf(query) !== -1 ||
                    n.type.toLowerCase().indexOf(query) !== -1;
        var nodeColor = getEntityColor(n.type);
        if (match) {
            if (!firstMatch) firstMatch = n.id;
            visNodes.update({
                id: n.id, size: 26, borderWidth: 4,
                color: {
                    background: nodeColor,
                    border: '#1a1a1a',
                    highlight: {background: nodeColor, border: '#1a1a1a'},
                    hover: {background: nodeColor, border: '#1a1a1a'}
                },
                font: {color: '#1a1a1a'}
            });
        } else {
            visNodes.update({
                id: n.id, size: 14, borderWidth: 1,
                color: {
                    background: nodeColor + '40',
                    border: 'rgba(200,200,200,0.3)',
                    highlight: {background: nodeColor, border: '#1a1a1a'},
                    hover: {background: nodeColor, border: '#1a1a1a'}
                },
                font: {color: '#ccc'}
            });
        }
    });

    if (firstMatch && network) {
        network.focus(firstMatch, {scale: 1.2, animation: true});
    }
});

// --- Export ---
var exportBtn = document.getElementById('btn-export');
var exportDropdown = document.getElementById('export-dropdown');

exportBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
});

document.addEventListener('click', function() {
    exportDropdown.classList.remove('open');
});

document.querySelectorAll('.export-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
        var format = this.getAttribute('data-format');
        exportDropdown.classList.remove('open');
        if (format === 'png') exportPNG();
        else if (format === 'json') exportJSON();
        else if (format === 'csv') exportCSV();
    });
});

function exportPNG() {
    if (!network) return;
    var canvas = network.canvas.frame.canvas;
    var link = document.createElement('a');
    link.download = 'orion-graph.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function exportJSON() {
    if (!graphDataStore) return;
    var blob = new Blob([JSON.stringify(graphDataStore, null, 2)], {type: 'application/json'});
    var link = document.createElement('a');
    link.download = 'orion-graph.json';
    link.href = URL.createObjectURL(blob);
    link.click();
}

function exportCSV() {
    if (!graphDataStore) return;
    var csv = 'ENTITIES\nName,Type,Description\n';
    graphDataStore.nodes.forEach(function(n) {
        csv += '"' + n.fullName.replace(/"/g, '""') + '","' + n.type + '","' + (n.description || '').replace(/"/g, '""') + '"\n';
    });
    csv += '\nRELATIONSHIPS\nSource,Relation,Target,Description\n';
    graphDataStore.edges.forEach(function(e) {
        csv += '"' + e.from.replace(/"/g, '""') + '","' + e.relation + '","' + e.to.replace(/"/g, '""') + '","' + (e.description || '').replace(/"/g, '""') + '"\n';
    });
    var blob = new Blob([csv], {type: 'text/csv'});
    var link = document.createElement('a');
    link.download = 'orion-graph.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
}

// --- Schema display ---
function showSchema(schema) {
    if (!schema) return;

    // Show mode card — "Detected Mode" for auto, "Chosen Mode" for user-selected
    var modeCard = document.getElementById('detected-mode');
    var isAuto = selectedDomain === 'auto';
    var domainKey = isAuto ? schema.domain : selectedDomain;
    if (domainKey) {
        var domainName = domainKey;
        // Look up friendly name from the dropdown
        for (var i = 0; i < domainSelect.options.length; i++) {
            if (domainSelect.options[i].value === domainKey) {
                domainName = domainSelect.options[i].textContent;
                break;
            }
        }
        // Capitalize if it's a raw key
        if (domainName === domainKey) {
            domainName = domainKey.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        }
        var modeLabel = isAuto ? 'Detected Mode' : 'Chosen Mode';
        var modeIcon = isAuto ? '&#x2728;' : '&#x2705;';
        modeCard.innerHTML = '<div class="detected-mode-icon">' + modeIcon + '</div>' +
            '<div class="detected-mode-text">' +
            '<div class="detected-mode-label">' + modeLabel + '</div>' +
            '<div class="detected-mode-name">' + domainName + '</div>' +
            '</div>';
        modeCard.style.display = 'flex';
    } else {
        modeCard.style.display = 'none';
    }

    // Show schema card
    var el = document.getElementById('schema-display');
    var html = '<b>Detected Schema</b>';

    if (schema.description) {
        html += '<div style="margin-top:6px;color:var(--text-secondary);font-size:11px;">' + schema.description + '</div>';
    }

    if (schema.entity_types && schema.entity_types.length > 0) {
        html += '<div class="schema-types">';
        schema.entity_types.forEach(function(t) {
            var color = getEntityColor(t);
            html += '<span class="schema-type-badge" style="background:' + color + '">' + t + '</span>';
        });
        html += '</div>';
    }

    if (schema.attribute_fields && schema.attribute_fields.length > 0) {
        html += '<div class="schema-attrs"><span style="color:var(--text-tertiary);">Attributes (in descriptions):</span> ' + schema.attribute_fields.join(', ') + '</div>';
    }

    if (schema.relationship_types && schema.relationship_types.length > 0) {
        html += '<div class="schema-rels">' + schema.relationship_types.join(' \u00b7 ') + '</div>';
    }

    el.innerHTML = html;
    el.style.display = 'block';
}

// --- Polling ---
var schemaShown = false;

function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    schemaShown = false;
    pollingTimer = setInterval(function() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', getBackendUrl('status/' + sessionId));
        xhr.onload = function() {
            if (xhr.status !== 200) return;
            var data = JSON.parse(xhr.responseText);

            var hint = document.getElementById('building-hint');
            var hintText = document.getElementById('hint-text');

            if (data.status === 'analyzing') {
                hintText.textContent = 'Analyzing data schema...';
                setProgress(5);
                setStep('step-schema', 'active');
            } else if (data.status === 'building') {
                var pct = Math.round((data.current_chunk / data.total_chunks) * 100);
                hintText.textContent = 'Extracting entities... ' + data.current_chunk + '/' + data.total_chunks;
                setProgress(10 + pct * 0.7);
                // Update entities panel building indicator with live count
                var eb = document.getElementById('entities-building');
                if (eb.classList.contains('visible') && data.graph_data) {
                    eb.querySelector('span').textContent = 'Extracting entities (' + data.graph_data.nodes.length + ' found so far, chunk ' + data.current_chunk + '/' + data.total_chunks + ')...';
                }
                setStep('step-schema', 'done');
                setStep('step-extract', 'active');
                // Show schema once when transitioning to building
                if (!schemaShown && data.schema) {
                    showSchema(data.schema);
                    schemaShown = true;
                }
            } else if (data.status === 'deduplicating') {
                hintText.textContent = 'Resolving duplicate entities...';
                setProgress(85);
                setStep('step-schema', 'done');
                setStep('step-extract', 'done');
                setStep('step-dedup', 'active');
            } else if (data.status === 'reporting') {
                hintText.textContent = 'Generating report...';
                setProgress(93);
                setStep('step-schema', 'done');
                setStep('step-extract', 'done');
                setStep('step-dedup', 'done');
                setStep('step-report', 'active');
            }

            updateGraph(data.graph_data);
            updateStats(data.graph_data);

            if (data.status === 'stopped') {
                clearInterval(pollingTimer);
                pollingTimer = null;
                hint.classList.remove('visible');
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build';
                resetBtn.style.display = 'block';
                document.getElementById('entities-building').classList.remove('visible');
                document.getElementById('report-building').classList.remove('visible');
                document.getElementById('qa-building').classList.remove('visible');
                document.getElementById('progress-container').style.display = 'none';
                if (visNodes && visNodes.length > 0) {
                    document.getElementById('graph-toolbar').style.display = 'flex';
                    updateTables(data.graph_data);
                    generateSuggestedQuestions(data.graph_data);
                }
                return;
            }

            if (data.status === 'done') {
                clearInterval(pollingTimer);
                pollingTimer = null;
                hint.classList.remove('visible');
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build';
                resetBtn.style.display = 'block';
                setProgress(100);
                setStep('step-schema', 'done');
                setStep('step-extract', 'done');
                setStep('step-dedup', 'done');
                setStep('step-report', 'done');
                setStep('step-done', 'done');
                // Full refresh after dedup
                visNodes.clear();
                visEdges.clear();
                updateGraph(data.graph_data);
                updateStats(data.graph_data);
                updateTables(data.graph_data);
                generateSuggestedQuestions(data.graph_data);
                // Show toolbar
                document.getElementById('graph-toolbar').style.display = 'flex';

                // Hide building indicators
                document.getElementById('entities-building').classList.remove('visible');
                document.getElementById('report-building').classList.remove('visible');
                document.getElementById('qa-building').classList.remove('visible');

                // Show summary card
                if (data.summary) {
                    showSummaryCard(data.summary);
                }

                // Auto-populate report
                if (data.report) {
                    document.getElementById('report-content').innerHTML = formatMarkdown(data.report);
                    document.getElementById('btn-report').textContent = 'Regenerate Report';
                }

                // Hide schema after a delay
                setTimeout(function() {
                    document.getElementById('progress-container').style.display = 'none';
                    document.getElementById('schema-display').style.display = 'none';
                    document.getElementById('detected-mode').style.display = 'none';
                }, 3000);
            }
        };
        xhr.send();
    }, 1500);
}

// --- Update graph incrementally ---
function updateGraph(graphData) {
    if (!graphData || !visNodes || !visEdges) return;
    graphDataStore = graphData;

    var existingNodeIds = {};
    visNodes.getIds().forEach(function(id) { existingNodeIds[id] = true; });

    var existingEdgeKeys = {};
    visEdges.get().forEach(function(e) { existingEdgeKeys[e.from + '>>>' + e.to] = true; });

    graphData.nodes.forEach(function(n) {
        if (!existingNodeIds[n.id]) {
            var nodeColor = getEntityColor(n.type);
            visNodes.add({
                id: n.id, label: n.label,
                title: '<b>' + n.fullName + '</b><br>Type: ' + n.type + '<br>' + n.description,
                color: {
                    background: nodeColor,
                    border: 'rgba(255,255,255,0.8)',
                    highlight: {background: nodeColor, border: '#1a1a1a'},
                    hover: {background: nodeColor, border: '#1a1a1a'}
                },
                _type: n.type,
                hidden: !!hiddenTypes[n.type]
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
        var color = getEntityColor(type);
        var item = document.createElement('div');
        item.className = 'legend-item' + (hiddenTypes[type] ? ' hidden' : '');
        item.setAttribute('data-type', type);
        item.innerHTML = '<span class="legend-dot" style="background:' + color + '"></span>' + type;
        // Click to toggle type visibility
        (function(t) {
            item.addEventListener('click', function() {
                hiddenTypes[t] = !hiddenTypes[t];
                this.classList.toggle('hidden', hiddenTypes[t]);
                // Update node visibility
                visNodes.get().forEach(function(n) {
                    if (n._type === t) {
                        visNodes.update({id: n.id, hidden: hiddenTypes[t]});
                    }
                });
            });
        })(type);
        container.appendChild(item);
    }
}

function updateTables(graphData) {
    var tbody1 = document.getElementById('entities-table-body');
    tbody1.innerHTML = '';
    graphData.nodes.forEach(function(n) {
        var color = getEntityColor(n.type);
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

// --- Suggested questions ---
function generateSuggestedQuestions(graphData) {
    if (!graphData || graphData.nodes.length === 0) return;

    var questions = [];
    var typeCounts = {};
    graphData.nodes.forEach(function(n) {
        typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    // Most common type
    var topType = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; })[0];
    if (topType) {
        questions.push('What are the key ' + topType.toLowerCase() + 's in this data?');
    }

    // Most connected node
    var connCount = {};
    graphData.edges.forEach(function(e) {
        connCount[e.from] = (connCount[e.from] || 0) + 1;
        connCount[e.to] = (connCount[e.to] || 0) + 1;
    });
    var topEntity = Object.keys(connCount).sort(function(a, b) { return connCount[b] - connCount[a]; })[0];
    if (topEntity) {
        questions.push('Tell me about ' + topEntity);
    }

    // Relationship question
    if (graphData.edges.length > 0) {
        questions.push('What are the main relationships in this data?');
    }

    // Summary
    questions.push('Summarize the key findings');

    var container = document.getElementById('suggested-questions');
    container.innerHTML = '';
    questions.forEach(function(q) {
        var btn = document.createElement('div');
        btn.className = 'suggested-q';
        btn.textContent = q;
        btn.addEventListener('click', function() {
            document.getElementById('chat-input').value = q;
            sendMessage();
            container.classList.remove('visible');
        });
        container.appendChild(btn);
    });
    container.classList.add('visible');
}

// --- Report ---
document.getElementById('btn-report').addEventListener('click', function() {
    if (!sessionId) { alert('Build first.'); return; }

    var btn = document.getElementById('btn-report');
    var content = document.getElementById('report-content');
    btn.disabled = true;
    btn.textContent = 'Regenerating...';
    content.innerHTML = '<span class="spinner"></span> Generating report...';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', getBackendUrl('report/' + sessionId));
    xhr.onload = function() {
        var data = JSON.parse(xhr.responseText);
        content.innerHTML = formatMarkdown(data.report);
        btn.disabled = false;
        btn.textContent = 'Regenerate Report';
    };
    xhr.onerror = function() {
        content.innerHTML = 'Error generating report.';
        btn.disabled = false;
        btn.textContent = 'Generate Report';
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
    if (!sessionId) { alert('Build first.'); return; }
    var question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = '';
    chatSendBtn.disabled = true;

    addChatMessage('user', question);
    var loadingEl = addChatMessage('assistant', '<span class="streaming-cursor"></span>');
    var bubble = loadingEl.querySelector('.chat-bubble');
    var fullText = '';

    fetch(getBackendUrl('ask_stream/' + sessionId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question: question})
    }).then(function(response) {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function read() {
            reader.read().then(function(result) {
                if (result.done) {
                    bubble.innerHTML = formatMarkdown(fullText);
                    chatSendBtn.disabled = false;
                    chatInput.focus();
                    return;
                }
                buffer += decoder.decode(result.value, {stream: true});
                var lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line
                lines.forEach(function(line) {
                    if (line.startsWith('data: ')) {
                        try {
                            var evt = JSON.parse(line.substring(6));
                            if (evt.chunk) {
                                fullText += evt.chunk;
                                // Show raw text while streaming, format at end
                                bubble.textContent = fullText;
                                bubble.scrollIntoView({block: 'end'});
                            }
                            if (evt.done) {
                                bubble.innerHTML = formatMarkdown(fullText);
                                chatSendBtn.disabled = false;
                                chatInput.focus();
                                return;
                            }
                        } catch(e) {}
                    }
                });
                read();
            });
        }
        read();
    }).catch(function() {
        bubble.innerHTML = 'Error getting answer.';
        chatSendBtn.disabled = false;
    });
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
