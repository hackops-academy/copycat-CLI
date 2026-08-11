'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const workspace = require('./workspace');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'copycat-gui/3.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`Request to ${url} failed: HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Could not parse response from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// Passive subdomain enumeration via crt.sh certificate transparency logs
// (same source as the original bash `full_recon`).
async function enumSubdomains(domain, log) {
  log(`[*] Querying crt.sh for ${domain}...`);
  const data = await fetchJson(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`);
  const set = new Set();
  for (const row of data) {
    if (!row.name_value) continue;
    row.name_value.split('\n').forEach((n) => {
      const clean = n.trim().replace(/^\*\./, '').toLowerCase();
      if (clean) set.add(clean);
    });
  }
  set.add(domain.toLowerCase());
  return [...set].sort();
}

function which(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) for (const ext of exts) {
    const p = path.join(d, bin + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runNmapFast(domain, outFile, log) {
  return new Promise((resolve) => {
    if (!which('nmap')) {
      log('[!] nmap not found on PATH — skipping port scan.');
      return resolve(false);
    }
    log(`[*] Running Nmap Fast Scan on ${domain}...`);
    const child = spawn('nmap', ['-F', domain, '-oN', outFile]);
    child.stdout.on('data', (d) => log(d.toString().trimEnd()));
    child.stderr.on('data', (d) => log(d.toString().trimEnd()));
    child.on('close', () => resolve(true));
    child.on('error', (e) => { log(`[!] nmap error: ${e.message}`); resolve(false); });
  });
}

async function runFullRecon(domain, root, portScan, log) {
  if (!domain) throw new Error('No target domain provided.');
  workspace.setRoot(root);
  const { dir } = workspace.createRunDir(domain);
  log(`[*] Starting Passive Recon on ${domain}...`);

  const subdomains = await enumSubdomains(domain, log);
  const subFile = path.join(dir, 'scans', 'subdomains.txt');
  fs.writeFileSync(subFile, subdomains.join('\n') + '\n');
  log(`[+] Subdomains found: ${subdomains.length}`);

  let nmapFile = null;
  if (portScan) {
    nmapFile = path.join(dir, 'scans', 'nmap.txt');
    await runNmapFast(domain, nmapFile, log);
  }

  log(`[\u2714] Recon complete: ${dir}`);
  return { runDir: dir, subdomainsFile: subFile, subdomains, nmapFile };
}

module.exports = { runFullRecon, enumSubdomains };
