'use strict';

// Local preview of the static site in ./public (read-only, no write endpoints).

const http = require('http');
const fsp = require('fs').promises;
const path = require('path');

const PORT = process.env.PORT || 4321;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
        return;
    }

    const urlPath = new URL(req.url, 'http://localhost').pathname;
    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);

    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    try {
        const content = await fsp.readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Dance view running at http://127.0.0.1:${PORT}`);
});
