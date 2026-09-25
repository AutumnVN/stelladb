// @ts-nocheck
const ITEM_RE = /@(pot|disc|skill)\(([^)]*)\)/g;

const escHtml = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const attrEsc = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

function inlineBold(text) {
    return text.replace(/\*\*([^*]+?)\*\*/g, (_, t) => `<strong>${inlineBold(t) || t}</strong>`);
}

function inlineCode(text) {
    return text.replace(/`([^`\r\n]+)`/g, (_, t) => `<code>${attrEsc(t)}</code>`);
}

export function renderInline(text) {
    if (text == null) return '';
    let out = escHtml(String(text));

    const ESC = '\u0001';
    const escs = [];
    out = out.replace(/\\([*_~`])/g, (m, c) => {
        const ph = ESC + escs.length + ESC;
        escs.push(c);
        return ph;
    });

    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => `<img src="${attrEsc(url)}" alt="${attrEsc(alt)}" />`);
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => `<a href="${attrEsc(url)}" target="_blank" rel="noreferrer">${inlineBold(label) || label}</a>`);
    out = inlineCode(out);
    out = inlineBold(out);
    out = out.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s),.!?]|$)/g, (_, pre, t) => `${pre}<em>${inlineBold(t) || t}</em>`);
    out = out.replace(/(^|[\s(])(?<!_)_([^_\s][^_]*?)_(?=[\s),.!?]|$)/g, (_, pre, t) => `${pre}<em>${inlineBold(t) || t}</em>`);
    out = out.replace(/~~([^~\r\n]+?)~~/g, (_, t) => `<del>${inlineBold(t) || t}</del>`);
    out = out.replace(/__([^_\r\n]+?)__/g, (_, t) => `<u>${inlineBold(t) || t}</u>`);

    out = out.replace(new RegExp(ESC + '(\\d+)' + ESC, 'g'), (_, i) => escs[Number(i)]);
    out = out.replace(/\r?\n/g, '<br />');
    return out;
}

export function slugify(text) {
    return (
        String(text || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'untitled'
    );
}

export function parseBlockArg(arg) {
    const m = String(arg).match(/^(.+),\s*(\d+\+?)\s*$/);
    if (m) return { name: m[1].trim(), level: m[2] };
    return { name: String(arg).trim(), level: null };
}

export function parseFrontmatter(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { frontmatter: {}, body: raw };
    const frontmatter = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i === -1) continue;
        const key = line.slice(0, i).trim();
        let value = line.slice(i + 1).trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value.startsWith('//')) value = null;
        else value = value.replace(/^(['"])(.*)\1$/, '$2');
        frontmatter[key] = value;
    }
    return { frontmatter, body: raw.slice(m[0].length) };
}

function looksLikeTable(line) {
    const t = line.trim();
    return t.includes('|') && (t.startsWith('|') || t.includes(' | '));
}

export function parseTeam(raw) {
    const { frontmatter, body } = parseFrontmatter(raw);
    const lines = body.split(/\r?\n/);

    const tabs = [];
    let currentTab = null;
    let paragraph = [];
    let tableHeader = null;
    let tableRows = null;

    function flushParagraph() {
        if (!paragraph.length) return;
        currentTab.sections.push({ type: 'p', text: paragraph.join('\n') });
        paragraph = [];
    }

    function flushTable() {
        if (!tableRows) {
            tableHeader = null;
            return;
        }
        currentTab.sections.push({ type: 'table', headers: tableHeader || [], rows: tableRows });
        tableHeader = null;
        tableRows = null;
    }

    function flushAll() {
        if (!currentTab) return;
        flushParagraph();
        flushTable();
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('//')) continue;
        if (!line) {
            flushParagraph();
            continue;
        }

        if (line.startsWith('# ')) {
            flushAll();
            const title = line.slice(2).trim();
            tabs.push({ title, id: slugify(title), sections: [] });
            currentTab = tabs[tabs.length - 1];
            continue;
        }

        if (!currentTab) continue;

        if (line.startsWith('## ')) {
            flushAll();
            currentTab.sections.push({ type: 'h2', title: line.slice(3).trim() });
            continue;
        }

        if (line.startsWith('### ')) {
            flushAll();
            currentTab.sections.push({ type: 'h3', title: line.slice(4).trim() });
            continue;
        }

        if (looksLikeTable(line)) {
            flushParagraph();
            const cells = line.split('|').map((c) => c.trim());
            if (!tableHeader) {
                tableHeader = cells;
            } else {
                (tableRows = tableRows || []).push(cells);
            }
            continue;
        }

        flushTable();

        ITEM_RE.lastIndex = 0;
        let m;
        const found = [];
        while ((m = ITEM_RE.exec(line))) {
            found.push({ type: m[1], ...parseBlockArg(m[2]), raw: m[0] });
        }
        if (found.length && !line.replace(ITEM_RE, '').trim()) {
            flushParagraph();
            const groups = [];
            for (const f of found) {
                const last = groups[groups.length - 1];
                if (last && last.type === f.type) last.items.push({ name: f.name, level: f.level });
                else groups.push({ type: f.type, items: [{ name: f.name, level: f.level }] });
            }
            for (const g of groups) currentTab.sections.push({ type: g.type, items: g.items });
            continue;
        }

        paragraph.push(line);
    }
    flushAll();

    const character = tabs.filter((t) => t.title.toLowerCase() !== 'disc' && t.title.toLowerCase() !== 'rotation' && t.title.toLowerCase() !== 'code').map((t) => t.title).join(', ');

    return {
        title: frontmatter.title || character || 'Untitled',
        wip: !!frontmatter.wip,
        character,
        tabs,
        frontmatter,
    };
}

