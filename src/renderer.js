'use strict';

// ============== TITLE BAR ==============
document.getElementById('tb-min').addEventListener('click', () => window.cc.winMinimize());
document.getElementById('tb-max').addEventListener('click', () => window.cc.winMaximize());
document.getElementById('tb-close').addEventListener('click', () => window.cc.winClose());

// ============== TAB NAV ==============
const tabs = document.querySelectorAll('.rail-tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'mindmap' && network) setTimeout(() => network.redraw(), 50);
  });
});

// ============== CONSOLE LOG STREAM ==============
const consoleBody = document.getElementById('console-body');
function logLine(channel, text) {
  const div = document.createElement('div');
  div.className = `line ${channel}`;
  div.textContent = text;
  consoleBody.appendChild(div);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}
window.cc.onLog(({ channel, line }) => logLine(channel, line));
document.getElementById('console-clear').addEventListener('click', () => { consoleBody.innerHTML = ''; });
logLine('system', '[*] CopyCat GUI ready. Use only on targets you are authorized to test.');

// ---- console collapse / expand ----
const consoleEl = document.getElementById('console');
const consoleToggle = document.getElementById('console-toggle');
const CONSOLE_HEIGHT_KEY = 'cc.consoleHeight';
const CONSOLE_COLLAPSED_KEY = 'cc.consoleCollapsed';

function setConsoleCollapsed(collapsed) {
  consoleEl.classList.toggle('collapsed', collapsed);
  consoleToggle.title = collapsed ? 'Expand log' : 'Collapse log';
  localStorage.setItem(CONSOLE_COLLAPSED_KEY, collapsed ? '1' : '0');
}
consoleToggle.addEventListener('click', () => setConsoleCollapsed(!consoleEl.classList.contains('collapsed')));
// clicking the header bar itself also expands a collapsed console
document.querySelector('.console-head').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (consoleEl.classList.contains('collapsed')) setConsoleCollapsed(false);
});

const savedHeight = localStorage.getItem(CONSOLE_HEIGHT_KEY);
if (savedHeight) consoleEl.style.height = `${savedHeight}px`;
setConsoleCollapsed(localStorage.getItem(CONSOLE_COLLAPSED_KEY) === '1');

// ---- console drag-to-resize ----
const consoleDrag = document.getElementById('console-drag');
let dragging = false;
consoleDrag.addEventListener('mousedown', (e) => {
  if (consoleEl.classList.contains('collapsed')) return;
  dragging = true;
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const h = Math.min(Math.max(window.innerHeight - e.clientY, 100), Math.floor(window.innerHeight * 0.75));
  consoleEl.style.height = `${h}px`;
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  localStorage.setItem(CONSOLE_HEIGHT_KEY, parseInt(consoleEl.style.height, 10));
});

// ============== WORKSPACE ==============
async function refreshWorkspace() {
  const root = await window.cc.getRoot();
  document.getElementById('workspace-root').value = root;
  const runs = await window.cc.listRuns();
  const list = document.getElementById('workspace-runs');
  list.innerHTML = '';
  runs.forEach((dir) => {
    const li = document.createElement('li');
    const name = dir.split(/[\\/]/).pop();
    li.innerHTML = `<span>${name}</span><span class="open-hint">open &rarr;</span>`;
    li.addEventListener('click', () => window.cc.openPath(dir));
    list.appendChild(li);
  });
}
document.getElementById('workspace-pick').addEventListener('click', async () => {
  const dir = await window.cc.pickRoot();
  if (dir) refreshWorkspace();
});
refreshWorkspace();

// ============== helpers ==============
function setBusy(btn, busy, idleLabel) {
  btn.disabled = busy;
  btn.textContent = busy ? 'Running\u2026' : idleLabel;
}
function renderResult(el, html) { el.innerHTML = html; }

// ============== MIRROR ==============
const mirrorBtn = document.getElementById('mirror-run');
mirrorBtn.addEventListener('click', async () => {
  const url = document.getElementById('mirror-url').value.trim();
  const resultEl = document.getElementById('mirror-result');
  if (!url) { renderResult(resultEl, '<span class="err">Enter a target URL first.</span>'); return; }
  setBusy(mirrorBtn, true, 'Run Mirror');
  renderResult(resultEl, '');
  const res = await window.cc.runMirror(url);
  setBusy(mirrorBtn, false, 'Run Mirror');
  if (res.ok) {
    document.getElementById('mindmap-mirror').value = res.mirrorDir;
    document.getElementById('extract-dir').value = res.mirrorDir;
    renderResult(resultEl,
      `<span class="ok">Done.</span> Mirror: <span class="link" data-open="${res.mirrorDir}">${res.mirrorDir}</span> &middot; ` +
      `Endpoints: <span class="link" data-open="${res.endpointsFile}">${res.endpointsFile}</span>`);
    wireOpenLinks(resultEl);
    refreshWorkspace();
  } else {
    renderResult(resultEl, `<span class="err">Failed: ${res.error}</span>`);
  }
});

