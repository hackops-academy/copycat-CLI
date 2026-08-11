'use strict';
const fs = require('fs');
const path = require('path');

const MAX_NODES = 400; // keep the render legible on large mirrors/subdomain lists
const MAX_STRUCTURE_DEPTH = 4;

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

// group values drive color/shape in the renderer (see src/renderer.js GROUP_STYLE)
function node(id, label, group, extra) {
  return { id, label, group, ...extra };
}

function edge(from, to) {
  return { from, to };
}

function addSubdomainBranch(nodes, edges, rootId, subdomainsFile, domain, log) {
  if (!subdomainsFile || !fs.existsSync(subdomainsFile)) return;
  const lines = fs.readFileSync(subdomainsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const subsId = nextId('branch');
  nodes.push(node(subsId, `Subdomains (${lines.length})`, 'branch'));
  edges.push(edge(rootId, subsId));

  let count = 0;
  for (const host of lines) {
    if (host === domain) continue; // apex already represented by root node
    if (nodes.length >= MAX_NODES) { log('[!] Node cap reached — truncating subdomain branch.'); break; }
    const id = nextId('sub');
    nodes.push(node(id, host, 'subdomain'));
    edges.push(edge(subsId, id));
    count += 1;
  }
  log(`[+] Mindmap: added ${count} subdomain nodes.`);
}

function addStructureBranch(nodes, edges, rootId, mirrorDir, log) {
  if (!mirrorDir || !fs.existsSync(mirrorDir)) return;
  const structId = nextId('branch');
  nodes.push(node(structId, 'Site Structure', 'branch'));
  edges.push(edge(rootId, structId));

  let count = 0;
  function walk(dir, parentId, depth) {
    if (depth > MAX_STRUCTURE_DEPTH || nodes.length >= MAX_NODES) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }

    // Skip the flattened asset buckets (assets/css, assets/js, ...) as individual nodes —
    // summarize them as one node each so the graph stays readable.
    const assetBuckets = new Set(['css', 'js', 'images', 'fonts']);
    if (path.basename(dir) === 'assets') {
      for (const e of entries) {
        if (!e.isDirectory() || !assetBuckets.has(e.name)) continue;
        const bucketDir = path.join(dir, e.name);
        let fileCount = 0;
        try { fileCount = fs.readdirSync(bucketDir).length; } catch (_) {}
        const id = nextId('asset');
        nodes.push(node(id, `${e.name}/ (${fileCount})`, 'asset'));
        edges.push(edge(parentId, id));
        count += 1;
      }
      return;
    }

    for (const e of entries) {
      if (nodes.length >= MAX_NODES) { log('[!] Node cap reached — truncating site structure branch.'); return; }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const id = nextId('dir');
        nodes.push(node(id, `${e.name}/`, 'folder'));
        edges.push(edge(parentId, id));
        count += 1;
        walk(full, id, depth + 1);
      } else if (/\.html?$/i.test(e.name)) {
        const id = nextId('page');
        nodes.push(node(id, e.name, 'page'));
        edges.push(edge(parentId, id));
        count += 1;
      }
      // other loose files at this depth are skipped — they live under assets/ post-organize
    }
  }

  walk(mirrorDir, structId, 0);
  log(`[+] Mindmap: added ${count} site-structure nodes.`);
}

async function buildGraph({ domain, subdomainsFile, mirrorDir }, log) {
  if (!domain) throw new Error('No domain provided for mindmap.');
  idCounter = 0;
  const nodes = [];
  const edges = [];

  const rootId = nextId('root');
  nodes.push(node(rootId, domain, 'root'));

  addSubdomainBranch(nodes, edges, rootId, subdomainsFile, domain, log);
  addStructureBranch(nodes, edges, rootId, mirrorDir, log);

  log(`[\u2714] Mindmap graph built: ${nodes.length} nodes, ${edges.length} edges.`);
  return { nodes, edges };
}

module.exports = { buildGraph };
