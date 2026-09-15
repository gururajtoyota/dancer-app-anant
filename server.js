'use strict';

const http = require('http');
const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const yaml = require('./public/yaml');

const PORT = process.env.PORT || 4321;
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_PATH = process.env.DATA_PATH || 'public/data/choreography.yaml';
const LOCAL_DATA_FILE = path.join(__dirname, DATA_PATH);

const PASSCODE = process.env.EDIT_PASSCODE || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const USE_GITHUB = Boolean(GITHUB_TOKEN && GITHUB_REPO);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

/* ---------- helpers ---------- */

function sendJSON(res, code, body) {
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
}

function readBody(req, limit = 512_000) {
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
            order: idx + 1,
            song: str(n && n.song, 200),
            duration: str(n && n.duration, 20),
            status: ['planned', 'rehearsing', 'ready'].includes(str(n && n.status, 20)) ? n.status : 'planned',
            notes: str(n && n.notes, 500),
            dancers: (Array.isArray(n && n.dancers) ? n.dancers : [])
                .slice(0, 100)
                .map((d) => str(d, 80))
                .filter(Boolean),
        })),
    };
}

/* ---------- auth + rate limiting ---------- */

const attempts = new Map();

function rateLimited(req, max = 20, windowMs = 10 * 60 * 1000) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || now > entry.reset) {
        attempts.set(ip, { count: 1, reset: now + windowMs });
        return false;
    }
    entry.count += 1;
    return entry.count > max;
}

function passcodeValid(req) {
    if (!PASSCODE) return false;
    const given = crypto.createHash('sha256').update(str(req.headers['x-edit-passcode'], 200)).digest();
    const expected = crypto.createHash('sha256').update(PASSCODE).digest();
    return crypto.timingSafeEqual(given, expected);
}

/* ---------- storage: GitHub or local file ---------- */

async function githubRequest(method, body) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_PATH}`
        + (method === 'GET' ? `?ref=${encodeURIComponent(GITHUB_BRANCH)}` : '');
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'dance-view',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const detail = await res.text();
        const error = new Error(`GitHub ${method} failed: ${res.status}`);
        error.status = res.status;
        error.detail = detail.slice(0, 300);
        throw error;
    }
    return res.json();
}

async function loadData() {
    if (USE_GITHUB) {
        const file = await githubRequest('GET');
        const text = Buffer.from(file.content, 'base64').toString('utf8');
        return { data: sanitize(yaml.parse(text)), sha: file.sha };
    }
    const text = await fsp.readFile(LOCAL_DATA_FILE, 'utf8');
    return { data: sanitize(yaml.parse(text)), sha: crypto.createHash('sha1').update(text).digest('hex') };
}

async function saveData(data, sha) {
    const text = yaml.dump(data);

    if (USE_GITHUB) {
        const result = await githubRequest('PUT', {
            message: 'Update choreography from dance-view',
            content: Buffer.from(text, 'utf8').toString('base64'),
            branch: GITHUB_BRANCH,
            sha,
        });
        return result.content.sha;
    }

    const current = await fsp.readFile(LOCAL_DATA_FILE, 'utf8');
    const currentSha = crypto.createHash('sha1').update(current).digest('hex');
    if (sha && sha !== currentSha) {
        const conflict = new Error('Stale sha');
        conflict.status = 409;
        throw conflict;
    }
    const tmp = LOCAL_DATA_FILE + '.tmp';
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, LOCAL_DATA_FILE);
    return crypto.createHash('sha1').update(text).digest('hex');
}

/* ---------- static files ---------- */

async function serveStatic(req, res, urlPath) {
    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    try {
        const content = await fsp.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
}

/* ---------- routes ---------- */

const server = http.createServer(async (req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;

    try {
        if (urlPath === '/api/config' && req.method === 'GET') {
            return sendJSON(res, 200, {
                editable: Boolean(PASSCODE),
                storage: USE_GITHUB ? 'github' : 'local',
            });
        }

        if (urlPath === '/api/data' && req.method === 'GET') {
            const { data, sha } = await loadData();
            return sendJSON(res, 200, { ...data, sha });
        }

        if (urlPath === '/api/data.yaml' && req.method === 'GET') {
            const { data } = await loadData();
            res.writeHead(200, {
                'Content-Type': 'text/yaml; charset=utf-8',
                'Content-Disposition': 'attachment; filename="choreography.yaml"',
                'Cache-Control': 'no-store',
            });
            return res.end(yaml.dump(data));
        }

        if (urlPath === '/api/unlock' && req.method === 'POST') {
            if (rateLimited(req)) return sendJSON(res, 429, { error: 'Too many attempts' });
            if (!passcodeValid(req)) return sendJSON(res, 401, { error: 'Wrong passcode' });
            return sendJSON(res, 200, { ok: true });
        }

        if (urlPath === '/api/data' && req.method === 'PUT') {
            if (rateLimited(req, 60)) return sendJSON(res, 429, { error: 'Too many requests' });
            if (!passcodeValid(req)) return sendJSON(res, 401, { error: 'Wrong passcode' });

            let payload;
            try {
                payload = JSON.parse(await readBody(req));
            } catch {
                return sendJSON(res, 400, { error: 'Invalid JSON' });
            }

            const data = sanitize(payload && payload.data);
            try {
                const sha = await saveData(data, str(payload && payload.sha, 100));
                return sendJSON(res, 200, { ...data, sha });
            } catch (err) {
                if (err.status === 409) {
                    return sendJSON(res, 409, { error: 'The list changed elsewhere — reload before saving' });
                }
                throw err;
            }
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            return await serveStatic(req, res, urlPath);
        }

        res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT' }).end('Method not allowed');
    } catch (err) {
        console.error(err.message, err.detail || '');
        sendJSON(res, 500, { error: 'Server error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Dance view on http://${HOST}:${PORT} · storage: ${USE_GITHUB ? 'github' : 'local file'}`
        + `${PASSCODE ? '' : ' · editing disabled (no EDIT_PASSCODE)'}`);
});
