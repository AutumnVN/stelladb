import { Resvg, initWasm } from '@resvg/resvg-wasm';

import { Buffer } from 'buffer';
import { unpackPotentialData } from '@/scripts/potentialPack.js';
import wasmModule from '@/scripts/resvg.wasm?module';

export const prerender = false;

let wasmInitialized = false;

export async function initWasmOnce() {
    if (wasmInitialized) return;
    try {
        await initWasm(wasmModule);
        wasmInitialized = true;
    } catch (e) {
        console.error(e);
    }
}

const DATA_URL = 'https://raw.githubusercontent.com/AutumnVN/StellaSoraData/refs/heads/main/EN/bin/CharPotential.json';
const CHARACTER_URL = 'https://raw.githubusercontent.com/AutumnVN/StellaSoraData/refs/heads/main/character.json';
const ITEM_URL = 'https://raw.githubusercontent.com/AutumnVN/StellaSoraData/refs/heads/main/item.json';

export async function GET({ params, request }) {
    const id = Array.isArray(params.id) ? params.id.join('/') : params.id;
    const wasmPromise = initWasmOnce();

    const [charCfg, characterData, itemData] = await Promise.all([
        fetch(DATA_URL).then((r) => r.json()),
        fetch(CHARACTER_URL).then((r) => r.json()),
        fetch(ITEM_URL).then((r) => r.json()),
    ]);

    const unpack = unpackPotentialData(id, charCfg);
    if (!unpack) return new Response('Not found', { status: 404 });

    const cols = 1;
    const rows = 3;
    const total = cols * rows;
    const chars = unpack.slice(0, total);
    const cells = Array.from({ length: total }).map((_, i) => chars[i] || null);
    const imgW = 120;
    const imgH = 153;
    const padding = 0;

    const maxPots = cells.length ? Math.max(...cells.map((c) => (c && c.Potentials ? c.Potentials.length : 0))) : 0;
    const nImages = 1 + maxPots;
    const cellW = imgW * nImages + padding * (nImages - 1);
    const cellH = imgH;

    const svgW = cellW * cols;
    const svgH = cellH * rows;

    const imageUrls = new Set();
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c) continue;
        const char = characterData[c.CharId];
        if (char) imageUrls.add(`https://stelladb.pages.dev/assetbundles/icon/head/head_${c.CharId}02_XL.webp`);
        const potentials = sortPots(c.Potentials || []);
        for (const p of potentials) {
            const pot = itemData[p.Id];
            if (pot) imageUrls.add(`https://stelladb.pages.dev/potential/${p.Id}.webp`);
        }
    }

    const urlToData = {};
    if (imageUrls.size) {
        const fetched = await Promise.all([...imageUrls].map(async (url) => {
            try {
                const r = await fetch(`https://chino.is-a.dev/cdn-cgi/image/format=png/${url}`);
                if (!r.ok) return [url, null];
                const ab = await r.arrayBuffer();
                return [url, `data:image/png;base64,${Buffer.from(new Uint8Array(ab)).toString('base64')}`];
            } catch (e) {
                return [url, null];
            }
        }));
        for (const [u, d] of fetched) if (d) urlToData[u] = d;
    }

    const woff2 = await fetch(new URL('/MiSansLatin-Semibold.woff2', request.url));
    const ab = await woff2.arrayBuffer();
    const b64 = Buffer.from(new Uint8Array(ab)).toString('base64');
    const embeddedFontStyle = `@font-face{font-family:'MiSansLatin-Semibold'; src: url(data:font/woff2;base64,${b64}) format('woff2');}`;
    const fontBuffers = [new Uint8Array(ab)];


    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`;
    if (embeddedFontStyle) svg += `<defs><style type="text/css"><![CDATA[${embeddedFontStyle}]]></style></defs>`;
    svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#eee"/>`;

    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x0 = col * cellW;
        const y0 = row * cellH;
        if (!c) continue;

        const char = characterData[c.CharId];
        const charUrl = char ? `https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/export/assets/assetbundles/icon/head/head_${c.CharId}02_XL.webp` : null;
        const charImg = charUrl ? (urlToData[charUrl] || charUrl) : null;

        const scale = 1.1;
        const scaledW = Math.round(imgW * scale);
        const scaledH = Math.round(imgH * scale);
        const charX = x0 - (scaledW - imgW) / 2;
        const charY = y0 - (scaledH - imgH) / 2;

        if (charImg) svg += `<image href="${charImg}" x="${charX}" y="${charY}" width="${scaledW}" height="${scaledH}" preserveAspectRatio="xMidYMid slice" style="pointer-events:none;"/>`;

        svg += `<rect x="${x0}" y="${y0}" width="${imgW}" height="${imgH}" fill="transparent" />`;

        const potentials = sortPots(c.Potentials || []);
        for (let k = 0; k < potentials.length; k++) {
            const p = potentials[k];
            const pot = itemData[p.Id];
            const potUrl = pot ? `https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/potential/${p.Id}.webp` : null;
            const potImg = potUrl ? (urlToData[potUrl] || potUrl) : null;
            const px = x0 + (imgW + padding) * (k + 1);
            const py = y0;
            if (!potImg) continue;

            svg += `<image href="${potImg}" x="${px}" y="${py}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice"/>`;

            if (!(k < 2 && p.Level === 1)) {
                const ff = embeddedFontStyle ? "'MiSansLatin-Semibold', sans-serif" : 'sans-serif';
                svg += `<text x="${px + 15}" y="${py + 16}" style="pointer-events:none; fill:#568; font-size:16px; font-family:${ff};">${p.Level}</text>`;
            }
        }
    }

    svg += `</svg>`;

    await wasmPromise;

    const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, background: '#eee', font: { fontBuffers } });
    const image = resvg.render();
    const png = image.asPng();
    return new Response(png, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=604800'
        }
    });
}

function sortPots(pots) {
    if (!pots || !pots.length) return [];
    const arr = Array.from(pots);
    if (arr.length >= 2 && Number(arr[0].Level) === 1 && Number(arr[1].Level) === 1) {
        const preserved = arr.slice(0, 2);
        const rest = arr.slice(2);
        rest.sort((a, b) => (Number(b.Level) || 0) - (Number(a.Level) || 0));
        return preserved.concat(rest);
    }
    arr.sort((a, b) => (Number(b.Level) || 0) - (Number(a.Level) || 0));
    return arr;
}
