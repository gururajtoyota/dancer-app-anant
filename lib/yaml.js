'use strict';

// Minimal YAML subset: nested maps, block sequences, flow sequences, scalars.

function stripComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
            return line.slice(0, i);
        }
    }
    return line;
}

function parseScalar(raw) {
    const s = raw.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return [];
        return splitFlow(inner).map(parseScalar);
    }
    if (s.startsWith('"') && s.endsWith('"') && s.length > 1) {
        return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    }
    if (s.startsWith("'") && s.endsWith("'") && s.length > 1) {
        return s.slice(1, -1).replace(/''/g, "'");
    }
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s;
}

function splitFlow(text) {
    const parts = [];
    let buf = '';
    let quote = null;
    for (const c of text) {
        if (quote) {
            buf += c;
            if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
            quote = c;
            buf += c;
        } else if (c === ',') {
            parts.push(buf);
            buf = '';
        } else {
            buf += c;
        }
    }
    if (buf.trim()) parts.push(buf);
    return parts;
}

function parse(text) {
    const lines = [];
    for (const raw of String(text).split(/\r?\n/)) {
        const line = stripComment(raw);
        if (!line.trim()) continue;
        lines.push({ indent: line.match(/^ */)[0].length, content: line.trim() });
    }
    let i = 0;

    const isSeqItem = (l) => l.content === '-' || l.content.startsWith('- ');

    function parseNode(indent) {
        if (i >= lines.length) return null;
        return isSeqItem(lines[i]) ? parseSeq(indent) : parseMap(indent);
    }

    function parseSeq(indent) {
        const arr = [];
        while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i])) {
            const rest = lines[i].content.slice(1).trim();
            if (rest === '') {
                i++;
                arr.push(i < lines.length && lines[i].indent > indent ? parseNode(lines[i].indent) : null);
            } else if (/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#]+):(\s|$)/.test(rest)) {
                const childIndent = indent + 2;
                lines[i] = { indent: childIndent, content: rest };
                arr.push(parseMap(childIndent));
            } else {
                i++;
                arr.push(parseScalar(rest));
            }
        }
        return arr;
    }

    function parseMap(indent) {
        const obj = {};
        while (i < lines.length && lines[i].indent === indent && !isSeqItem(lines[i])) {
            const m = lines[i].content.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+):\s*(.*)$/);
            if (!m) { i++; continue; }
            const key = String(parseScalar(m[1]));
            const rest = m[2];
            i++;
            if (rest !== '') {
                obj[key] = parseScalar(rest);
            } else if (i < lines.length && lines[i].indent > indent) {
                obj[key] = parseNode(lines[i].indent);
            } else if (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i])) {
                obj[key] = parseSeq(indent);
            } else {
                obj[key] = null;
            }
        }
        return obj;
    }

    const root = parseNode(lines.length ? lines[0].indent : 0);
    return root === null ? {} : root;
}

function quote(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function dumpScalar(value) {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    return quote(value);
}

function dump(value, indent = 0) {
    const pad = ' '.repeat(indent);
    if (Array.isArray(value)) {
        if (!value.length) return pad + '[]\n';
        return value.map((item) => {
            if (item !== null && typeof item === 'object') {
                const body = dump(item, indent + 2);
                return pad + '- ' + body.slice(indent + 2);
            }
            return pad + '- ' + dumpScalar(item) + '\n';
        }).join('');
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (!keys.length) return pad + '{}\n';
        return keys.map((key) => {
            const v = value[key];
            if (v !== null && typeof v === 'object') {
                if (Array.isArray(v) && !v.length) return pad + key + ': []\n';
                return pad + key + ':\n' + dump(v, indent + 2);
            }
            return pad + key + ': ' + dumpScalar(v) + '\n';
        }).join('');
    }
    return pad + dumpScalar(value) + '\n';
}

module.exports = { parse, dump };
