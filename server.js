'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const yaml = require('./lib/yaml');

const PORT = process.env.PORT || 4321;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'choreography.yaml');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function sendJSON(res, code, body) {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
}

function readBody(req, limit = 1_000_000) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

const str = (v, max = 400) => (v === null || v === undefined ? '' : String(v).slice(0, max));

function sanitize(payload) {
    const show = payload && typeof payload.show === 'object' && payload.show ? payload.show : {};
    const numbers = Array.isArray(payload && payload.numbers) ? payload.numbers.slice(0, 200) : [];
    return {
        show: {
            title: str(show.title, 120) || 'Dance Showcase',
            subtitle: str(show.subtitle, 160),
        },
        numbers: numbers.map((n, idx) => ({
            id: str(n && n.id, 60) || `n${idx + 1}`,
            order: Number.isFinite(Number(n && n.order)) ? Number(n.order) : idx + 1,
            song: str(n && n.song, 200),
            duration: str(n && n.duration, 20),
            status: ['planned', 'rehearsing', 'ready'].includes(str(n && n.status, 20)) ? n.status : 'planned',
            notes: str(n && n.notes, 500),
            dancers: (Array.isArray(n && n.dancers) ? n.dancers : []).slice(0, 100).map((d) => str(d, 80)).filter(Boolean),
        })),
    };
}

async function loadData() {
    const text = await fsp.readFile(DATA_FILE, 'utf8');
    return sanitize(yaml.parse(text));
}

async function saveData(data) {
    const tmp = DATA_FILE + '.tmp';
    await fsp.writeFile(tmp, yaml.dump(data), 'utf8');
    await fsp.rename(tmp, DATA_FILE);
}

async function serveStatic(req, res, urlPath) {
    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    try {
        const content = await fsp.readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(content);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
}

const server = http.createServer(async (req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;

    try {
        if (urlPath === '/api/data' && req.method === 'GET') {
            return sendJSON(res, 200, await loadData());
        }
        if (urlPath === '/api/data' && req.method === 'PUT') {
            const raw = await readBody(req);
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch {
                return sendJSON(res, 400, { error: 'Invalid JSON' });
            }
            const data = sanitize(parsed);
            await saveData(data);
            return sendJSON(res, 200, data);
        }
        if (urlPath === '/api/data.yaml' && req.method === 'GET') {
            const text = await fsp.readFile(DATA_FILE, 'utf8');
            res.writeHead(200, {
                'Content-Type': 'text/yaml; charset=utf-8',
                'Content-Disposition': 'attachment; filename="choreography.yaml"',
            });
            return res.end(text);
        }
        if (req.method === 'GET') {
            return await serveStatic(req, res, urlPath);
        }
        res.writeHead(405).end('Method not allowed');
    } catch (err) {
        console.error(err);
        sendJSON(res, 500, { error: 'Server error' });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Dance view running at http://127.0.0.1:${PORT}`);
});
