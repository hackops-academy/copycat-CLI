'use strict';
const fs = require('fs');
const path = require('path');

const URL_RE = /https?:\/\/[a-zA-Z0-9./?=_-]+/g;

// Generic, low-false-negative shape patterns for common secret formats. These flag
// *candidates* for manual review — this tool does not validate or use any of them.
const SECRET_PATTERNS = [
  { name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Generic API Key', re: /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,45}["']/gi },
  { name: 'Bearer Token', re: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g },
  { name: 'JWT-like Token', re: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { name: 'Private Key Header', re: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP)? ?PRIVATE KEY-----/g },
  { name: 'Slack Token', re: /xox[baprs]-[0-9a-zA-Z-]{10,48}/g }
];

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

async function runExtractor(mirrorDir, log) {
  if (!mirrorDir || !fs.existsSync(mirrorDir)) {
    throw new Error('Mirror directory not found. Run a mirror first.');
  }
  log(`[*] Scanning ${mirrorDir} for endpoints and secret-shaped strings...`);

  const endpoints = new Set();
  const findings = []; // { file, name, match }

  walk(mirrorDir, (file) => {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return; }

    const urls = text.match(URL_RE);
    if (urls) urls.forEach((u) => endpoints.add(u));

    for (const { name, re } of SECRET_PATTERNS) {
      const matches = text.match(re);
      if (matches) {
        matches.forEach((m) => findings.push({ file: path.relative(mirrorDir, file), name, match: redact(m) }));
      }
    }
  });

  const outDir = path.join(path.dirname(mirrorDir), 'metadata');
  fs.mkdirSync(outDir, { recursive: true });
  const endpointsFile = path.join(outDir, 'endpoints.txt');
  const findingsFile = path.join(outDir, 'secret_candidates.txt');

  fs.writeFileSync(endpointsFile, [...endpoints].sort().join('\n') + '\n');
  fs.writeFileSync(
    findingsFile,
    findings.map((f) => `[${f.name}] ${f.file} :: ${f.match}`).join('\n') + (findings.length ? '\n' : '')
  );

  log(`[+] Endpoints found: ${endpoints.size} -> ${endpointsFile}`);
  log(`[+] Secret-shaped candidates: ${findings.length} -> ${findingsFile}`);
  log('[!] Review candidates manually — this only flags shape matches, not validity.');

  return { endpointsFile, findingsFile, endpointCount: endpoints.size, findingCount: findings.length, findings: findings.slice(0, 200) };
}

// Keep the raw secret out of logs/UI by default — show a truncated preview only.
function redact(match) {
  if (match.length <= 12) return match;
  return `${match.slice(0, 6)}\u2026${match.slice(-4)}`;
}

module.exports = { runExtractor };
