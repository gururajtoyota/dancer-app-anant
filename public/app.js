const state = { show: { title: '', subtitle: '' }, numbers: [], sha: '' };

const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const titleEl = document.getElementById('showTitle');
const subtitleEl = document.getElementById('showSubtitle');
const statsEl = document.getElementById('stats');
const toastEl = document.getElementById('toast');
const unlockBtn = document.getElementById('unlockBtn');
const lockBtn = document.getElementById('lockBtn');
const saveBtn = document.getElementById('saveBtn');
const addBtn = document.getElementById('addBtn');
const dialog = document.getElementById('unlockDialog');
const unlockForm = document.getElementById('unlockForm');
const passcodeInput = document.getElementById('passcodeInput');
const unlockError = document.getElementById('unlockError');

let editing = false;
let dirty = false;
let passcode = sessionStorage.getItem('dance-view:passcode') || '';

const PALETTE = [
    ['#e8f0ff', '#2f66d6'],
    ['#eeeaff', '#5f4fd1'],
    ['#e3f7f1', '#1f9d73'],
    ['#fdf1e0', '#b9761a'],
    ['#fdeaf0', '#d34c76'],
    ['#e6f5fb', '#2481a8'],
    ['#f2f0e6', '#8a7f38'],
    ['#f0ecff', '#7c6cf0'],
];

function colorFor(name) {
    let hash = 0;
    for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
    return PALETTE[hash % PALETTE.length];
}

function toast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', isError);
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function markDirty() {
    dirty = true;
    saveBtn.dataset.dirty = 'true';
}

function normalize(data) {
    const show = (data && data.show) || {};
    const numbers = Array.isArray(data && data.numbers) ? data.numbers : [];
    return {
        show: {
            title: show.title || 'Dance Showcase',
            subtitle: show.subtitle || '',
        },
        numbers: numbers.map((n, i) => ({
            id: n.id || `n${i + 1}`,
            order: Number(n.order) || i + 1,
            song: n.song || '',
            duration: n.duration || '',
            status: ['planned', 'rehearsing', 'ready'].includes(n.status) ? n.status : 'planned',
            notes: n.notes || '',
            dancers: (Array.isArray(n.dancers) ? n.dancers : []).filter(Boolean),
        })).sort((a, b) => a.order - b.order),
    };
}

function renderStats() {
    const dancers = new Set();
    state.numbers.forEach((n) => n.dancers.forEach((d) => dancers.add(d.toLowerCase())));
    const totalSeconds = state.numbers.reduce((sum, n) => {
        const m = /^(\d+):([0-5]?\d)$/.exec((n.duration || '').trim());
        return m ? sum + Number(m[1]) * 60 + Number(m[2]) : sum;
    }, 0);
    const runtime = totalSeconds
        ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
        : '—';

    statsEl.textContent = '';
    [
        [state.numbers.length, 'numbers'],
        [dancers.size, 'dancers'],
        [runtime, 'runtime'],
    ].forEach(([value, label]) => {
        const span = document.createElement('span');
        const strong = document.createElement('b');
        strong.textContent = value;
        span.append(strong, ` ${label}`);
        statsEl.appendChild(span);
    });
}

function makeChip(number, index, rerenderChips) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const [bg, fg] = colorFor(number.dancers[index] || '?');
    chip.style.setProperty('--chip-bg', bg);
    chip.style.setProperty('--chip-fg', fg);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = number.dancers[index];
    if (editing) {
        name.contentEditable = 'true';
        name.spellcheck = false;
        name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
        });
        name.addEventListener('blur', () => {
            const value = name.textContent.trim();
            if (value === number.dancers[index]) return;
            if (!value) number.dancers.splice(index, 1);
            else number.dancers[index] = value;
            markDirty();
            rerenderChips();
            renderStats();
        });
    }

    chip.appendChild(name);

    if (editing) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove';
        remove.textContent = '✕';
        remove.title = 'Remove dancer';
        remove.addEventListener('click', () => {
            number.dancers.splice(index, 1);
            markDirty();
            rerenderChips();
            renderStats();
        });
        chip.appendChild(remove);
    }

    return chip;
}

