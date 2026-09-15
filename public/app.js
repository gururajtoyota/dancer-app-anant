const state = { show: { title: '', subtitle: '' }, numbers: [] };
const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const saveBtn = document.getElementById('saveBtn');
const titleEl = document.getElementById('showTitle');
const subtitleEl = document.getElementById('showSubtitle');
const statsEl = document.getElementById('stats');
const toastEl = document.getElementById('toast');

let dirty = false;
let saveTimer = null;

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
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function markDirty() {
    dirty = true;
    saveBtn.dataset.dirty = 'true';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
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
    statsEl.innerHTML = `<span><b>${state.numbers.length}</b> numbers</span>
    <span><b>${dancers.size}</b> dancers</span>
    <span><b>${runtime}</b> runtime</span>`;
}

function makeChip(number, index, rerenderChips) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const [bg, fg] = colorFor(number.dancers[index] || '?');
    chip.style.setProperty('--chip-bg', bg);
    chip.style.setProperty('--chip-fg', fg);

    const name = document.createElement('span');
    name.className = 'name';
    name.contentEditable = 'true';
    name.spellcheck = false;
    name.textContent = number.dancers[index];
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

    chip.append(name, remove);
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

    const chipsEl = $('.chips');
    const renderChips = () => {
        chipsEl.textContent = '';
        number.dancers.forEach((_, i) => chipsEl.appendChild(makeChip(number, i, renderChips)));
    };
    renderChips();

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
    listEl.textContent = '';
    const frag = document.createDocumentFragment();
    state.numbers.forEach((n, i) => frag.appendChild(buildRow(n, i)));
    listEl.appendChild(frag);
    renderStats();
}

async function save() {
    clearTimeout(saveTimer);
    state.show.title = titleEl.textContent.trim();
    state.show.subtitle = subtitleEl.textContent.trim();
    state.numbers.forEach((n, i) => { n.order = i + 1; });
    try {
        const res = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state),
        });
        if (!res.ok) throw new Error('Request failed');
        dirty = false;
        saveBtn.dataset.dirty = 'false';
        toast('Saved to choreography.yaml');
    } catch {
        toast('Could not save — is the server running?', true);
    }
}

async function load() {
    const res = await fetch('/api/data');
    const data = await res.json();
    state.show = data.show;
    state.numbers = data.numbers.sort((a, b) => a.order - b.order);
    titleEl.textContent = data.show.title;
    subtitleEl.textContent = data.show.subtitle;
    render();
}

[titleEl, subtitleEl].forEach((el) => {
    el.addEventListener('input', markDirty);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
});

saveBtn.addEventListener('click', save);

document.getElementById('addBtn').addEventListener('click', () => {
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

document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
});

window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

load().catch(() => toast('Could not load data', true));
