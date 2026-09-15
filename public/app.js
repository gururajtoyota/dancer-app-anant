const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const titleEl = document.getElementById('showTitle');
const subtitleEl = document.getElementById('showSubtitle');
const statsEl = document.getElementById('stats');
const toastEl = document.getElementById('toast');

const STATUS_LABELS = { planned: 'Planned', rehearsing: 'Rehearsing', ready: 'Ready' };

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

function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3000);
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
            order: Number(n.order) || i + 1,
            song: n.song || '',
            duration: n.duration || '',
            status: STATUS_LABELS[n.status] ? n.status : 'planned',
            notes: n.notes || '',
            dancers: (Array.isArray(n.dancers) ? n.dancers : []).filter(Boolean),
        })).sort((a, b) => a.order - b.order),
    };
}

function renderStats(numbers) {
    const dancers = new Set();
    numbers.forEach((n) => n.dancers.forEach((d) => dancers.add(d.toLowerCase())));
    const totalSeconds = numbers.reduce((sum, n) => {
        const m = /^(\d+):([0-5]?\d)$/.exec(n.duration.trim());
        return m ? sum + Number(m[1]) * 60 + Number(m[2]) : sum;
    }, 0);
    const runtime = totalSeconds
        ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
        : '—';

    statsEl.textContent = '';
    [
        [numbers.length, 'numbers'],
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

function buildRow(number, position) {
    const row = template.content.firstElementChild.cloneNode(true);
    const $ = (sel) => row.querySelector(sel);

    row.dataset.status = number.status;
    $('.order-num').textContent = position + 1;
    $('.song-text').textContent = number.song;
    $('.duration-text').textContent = number.duration || '—';
    $('.status-pill').textContent = STATUS_LABELS[number.status];
    $('.notes-text').textContent = number.notes;

    const chipsEl = $('.chips');
    number.dancers.forEach((dancer) => {
        const [bg, fg] = colorFor(dancer);
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.setProperty('--chip-bg', bg);
        chip.style.setProperty('--chip-fg', fg);
        chip.textContent = dancer;
        chipsEl.appendChild(chip);
    });

    return row;
}

function render(data) {
    titleEl.textContent = data.show.title;
    subtitleEl.textContent = data.show.subtitle;

    listEl.textContent = '';
    const frag = document.createDocumentFragment();
    data.numbers.forEach((n, i) => frag.appendChild(buildRow(n, i)));
    listEl.appendChild(frag);

    renderStats(data.numbers);
}

async function load() {
    const res = await fetch('data/choreography.yaml', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch choreography.yaml');
    render(normalize(MiniYAML.parse(await res.text())));
}

load().catch(() => toast('Could not load the choreography list'));