function buildRow(number, position) {
    const row = template.content.firstElementChild.cloneNode(true);
    const $ = (sel) => row.querySelector(sel);

    row.dataset.status = number.status;
    $('.order-num').textContent = position + 1;
    $('.song-input').value = number.song;
    $('.notes-input').value = number.notes;
    $('.duration-input').value = number.duration;
    $('.status-select').value = number.status;

    ['.song-input', '.notes-input', '.duration-input'].forEach((sel) => {
        $(sel).readOnly = !editing;
    });
    $('.status-select').disabled = !editing;
    $('.dancer-input').disabled = !editing;

    const chipsEl = $('.chips');
    const renderChips = () => {
        chipsEl.textContent = '';
        number.dancers.forEach((_, i) => chipsEl.appendChild(makeChip(number, i, renderChips)));
    };
    renderChips();

    if (!editing) return row;

    $('.song-input').addEventListener('input', (e) => { number.song = e.target.value; markDirty(); });
    $('.notes-input').addEventListener('input', (e) => { number.notes = e.target.value; markDirty(); });
    $('.duration-input').addEventListener('input', (e) => {
        number.duration = e.target.value;
        markDirty();
        renderStats();
    });
    $('.status-select').addEventListener('change', (e) => {
        number.status = e.target.value;
        row.dataset.status = number.status;
        markDirty();
    });

    const dancerInput = $('.dancer-input');
    dancerInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        const value = dancerInput.value.trim();
        if (!value) return;
        value.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => number.dancers.push(v));
        dancerInput.value = '';
        markDirty();
        renderChips();
        renderStats();
    });

    $('.move.up').addEventListener('click', () => move(position, -1));
    $('.move.down').addEventListener('click', () => move(position, 1));
    $('.delete').addEventListener('click', () => {
        state.numbers.splice(position, 1);
        markDirty();
        render();
    });

    return row;
}

function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.numbers.length) return;
    const [item] = state.numbers.splice(index, 1);
    state.numbers.splice(target, 0, item);
    markDirty();
    render();
}

function render() {
    state.numbers.forEach((n, i) => { n.order = i + 1; });
    titleEl.textContent = state.show.title;
    subtitleEl.textContent = state.show.subtitle;

    listEl.textContent = '';
    const frag = document.createDocumentFragment();
    state.numbers.forEach((n, i) => frag.appendChild(buildRow(n, i)));
    listEl.appendChild(frag);
    renderStats();
}

function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    unlockBtn.hidden = on;
    lockBtn.hidden = !on;
    saveBtn.hidden = !on;
    titleEl.contentEditable = on ? 'true' : 'false';
    subtitleEl.contentEditable = on ? 'true' : 'false';
    render();
}

function apply(payload) {
    const clean = normalize(payload);
    state.show = clean.show;
    state.numbers = clean.numbers;
    state.sha = payload.sha || state.sha;
    render();
}

async function save() {
    state.show.title = titleEl.textContent.trim();
    state.show.subtitle = subtitleEl.textContent.trim();
    state.numbers.forEach((n, i) => { n.order = i + 1; });

    saveBtn.disabled = true;
    try {
        const res = await fetch('api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Edit-Passcode': passcode },
            body: JSON.stringify({ data: { show: state.show, numbers: state.numbers }, sha: state.sha }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 409) return toast(body.error, true);
        if (res.status === 401) {
            setEditing(false);
            passcode = '';
            sessionStorage.removeItem('dance-view:passcode');
            return toast('Session expired — unlock again', true);
        }
        if (!res.ok) throw new Error(body.error || 'Save failed');

        state.sha = body.sha;
        dirty = false;
        saveBtn.dataset.dirty = 'false';
        toast('Saved');
    } catch (err) {
        toast(err.message || 'Could not save', true);
    } finally {
        saveBtn.disabled = false;
    }
}

async function unlock(candidate) {
    const res = await fetch('api/unlock', {
        method: 'POST',
        headers: { 'X-Edit-Passcode': candidate },
    });
    if (!res.ok) return false;
    passcode = candidate;
    sessionStorage.setItem('dance-view:passcode', candidate);
    return true;
}

async function load() {
    const [configRes, dataRes] = await Promise.all([fetch('api/config'), fetch('api/data')]);
    const config = await configRes.json();
    apply(await dataRes.json());
    unlockBtn.hidden = !config.editable;
}

/* ---------- events ---------- */

unlockBtn.addEventListener('click', () => {
    unlockError.hidden = true;
    passcodeInput.value = '';
    dialog.showModal();
});

document.getElementById('unlockCancel').addEventListener('click', () => dialog.close());

unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await unlock(passcodeInput.value);
    passcodeInput.value = '';
    if (!ok) {
        unlockError.hidden = false;
        return;
    }
    dialog.close();
    setEditing(true);
});

lockBtn.addEventListener('click', () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    setEditing(false);
    if (dirty) {
        dirty = false;
        saveBtn.dataset.dirty = 'false';
        load();
    }
});

saveBtn.addEventListener('click', save);

addBtn.addEventListener('click', () => {
    state.numbers.push({
        id: 'n' + Date.now().toString(36),
        order: state.numbers.length + 1,
        song: '',
        duration: '',
        status: 'planned',
        notes: '',
        dancers: [],
    });
    markDirty();
    render();
    listEl.lastElementChild.querySelector('.song-input').focus();
});

[titleEl, subtitleEl].forEach((el) => {
    el.addEventListener('input', () => { if (editing) markDirty(); });
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
});

document.addEventListener('keydown', (e) => {
    if (editing && (e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
});

window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

load().catch(() => toast('Could not load the choreography list', true));
