const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.json': 'application/json',
};

// ── Browser log receiver ───────────────────────
// Game page POSTs errors here so we can see them in terminal
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

http.createServer((req, res) => {
    // Browser error log endpoint
    if (req.url === '/__log' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const { level, msg, stack } = JSON.parse(body);
                const ts = new Date().toLocaleTimeString();
                if (level === 'error') {
                    console.error(`\x1b[31m[${ts}] BROWSER ERROR:\x1b[0m ${msg}`);
                    if (stack) console.error(`\x1b[33m${stack}\x1b[0m`);
                } else {
                    console.log(`\x1b[36m[${ts}] BROWSER LOG:\x1b[0m ${msg}`);
                }
            } catch(e) {}
            res.writeHead(204, CORS); res.end();
        });
        return;
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS); res.end(); return;
    }

    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(__dirname, urlPath);
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + urlPath);
            return;
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log('\n\x1b[32m╔══════════════════════════════════════╗');
    console.log('║      IRON DOMINION - Game Server     ║');
    console.log('╚══════════════════════════════════════╝\x1b[0m');
    console.log(`\n  Open Chrome: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`  Browser errors will stream here in real-time\n`);
});
