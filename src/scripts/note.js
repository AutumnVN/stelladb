// @ts-nocheck
import { parseFrontmatter, renderInline } from './team.js';

const NOTE_FILE = import.meta.glob('../content/note/**/*.md', { query: '?raw', import: 'default', eager: true });
const ORDER_RE = /^\s*\d+\s*(?:[.)]\s*)?/;
const HEADING_RE = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
const INDENT_CLASS_RE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

let index = null;

function normalizeTitle(text) {
    return String(text ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeHeading(text) {
    return normalizeTitle(text).replace(ORDER_RE, '').trim();
}

function normalizePageKey(text) {
    return normalizeTitle(text).replace(/^\d{3}\s+/, '');
}

function pageKeys(title) {
    const base = normalizePageKey(title);
    return [...new Set([base, base.replace(/[^a-z0-9]+/g, '')])].filter(Boolean);
}

function headingKeys(text) {
    const base = normalizeHeading(text);
    if (!base) return [];
    const keys = new Set([base]);
    const colon = base.indexOf(':');
    if (colon !== -1) {
        const rest = normalizeHeading(base.slice(colon + 1));
        if (rest) keys.add(rest);
    }
    return [...keys];
}

function renderBody(lines) {
    return lines
        .join('\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => renderInline(paragraph));
}

function parseNote(raw) {
    const { body } = parseFrontmatter(raw);
    const entries = [];
    let current = null;
    let currentPage = null;
    let lines = [];

    const flush = () => {
        if (!current) return;
        const html = renderBody(lines);
        if (html.length) entries.push({ ...current, html });
        current = null;
        lines = [];
    };

    for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line.startsWith('# ')) {
            flush();
            const title = line.slice(2).trim();
            const split = title.indexOf('>');
            if (split === -1) {
                currentPage = title;
                continue;
            }
            currentPage = null;
            current = { page: title.slice(0, split).trim(), heading: title.slice(split + 1).trim() };
            continue;
        }

        if ((line.startsWith('## ') || line.startsWith('### ')) && currentPage) {
            flush();
            current = { page: currentPage, heading: line.replace(/^#+\s+/, '').trim() };
            continue;
        }

        if (line.startsWith('//')) continue;
        if (current) lines.push(rawLine);
    }

    flush();
    return entries;
}

function buildIndex() {
    const byPage = new Map();
    for (const raw of Object.values(NOTE_FILE)) {
        for (const entry of parseNote(raw)) {
            for (const key of pageKeys(entry.page)) {
                if (!byPage.has(key)) byPage.set(key, new Map());
                const targets = byPage.get(key);
                for (const target of headingKeys(entry.heading)) {
                    if (!targets.has(target)) targets.set(target, []);
                    targets.get(target).push(...entry.html);
                }
            }
        }
    }
    return byPage;
}

export function getNote(pageTitle) {
    if (!index) index = buildIndex();
    for (const key of pageKeys(pageTitle)) {
        const note = index.get(key);
        if (note) return note;
    }
    return new Map();
}

export function findNote(note, heading) {
    const found = [];
    const seen = new Set();
    for (const key of headingKeys(heading)) {
        for (const html of note.get(key) || []) {
            if (seen.has(html)) continue;
            seen.add(html);
            found.push(html);
        }
    }
    return found;
}

function decodeEntities(text) {
    const named = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"',
    };
    return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
        if (code[0] === '#') {
            const hex = code[1] === 'x' || code[1] === 'X';
            const value = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
            return Number.isFinite(value) ? String.fromCodePoint(value) : match;
        }
        return named[code.toLowerCase()] ?? match;
    });
}

function textOf(html) {
    return decodeEntities(String(html).replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

function findClosingTag(html, from, tagName) {
    TAG_RE.lastIndex = from;
    let depth = 1;
    let match;
    while ((match = TAG_RE.exec(html))) {
        if (!match[2]) continue;
        if (match[2].toLowerCase() !== tagName) continue;
        const closing = match[1] === '/';
        const selfClosing = /\/\s*$/.test(match[3]) || VOID_TAGS.has(tagName);
        if (closing) depth--;
        else if (!selfClosing) depth++;
        if (depth === 0) return match.index;
    }
    return -1;
}

function findIndentEnd(html) {
    TAG_RE.lastIndex = 0;
    let match;
    while ((match = TAG_RE.exec(html))) {
        if (!match[2] || match[1] === '/') continue;
        const tagName = match[2].toLowerCase();
        if (VOID_TAGS.has(tagName)) continue;
        const classMatch = match[3].match(INDENT_CLASS_RE);
        const className = classMatch ? classMatch[1] ?? classMatch[2] ?? classMatch[3] ?? '' : '';
        if (!/\bindent\b/.test(className)) continue;
        const close = findClosingTag(html, TAG_RE.lastIndex, tagName);
        if (close !== -1) return close;
    }
    return -1;
}

export function injectNote(html, pageTitle) {
    html = String(html ?? '');
    const note = getNote(pageTitle);
    if (!note.size) return html;

    const headings = [...html.matchAll(HEADING_RE)];
    if (!headings.length) return html;

    const insertions = [];
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const bodies = findNote(note, textOf(heading[2]));
        if (!bodies.length) continue;

        const start = heading.index + heading[0].length;
        const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
        const close = findIndentEnd(html.slice(start, end));
        const at = close === -1 ? start : start + close;
        insertions.push({ at, html: bodies.map((body) => `<p class="small">${body}</p>`).join('') });
    }

    if (!insertions.length) return html;

    insertions.sort((a, b) => a.at - b.at);
    let out = '';
    let last = 0;
    for (const insertion of insertions) {
        out += html.slice(last, insertion.at) + insertion.html;
        last = insertion.at;
    }
    return out + html.slice(last);
}
