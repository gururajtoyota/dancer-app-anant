const state = { show: { title: '', subtitle: '', theme: '', masterAudio: '' }, numbers: [], sha: '' };

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
const dancerFilter = document.getElementById('dancerFilter');
const dancerOptions = document.getElementById('dancerOptions');
const statusFilter = document.getElementById('statusFilter');
const clearFilters = document.getElementById('clearFilters');
const filterCount = document.getElementById('filterCount');
const themeText = document.getElementById('themeText');
const masterAudioPlayer = document.getElementById('masterAudioPlayer');
const masterAudioEmbed = document.getElementById('masterAudioEmbed');
const masterAudioFrame = document.getElementById('masterAudioFrame');
const masterAudioLink = document.getElementById('masterAudioLink');
const masterAudioEmpty = document.getElementById('masterAudioEmpty');
const masterAudioUpload = document.getElementById('masterAudioUpload');
const masterAudioUploadStatus = document.getElementById('masterAudioUploadStatus');

const DANCER_FILTER_KEY = 'dance-view:dancer';

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

// Only absolute http(s) links, so a pasted value can never become javascript: or data:
function safeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function setAudioLink(row, url) {
    const link = row.querySelector('.audio-link');
    const empty = row.querySelector('.audio-empty');
    if (url) {
        link.href = url;
        link.hidden = false;
        empty.hidden = true;
    } else {
        link.removeAttribute('href');
        link.hidden = true;
        empty.hidden = false;
    }
}

// Drive's /view share links serve an HTML viewer, not a media stream, so <audio src>
// can't play them — its own /preview endpoint embeds a working player instead.
function driveFileId(url) {
    const m = /^https:\/\/drive\.google\.com\/file\/d\/([^/]+)/.exec(url || '');
    return m ? m[1] : '';
}

function setMasterAudio(url) {
    const driveId = driveFileId(url);

    if (driveId) {
        masterAudioFrame.src = `https://drive.google.com/file/d/${driveId}/preview`;
        masterAudioEmbed.hidden = false;
        masterAudioPlayer.hidden = true;
        masterAudioPlayer.removeAttribute('src');
    } else if (url) {
        masterAudioPlayer.src = url;
        masterAudioPlayer.hidden = false;
        masterAudioEmbed.hidden = true;
        masterAudioFrame.removeAttribute('src');
    } else {
        masterAudioPlayer.hidden = true;
        masterAudioPlayer.removeAttribute('src');
        masterAudioEmbed.hidden = true;
        masterAudioFrame.removeAttribute('src');
    }

    if (url) {
        masterAudioLink.href = url;
        masterAudioLink.hidden = false;
        masterAudioEmpty.hidden = true;
    } else {
        masterAudioLink.removeAttribute('href');
        masterAudioLink.hidden = true;
        masterAudioEmpty.hidden = false;
    }
}

function setVideoLink(row, url) {
    const link = row.querySelector('.video-link');
    const empty = row.querySelector('.video-empty');
    if (url) {
        link.href = url;
        link.hidden = false;
        empty.hidden = true;
    } else {
        link.removeAttribute('href');
        link.hidden = true;
        empty.hidden = false;
    }
}

