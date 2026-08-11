'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const workspace = require('./workspace');

const WGET_USERAGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function which(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, bin + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function runWget(url, outDir, log) {
  return new Promise((resolve, reject) => {
    if (!which('wget')) {
      return reject(new Error('wget not found on PATH. Install wget and retry.'));
    }
    const args = [
      '--mirror',
      '--convert-links',
      '--adjust-extension',
      '--page-requisites',
      '--no-parent',
      `--user-agent=${WGET_USERAGENT}`,
      '-P', outDir,
      url
    ];
    log(`[*] wget ${args.join(' ')}`);
    const child = spawn('wget', args);
    child.stdout.on('data', (d) => log(d.toString().trimEnd()));
    child.stderr.on('data', (d) => log(d.toString().trimEnd()));
    // wget exits non-zero on partial mirrors fairly often (robots.txt skips etc.) — mirror the
    // original script's `|| true` tolerance instead of failing the whole run.
    child.on('close', () => resolve());
    child.on('error', reject);
  });
}

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

// Node port of make_human_readable(): strip query-string suffixes, sort assets into
// assets/{css,js,images,fonts}, and give extension-less files (index pages) an .html suffix.
function organizeMirror(dir, log) {
  log('[+] Organizing mirror into human-readable format...');
  const assetDirs = {
    css: path.join(dir, 'assets', 'css'),
    js: path.join(dir, 'assets', 'js'),
    images: path.join(dir, 'assets', 'images'),
    fonts: path.join(dir, 'assets', 'fonts')
  };
  Object.values(assetDirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico']);
  const fontExts = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);

  // Pass 1: strip "?query=strings" from filenames on disk.
  walk(dir, (file) => {
    if (file.includes('?')) {
      const clean = file.split('?')[0];
      try {
        if (!fs.existsSync(clean)) fs.renameSync(file, clean);
      } catch (_) { /* ignore collisions */ }
    }
  });

  // Pass 2: sort by extension into assets/, and extension-less files become .html
  walk(dir, (file) => {
    if (file.startsWith(path.join(dir, 'assets'))) return;
    const ext = path.extname(file).toLowerCase();
    let dest = null;
    if (ext === '.css') dest = assetDirs.css;
    else if (ext === '.js') dest = assetDirs.js;
    else if (imageExts.has(ext)) dest = assetDirs.images;
    else if (fontExts.has(ext)) dest = assetDirs.fonts;
    else if (ext === '') {
      const htmlPath = file + '.html';
      try { if (!fs.existsSync(htmlPath)) fs.renameSync(file, htmlPath); } catch (_) {}
      return;
    }
    if (dest) {
      const target = path.join(dest, path.basename(file));
      try { if (!fs.existsSync(target)) fs.renameSync(file, target); } catch (_) {}
    }
  });

  log(`[+] Mirror organized. Clean structure at: ${path.join(dir, 'assets')}`);
}

async function runMirror(url, root, log) {
  if (!url) throw new Error('No target URL provided.');
  workspace.setRoot(root);
  const { dir } = workspace.createRunDir(url);
  const mirrorDir = path.join(dir, 'mirror');

  log(`[*] Starting Mirror for ${url}...`);
  await runWget(url, mirrorDir, log);
  organizeMirror(mirrorDir, log);

  // Endpoint grep, same regex intent as the bash version.
  const endpointsFile = path.join(dir, 'metadata', 'endpoints.txt');
  const urlRe = /https?:\/\/[a-zA-Z0-9./?=_-]+/g;
  const found = new Set();
  if (fs.existsSync(mirrorDir)) {
    walk(mirrorDir, (file) => {
      try {
        const text = fs.readFileSync(file, 'utf8');
        const matches = text.match(urlRe);
        if (matches) matches.forEach((m) => found.add(m));
      } catch (_) { /* binary or unreadable file, skip */ }
    });
  }
  fs.writeFileSync(endpointsFile, [...found].sort().join('\n') + '\n');
  log(`[+] Extracted ${found.size} candidate endpoints -> ${endpointsFile}`);
  log(`[\u2714] Mirror complete: ${dir}`);

  return { runDir: dir, mirrorDir, endpointsFile };
}

module.exports = { runMirror, organizeMirror };
