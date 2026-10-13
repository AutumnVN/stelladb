const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/AutumnVN/ss-data/refs/heads/main/';
const FIELDS = ['normalAtk', 'skill', 'supportSkill', 'ultimate'];

function expiry() {
    const now = new Date();
    const d = new Date();
    d.setUTCHours(4, 0, 0, 0);
    let days = (2 - now.getUTCDay() + 7) % 7;
    if (days === 0 && now > d) days = 7;
    d.setUTCDate(d.getUTCDate() + days);
    return d.getTime();
}

function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function baseName(t) {
    const i = t.indexOf(' - ');
    return (i === -1 ? t : t.slice(0, i)).trim();
}

function findId(index, name) {
    const key = String(name || '').toLowerCase();
    if (!key) return null;
    if (index.byName.has(key)) return index.byName.get(key);
    const norm = normalize(key);
    if (index.byNorm.has(norm)) return index.byNorm.get(norm);
    return null;
}

function findCharId(index, name) {
    return findId(index, name) || findId(index, baseName(name));
}

function tabTitle(document, position) {
    let title = null;
    for (let i = 0; i < position.line; i++) {
        const m = /^#[ \t]+(.+)/.exec(document.lineAt(i).text.trim());
        if (m) title = m[1].trim();
    }
    return title;
}

function prepare(chars, discNames) {
    const byId = {};
    const potAll = [];
    const skillsAll = [];
    const seenPot = new Set();
    const seenSkill = new Set();
    for (const [id, ch] of Object.entries(chars)) {
        const pot = [];
        const skills = [];
        const groups = ch && ch.potential;
        if (groups && typeof groups === 'object') {
            for (const arr of Object.values(groups)) {
                if (Array.isArray(arr)) for (const p of arr) if (p && p.name) pot.push(p.name);
            }
        }
        for (const f of FIELDS) {
            const s = ch && ch[f];
            if (s && s.name) skills.push(s.name);
        }
        byId[id] = { name: (ch && ch.name) || id, pot, skills };
        for (const n of pot) {
            if (!seenPot.has(n)) {
                seenPot.add(n);
                potAll.push(n);
            }
        }
        for (const n of skills) {
            if (!seenSkill.has(n)) {
                seenSkill.add(n);
                skillsAll.push(n);
            }
        }
    }
    const discs = [];
    const seenD = new Set();
    for (const n of discNames) {
        if (n && !seenD.has(n)) {
            seenD.add(n);
            discs.push(n);
        }
    }
    return { chars: byId, potAll, skillsAll, disc: discs };
}

function withIndex(data) {
    data.charIndex = { byName: new Map(), byNorm: new Map() };
    for (const [id, c] of Object.entries(data.chars)) {
        const l = String(c.name).toLowerCase();
        if (!data.charIndex.byName.has(l)) data.charIndex.byName.set(l, id);
        const norm = normalize(c.name);
        if (!data.charIndex.byNorm.has(norm)) data.charIndex.byNorm.set(norm, id);
    }
    return data;
}

function activate(context) {
    let cache = null;
    let reported = false;
    const dir = context.globalStoragePath;
    const dataFile = path.join(dir, 'data.json');
    const metaFile = path.join(dir, 'meta.json');

    async function fetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
    }

    async function collect() {
        const [chars, disc] = await Promise.all([
            fetchJson(BASE + 'character.json'),
            fetchJson(BASE + 'disc.json'),
        ]);
        const discNames = (Array.isArray(disc) ? disc : Object.values(disc)).map((d) => d && d.name);
        return { data: withIndex(prepare(chars, discNames)), chars, disc: discNames };
    }

    async function ensure() {
        if (cache) return cache;
        let exp = 0;
        if (fs.existsSync(dataFile) && fs.existsSync(metaFile)) {
            try {
                const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                cache = withIndex(prepare(raw.chars ?? {}, raw.disc ?? []));
                exp = JSON.parse(fs.readFileSync(metaFile, 'utf8')).exp;
            } catch {
                cache = null;
            }
        }
        if (cache && Date.now() < exp) return cache;
        try {
            const fresh = await collect();
            cache = fresh.data;
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(dataFile, JSON.stringify({ chars: fresh.chars, disc: fresh.disc }));
            fs.writeFileSync(metaFile, JSON.stringify({ exp: expiry() }));
        } catch (e) {
            console.warn('[stelladb] refresh failed:', e.message);
        }
        return cache;
    }

    function namesFor(macro, data, charId) {
        if (macro === 'disc') return data.disc;
        const c = data.chars[charId];
        if (macro === 'pot') return c && c.pot.length ? c.pot : data.potAll;
        return c && c.skills.length ? c.skills : data.skillsAll;
    }

    function itemsFor(macro, names, range) {
        return names.map((n) => {
            const item = new vscode.CompletionItem(n, vscode.CompletionItemKind.Value);
            item.range = range;
            return item;
        });
    }

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('markdown', {
            async provideCompletionItems(document, position) {
                const line = document.lineAt(position).text.slice(0, position.character);
                const data = await ensure();
                if (!data) return [];
                const charId = findCharId(data.charIndex, tabTitle(document, position));
                const m = /(pot|disc|skill)\[([^,\]]*)$/.exec(line);
                if (m) {
                    const names = namesFor(m[1], data, charId);
                    const range = new vscode.Range(position.translate(0, -m[2].length), position);
                    return itemsFor(m[1], names, range);
                }
                const word = /[^\s,.:;!?"'()[\]#|~*_`\\<>]+$/.exec(line);
                if (!word) return [];
                const range = new vscode.Range(position.line, word.index, position.line, position.character);
                const items = [];
                for (const type of ['pot', 'skill', 'disc']) {
                    for (const n of namesFor(type, data, charId)) {
                        const item = new vscode.CompletionItem(n, vscode.CompletionItemKind.Value);
                        item.range = range;
                        item.detail = type;
                        items.push(item);
                    }
                }
                return items;
            },
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('stelladb.refresh', async () => {
            try {
                fs.rmSync(dataFile);
                fs.rmSync(metaFile);
            } catch {}
            cache = null;
            await ensure();
            vscode.window.showInformationMessage('stelladb names refreshed');
        })
    );

    ensure().then((d) => {
        if (d && !reported) {
            reported = true;
            vscode.window.setStatusBarMessage(`stelladb completions ready (${d.potAll.length} pot, ${d.skillsAll.length} skill, ${d.disc.length} disc)`, 8000);
        }
    });
}

function deactivate() {}

module.exports = { activate, deactivate };