'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

let rootDir = path.join(os.homedir(), 'CopyCat-Workspace');
if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });

function setRoot(dir) {
  if (dir && fs.existsSync(dir)) rootDir = dir;
}

function getRoot() {
  return rootDir;
}

function slugDomain(target) {
  return target.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].replace(/[^a-zA-Z0-9.-]/g, '_');
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Mirrors the original bash create_workspace(): copycat_<timestamp>_<domain>/{mirror,scans,metadata}
function createRunDir(target) {
  const domain = slugDomain(target);
  const name = `copycat_${timestamp()}_${domain}`;
  const dir = path.join(rootDir, name);
  for (const sub of ['mirror', 'scans', 'metadata']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return { dir, domain };
}

function listRuns() {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('copycat_'))
    .map((d) => path.join(rootDir, d.name))
    .sort()
    .reverse();
}

module.exports = { setRoot, getRoot, createRunDir, listRuns, slugDomain };