// ============== RECON ==============
const reconBtn = document.getElementById('recon-run');
reconBtn.addEventListener('click', async () => {
  const domain = document.getElementById('recon-domain').value.trim();
  const portScan = document.getElementById('recon-portscan').checked;
  const resultEl = document.getElementById('recon-result');
  if (!domain) { renderResult(resultEl, '<span class="err">Enter a target domain first.</span>'); return; }
  setBusy(reconBtn, true, 'Run Recon');
  renderResult(resultEl, '');
  const res = await window.cc.runRecon(domain, portScan);
  setBusy(reconBtn, false, 'Run Recon');
  if (res.ok) {
    document.getElementById('mindmap-subs').value = res.subdomainsFile;
    document.getElementById('mindmap-domain').value = domain;
    renderResult(resultEl,
      `<span class="ok">Done.</span> ${res.subdomains.length} subdomains &middot; ` +
      `<span class="link" data-open="${res.subdomainsFile}">${res.subdomainsFile}</span>`);
    wireOpenLinks(resultEl);
    refreshWorkspace();
  } else {
    renderResult(resultEl, `<span class="err">Failed: ${res.error}</span>`);
  }
});

// ============== EXTRACTOR ==============
const extractBtn = document.getElementById('extract-run');
extractBtn.addEventListener('click', async () => {
  const dir = document.getElementById('extract-dir').value.trim();
  const resultEl = document.getElementById('extract-result');
  const tableWrap = document.getElementById('findings-table-wrap');
  tableWrap.innerHTML = '';
  if (!dir) { renderResult(resultEl, '<span class="err">Provide a mirror directory (run Mirror first).</span>'); return; }
  setBusy(extractBtn, true, 'Run Extractor');
  renderResult(resultEl, '');
  const res = await window.cc.runExtractor(dir);
  setBusy(extractBtn, false, 'Run Extractor');
  if (res.ok) {
    renderResult(resultEl,
      `<span class="ok">Done.</span> ${res.endpointCount} endpoints, ${res.findingCount} secret-shaped candidates ` +
      `&middot; <span class="link" data-open="${res.findingsFile}">${res.findingsFile}</span>`);
    wireOpenLinks(resultEl);
    if (res.findings && res.findings.length) {
      const rows = res.findings.map((f) => `<tr><td>${f.name}</td><td>${f.file}</td><td>${f.match}</td></tr>`).join('');
      tableWrap.innerHTML = `<table><thead><tr><th>Type</th><th>File</th><th>Preview</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
  } else {
    renderResult(resultEl, `<span class="err">Failed: ${res.error}</span>`);
  }
});

function wireOpenLinks(container) {
  container.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => window.cc.openPath(el.dataset.open));
  });
}

// ============== MINDMAP ==============
// NOTE: vis-network only draws a label *inside* the node for box/ellipse/circle shapes.
// Every group here except 'branch' uses shape: 'dot', whose label is drawn on the dark
// canvas background below the node — so font colors must be legible against that dark
// canvas, not against the node's own fill. (This is what made the domain/site URL text
// unreadable before: it was dark-on-dark.) A dark stroke outline is added on top so
// labels stay readable even where the radar-sweep animation crosses them.
const LABEL_STROKE = { strokeWidth: 3, strokeColor: '#05080a' };
const GROUP_STYLE = {
  root:      { color: { background: '#00fff2', border: '#00fff2' }, font: { color: '#eafffb', size: 16, bold: true, ...LABEL_STROKE }, shape: 'dot', size: 22 },
  branch:    { color: { background: '#0a1014', border: '#0aa8a0' }, font: { color: '#c9f5f0', size: 12 }, shape: 'box' },
  subdomain: { color: { background: '#0a1014', border: '#39ff88' }, font: { color: '#39ff88', size: 12, ...LABEL_STROKE }, shape: 'dot', size: 10 },
  folder:    { color: { background: '#0a1014', border: '#ffb020' }, font: { color: '#ffb020', size: 11, ...LABEL_STROKE }, shape: 'dot', size: 9 },
  page:      { color: { background: '#0a1014', border: '#7fb0ff' }, font: { color: '#7fb0ff', size: 11, ...LABEL_STROKE }, shape: 'dot', size: 7 },
  asset:     { color: { background: '#0a1014', border: '#9fd4d0' }, font: { color: '#9fd4d0', size: 10, ...LABEL_STROKE }, shape: 'dot', size: 7 }
};

let network = null;
const mindmapBtn = document.getElementById('mindmap-run');
mindmapBtn.addEventListener('click', async () => {
  const domain = document.getElementById('mindmap-domain').value.trim();
  const subs = document.getElementById('mindmap-subs').value.trim();
  const mirrorDir = document.getElementById('mindmap-mirror').value.trim();
  if (!domain) { logLine('mindmap', '[X] Enter a domain first.'); return; }
  setBusy(mindmapBtn, true, 'Build Mindmap');
  const res = await window.cc.buildMindmap(domain, subs, mirrorDir);
  setBusy(mindmapBtn, false, 'Build Mindmap');
  if (!res.ok) { logLine('mindmap', `[X] ${res.error}`); return; }
  renderGraph(res.graph);
});

function renderGraph(graph) {
  const container = document.getElementById('mindmap-canvas');
  const nodes = new vis.DataSet(graph.nodes.map((n) => ({
    id: n.id, label: n.label, ...(GROUP_STYLE[n.group] || {})
  })));
  const edges = new vis.DataSet(graph.edges.map((e) => ({
    from: e.from, to: e.to, color: { color: 'rgba(0,255,242,0.25)', highlight: '#00fff2' }, width: 1
  })));

  const options = {
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -60, springLength: 90, springConstant: 0.06 },
      stabilization: { iterations: 150 }
    },
    interaction: { hover: true, tooltipDelay: 100 },
    nodes: { borderWidth: 2, font: { face: 'JetBrains Mono', size: 11 } },
    edges: { smooth: { type: 'continuous' } }
  };

  if (network) network.destroy();
  network = new vis.Network(container, { nodes, edges }, options);
}
