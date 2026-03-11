#!/usr/bin/env node
// ============================================================
// IRON DOMINION - Asset Downloader
// Downloads free CC0 isometric sprite packs from Kenney.nl
// Run: node download-assets.js
// ============================================================

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, 'assets', 'sprites');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Kenney asset pack direct download URLs (CC0 Public Domain)
const PACKS = [
  {
    name: 'isometric-landscape',
    url:  'https://kenney.nl/media/pages/assets/isometric-landscape/56cb7e96bd-1677695072/kenney_isometric-landscape.zip',
    desc: 'Isometric terrain tiles (grass, water, trees, rocks)'
  },
  {
    name: 'isometric-city',
    url:  'https://kenney.nl/media/pages/assets/isometric-city/771edd28eb-1677695025/kenney_isometric-city.zip',
    desc: 'Isometric city/building tiles'
  },
  {
    name: 'isometric-blocks',
    url:  'https://kenney.nl/media/pages/assets/isometric-blocks/7155a25862-1677662261/kenney_isometric-blocks.zip',
    desc: 'Isometric block tiles for terrain and structures'
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, { headers: { 'User-Agent': 'IronDominion-AssetDownloader/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', err => { fs.unlinkSync(dest); reject(err); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   IRON DOMINION - Asset Downloader   ║');
  console.log('╚══════════════════════════════════════╝\n');

  for (const pack of PACKS) {
    const zipPath  = path.join(ASSETS_DIR, `${pack.name}.zip`);
    const packDir  = path.join(ASSETS_DIR, pack.name);

    if (fs.existsSync(packDir)) {
      console.log(`✓ ${pack.name} (already downloaded)`);
      continue;
    }

    console.log(`↓ Downloading ${pack.name}...`);
    console.log(`  ${pack.desc}`);
    try {
      await download(pack.url, zipPath);
      console.log(`  Extracting...`);
      fs.mkdirSync(packDir, { recursive: true });
      execSync(`unzip -q "${zipPath}" -d "${packDir}"`);
      fs.unlinkSync(zipPath);
      console.log(`  ✓ Done!\n`);
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`);
      console.error(`  Try manually downloading from: ${pack.url}`);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    }
  }

  console.log('\nDone! Restart the game server and reload the page.\n');
}

main().catch(console.error);