export function loadAllTeams() {
    const modules = import.meta.glob('../content/infodoc2/**/*.md', { query: '?raw', import: 'default', eager: true });
    return Object.keys(modules)
        .map((filePath) => {
            const parts = filePath.split('/');
            const element = parts[parts.length - 2];
            const slug = parts[parts.length - 1].replace(/\.md$/, '');
            const team = parseTeam(modules[filePath]);
            return { ...team, element, slug, href: `/infodoc2/${element}/${slug}` };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
}

export function normalizeName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildNameIndex(json) {
    const entries = Array.isArray(json) ? json.map((v, i) => [String(i), v]) : Object.entries(json);
    const byName = new Map();
    const byNorm = new Map();
    for (const [id, value] of entries) {
        const name = value && value.name;
        if (!name) continue;
        const lower = String(name).toLowerCase();
        if (!byName.has(lower)) byName.set(lower, id);
        const norm = normalizeName(name);
        if (!byNorm.has(norm)) byNorm.set(norm, id);
    }
    return { byName, byNorm };
}

export function baseCharacterName(title) {
    const s = String(title || '').trim();
    const i = s.indexOf(' - ');
    const base = (i === -1 ? s : s.slice(0, i)).trim();
    return base || s;
}

export function findId(index, name) {
    const key = String(name || '').toLowerCase();
    if (!key) return null;
    if (index.byName.has(key)) return index.byName.get(key);
    const norm = normalizeName(key);
    if (index.byNorm.has(norm)) return index.byNorm.get(norm);
    return null;
}

export function resolveIds(team, potIndex = null, discIndex = null, skillIndex = null, charIdHint = null, tabCharIds = null, discData = null) {
    for (const tab of team.tabs) {
        const tabHint = (tabCharIds && tabCharIds[tab.id]) || charIdHint;
        for (const section of tab.sections) {
            if (section.type === 'pot') {
                for (const item of section.items) {
                    const list = (potIndex && potIndex.get(String(item.name).toLowerCase())) || [];
                    const best = tabHint ? list.find((e) => e.charId === String(tabHint)) : null;
                    const entry = best || list[0];
                    item.id = entry ? entry.id : null;
                }
            } else if (section.type === 'disc') {
                for (const item of section.items) {
                    const id = findId(discIndex, item.name);
                    item.id = id;
                    if (id && discData && discData[id]) item.data = { name: discData[id].name, star: discData[id].star, element: discData[id].element };
                }
            } else if (section.type === 'skill' && skillIndex) {
                for (const item of section.items) {
                    const list = skillIndex.get(String(item.name).toLowerCase()) || [];
                    const best = tabHint ? list.find((e) => e.charId === String(tabHint)) : null;
                    const entry = best || list[0];
                    item.id = entry ? entry.icon : null;
                    item.data = entry ? { charId: entry.charId, field: entry.field, charName: entry.name } : null;
                }
            }
        }
    }
    return team;
}

export function buildSkillIndex(characterData) {
    const entries = Array.isArray(characterData) ? characterData.map((v, i) => [String(i), v]) : Object.entries(characterData);
    const byName = new Map();
    for (const [id, char] of entries) {
        for (const field of ['normalAtk', 'skill', 'supportSkill', 'ultimate']) {
            const s = char && char[field];
            if (!s || !s.name) continue;
            const key = String(s.name).toLowerCase();
            if (!byName.has(key)) byName.set(key, []);
            byName.get(key).push({ icon: s.icon, name: s.name, charId: id, field });
        }
    }
    return byName;
}

export function buildPotIndex(characterData) {
    const entries = Array.isArray(characterData) ? characterData.map((v, i) => [String(i), v]) : Object.entries(characterData);
    const byName = new Map();
    for (const [id, char] of entries) {
        const potentials = char && char.potential;
        if (!potentials) continue;
        for (const pk of Object.keys(potentials)) {
            const arr = potentials[pk];
            if (!Array.isArray(arr)) continue;
            for (const pot of arr) {
                const name = pot && pot.name;
                if (!name) continue;
                const potId = pot.id ?? pot.Id;
                if (!potId) continue;
                const key = String(name).toLowerCase();
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key).push({ id: potId, name, charId: id });
            }
        }
    }
    return byName;
}
