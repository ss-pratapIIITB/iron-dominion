#!/usr/bin/env node
// ============================================================
// IRON DOMINION - Autonomous Screenshot Tool (Puppeteer)
// Usage: node screenshot-3d.js [output.png] [delay_ms]
// ============================================================

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

const outFile = process.argv[2] || '/tmp/iron-dominion-3d.png';
const delay   = parseInt(process.argv[3] || '6000');  // ms to wait for game to render

(async () => {
  console.log(`[screenshot-3d] Launching browser, will capture in ${delay}ms...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox',
           '--disable-web-security', '--enable-webgl',
           '--use-gl=swiftshader',    // software WebGL for headless
           '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();

  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:8080/index.html?nofog', {
    waitUntil: 'networkidle0',
    timeout: 20000,
  });

  // Wait for game to render 3D scene
  await new Promise(r => setTimeout(r, delay));

  await page.screenshot({ path: outFile, fullPage: false });
  await browser.close();

  const stat = fs.statSync(outFile);
  console.log(`[screenshot-3d] Saved to ${outFile} (${(stat.size / 1024).toFixed(1)} KB)`);

  if (errors.length > 0) {
    console.log('\n[screenshot-3d] Console errors during render:');
    errors.slice(0, 10).forEach(e => console.log('  >', e));
  } else {
    console.log('[screenshot-3d] No JS errors detected.');
  }
})().catch(err => {
  console.error('[screenshot-3d] Failed:', err.message);
  process.exit(1);
});