function normalize(data) {
    const show = (data && data.show) || {};
    const numbers = Array.isArray(data && data.numbers) ? data.numbers : [];
    return {
        show: {
            title: show.title || 'Dance Showcase',
            subtitle: show.subtitle || '',
            theme: show.theme || '',
            masterAudio: safeUrl(show.masterAudio),
        },
        numbers: numbers.map((n, i) => ({
            id: n.id || `n${i + 1}`,
            order: Number(n.order) || i + 1,
            song: n.song || '',
            duration: n.duration || '',
            audio: safeUrl(n.audio),
            video: safeUrl(n.video),
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
    $('.audio-input').value = number.audio;
    $('.video-input').value = number.video;
    setAudioLink(row, number.audio);
    setVideoLink(row, number.video);

    ['.song-input', '.notes-input', '.duration-input', '.audio-input', '.video-input'].forEach((sel) => {
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
    $('.audio-input').addEventListener('input', (e) => {
        number.audio = safeUrl(e.target.value);
        setAudioLink(row, number.audio);
        markDirty();
    });
    $('.video-input').addEventListener('input', (e) => {
        number.video = safeUrl(e.target.value);
        setVideoLink(row, number.video);
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

function autoGrowTextarea(el) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
}

function renderShowInfo() {
    themeText.value = state.show.theme || '';
    themeText.readOnly = !editing;
    autoGrowTextarea(themeText);
    setMasterAudio(state.show.masterAudio);
}

function render() {
    state.numbers.forEach((n, i) => { n.order = i + 1; });
    titleEl.textContent = state.show.title;
    subtitleEl.textContent = state.show.subtitle;
    renderShowInfo();

    listEl.textContent = '';
    const frag = document.createDocumentFragment();
    state.numbers.forEach((n, i) => frag.appendChild(buildRow(n, i)));
    listEl.appendChild(frag);
    renderStats();
    renderDancerOptions();
    applyFilters();
}

function renderDancerOptions() {
    const names = [...new Set(state.numbers.flatMap((n) => n.dancers))]
        .sort((a, b) => a.localeCompare(b));
    const current = dancerFilter.value;

    dancerFilter.textContent = '';
    const all = new Option('Everyone', '');
    dancerFilter.add(all);
    names.forEach((name) => dancerFilter.add(new Option(name, name.toLowerCase())));
    dancerFilter.value = names.some((n) => n.toLowerCase() === current) ? current : '';

    dancerOptions.textContent = '';
    names.forEach((name) => dancerOptions.appendChild(new Option(name)));
}

function applyFilters() {
    const dancer = dancerFilter.value;
    const status = statusFilter.value;
    const active = Boolean(dancer || status);
    let shown = 0;

    [...listEl.children].forEach((row, i) => {
        const number = state.numbers[i];
        const inNumber = !dancer || number.dancers.some((d) => d.toLowerCase() === dancer);
        const matches = inNumber && (!status || number.status === status);
        row.hidden = !matches;
        row.classList.toggle('mine', Boolean(dancer) && matches);
        if (matches) shown += 1;

        row.querySelectorAll('.chip').forEach((chip, ci) => {
            chip.classList.toggle('match', Boolean(dancer) && number.dancers[ci].toLowerCase() === dancer);
        });
    });

    clearFilters.hidden = !active;
    filterCount.textContent = active ? `${shown} of ${state.numbers.length} numbers` : '';
    if (dancer) localStorage.setItem(DANCER_FILTER_KEY, dancer);
    else localStorage.removeItem(DANCER_FILTER_KEY);
}

function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    unlockBtn.hidden = on;
    lockBtn.hidden = !on;
    saveBtn.hidden = !on;
    titleEl.contentEditable = on ? 'true' : 'false';
    subtitleEl.contentEditable = on ? 'true' : 'false';
    if (on) {
        // hidden rows would make reordering confusing
        dancerFilter.value = '';
        statusFilter.value = '';
    }
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
    const saved = localStorage.getItem(DANCER_FILTER_KEY);
    apply(await dataRes.json());
    if (saved) {
        dancerFilter.value = saved;
        applyFilters();
    }
    unlockBtn.hidden = !config.editable;
}

dancerFilter.addEventListener('change', applyFilters);
statusFilter.addEventListener('change', applyFilters);
clearFilters.addEventListener('click', () => {
    dancerFilter.value = '';
    statusFilter.value = '';
    applyFilters();
});

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
        audio: '',
        video: '',
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

themeText.addEventListener('input', () => {
    if (!editing) return;
    state.show.theme = themeText.value;
    autoGrowTextarea(themeText);
    markDirty();
});

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function uploadMasterAudio(file) {
    if (file.size > MAX_AUDIO_BYTES) {
        toast('Audio file is too large (max 50MB)', true);
        return;
    }
    masterAudioUpload.disabled = true;
    masterAudioUploadStatus.textContent = `Uploading ${file.name}…`;
    try {
        const contentBase64 = await fileToBase64(file);
        const res = await fetch('api/upload/master-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Edit-Passcode': passcode },
            body: JSON.stringify({ filename: file.name, contentBase64 }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 401) {
            setEditing(false);
            passcode = '';
            sessionStorage.removeItem('dance-view:passcode');
            toast('Session expired — unlock again', true);
            return;
        }
        if (!res.ok) throw new Error(body.error || 'Upload failed');

        state.show.masterAudio = safeUrl(body.url);
        setMasterAudio(state.show.masterAudio);
        markDirty();
        masterAudioUploadStatus.textContent = `Uploaded ${file.name} — click Save to publish`;
        toast('Uploaded — click Save to publish');
    } catch (err) {
        masterAudioUploadStatus.textContent = '';
        toast(err.message || 'Could not upload audio', true);
    } finally {
        masterAudioUpload.disabled = false;
        masterAudioUpload.value = '';
    }
}

masterAudioUpload.addEventListener('change', () => {
    const file = masterAudioUpload.files[0];
    if (file) uploadMasterAudio(file);
});

document.addEventListener('keydown', (e) => {
    if (editing && (e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
});

window.addEventListener('resize', () => autoGrowTextarea(themeText));
if (document.fonts) document.fonts.ready.then(() => autoGrowTextarea(themeText));

window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

load().catch(() => toast('Could not load the choreography list', true));
