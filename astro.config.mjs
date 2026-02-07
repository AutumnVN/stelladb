// @ts-nocheck
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync, writeFileSync, createWriteStream, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import puppeteer from 'puppeteer';

// https://astro.build/config
export default defineConfig({
    site: 'https://stelladb.pages.dev',

    build: {
        format: 'file',
    },

    adapter: cloudflare({
        imageService: 'passthrough',
    }),

    integrations: [sitemap(), generateInfodocScreenshots()],

    vite: {
        resolve: {
            alias: {
                '@': path.resolve('./src')
            }
        }
    },
});

function generateInfodocScreenshots() {
    return {
        name: 'generate-infodoc-screenshots',
        hooks: {
            'astro:build:done': async ({ dir, routes }) => {
                const distPath = fileURLToPath(dir);

                const map = ['aqua', 'ignis', 'ventus', 'terra', 'lux', 'umbra'];

                const browser = await puppeteer.launch();
                const page = await browser.newPage();

                await page.goto('https://stelladb.pages.dev/infodoc', { waitUntil: 'networkidle2' });
                await page.setViewport({ width: 6760, height: 6650 });

                await page.addStyleTag({
                    content: `
                        tr[style="height: 34px"]:has(+ tr[style="height: 20px"]),
                        tr[style="height: 20px"],
                        tr[style="height: 34px"]:has(+ tr[style="height: 44px"]),
                        tr[style="height: 44px"] {
                            display: none !important;
                        }
                    `});

                await page.screenshot({
                    fullPage: true,
                    path: path.join(distPath, 'infodoc.png'),
                });

                for (let i = 0; i < map.length; i++) {
                    for (let j = 1; j <= 5; j++) {
                        await page.screenshot({
                            clip: {
                                x: 30 + 1130 * i,
                                y: 250 + 1255 * (j - 1),
                                width: 1100,
                                height: 1320
                            },
                            path: path.join(distPath, `${map[i]}${j}.png`),
                        });
                    }
                }

                await browser.close();
            }
        }
    };
}

function downloadRemoteImage(urls) {
    return {
        name: 'download-remote-image',
        hooks: {
            'astro:build:done': async ({ dir }) => {
                const distPath = fileURLToPath(dir);
                const downloadedImages = new Map();

                const files = (function collectHtml(dirPath) {
                    const entries = readdirSync(dirPath, { withFileTypes: true });
                    let results = [];
                    for (const dirent of entries) {
                        const fullPath = path.join(dirPath, dirent.name);
                        if (dirent.isDirectory()) {
                            results = results.concat(collectHtml(fullPath));
                        } else if (dirent.isFile() && fullPath.endsWith('.html')) {
                            results.push(fullPath);
                        }
                    }
                    return results;
                })(distPath);

                for (const file of files) {
                    try {
                        let content = readFileSync(file, 'utf-8');
                        let modified = false;

                        for (const url of urls) {
                            const imgRegex = new RegExp(`(<(?:img|source)[^>]*(?:src|srcset)=")(${url}[^"]+)([^>]*>)`, 'gi');
                            const matches = [...content.matchAll(imgRegex)];

                            for (const match of matches) {
                                const [fullMatch, prefix, imgUrl, suffix] = match;

                                let localPath;
                                if (downloadedImages.has(imgUrl)) {
                                    localPath = downloadedImages.get(imgUrl);
                                } else {
                                    localPath = await downloadImage(imgUrl, distPath);
                                    if (localPath) downloadedImages.set(imgUrl, localPath);
                                }

                                if (localPath) {
                                    const relativePath = path.relative(path.dirname(file), localPath).replace(/\\/g, '/');
                                    const newTag = `${prefix}${relativePath}${suffix}`;
                                    content = content.replace(fullMatch, newTag);
                                    modified = true;
                                }
                            }

                            const srcsetRegex = new RegExp(`(srcset="[^"]*)(${url}[^\s",]+)`, 'gi');
                            const srcsetMatches = [...content.matchAll(srcsetRegex)];

                            for (const match of srcsetMatches) {
                                const [fullMatch, prefix, imgUrl] = match;

                                let localPath;
                                if (downloadedImages.has(imgUrl)) {
                                    localPath = downloadedImages.get(imgUrl);
                                } else {
                                    localPath = await downloadImage(imgUrl, distPath);
                                    if (localPath) downloadedImages.set(imgUrl, localPath);
                                }

                                if (localPath) {
                                    const relativePath = path.relative(path.dirname(file), localPath).replace(/\\/g, '/');
                                    content = content.replace(imgUrl, relativePath);
                                    modified = true;
                                }
                            }
                        }
                        if (modified) {
                            writeFileSync(file, content, 'utf-8');
                        }
                    } catch (error) {
                        console.error(`Error processing html file ${file}:`, error);
                    }
                }
            }
        }
    };
}

async function downloadImage(url, distPath) {
    try {
        const hash = Array.from(url).reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0) >>> 0;
        const headResponse = await fetch(url, { method: 'HEAD' });
        const contentType = headResponse.headers.get('content-type');
        let extension = '.png';
        if (contentType) {
            const extMatch = contentType.match(/image\/(jpeg|png|gif|webp|svg)/);
            if (extMatch) extension = '.' + (extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1]);
        }
        const localPath = path.join(distPath, `${hash}${extension}`);

        return new Promise(async resolve => {
            try {
                const response = await fetch(url);

                if (response.status >= 300 && response.status <= 399 && response.headers.get('location')) {
                    if (existsSync(localPath)) unlinkSync(localPath);

                    const redirectedUrl = new URL(response.headers.get('location'), url).href;
                    downloadImage(redirectedUrl, distPath).then(resolve);
                    return;
                }

                if (response.status === 200) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    writeFileSync(localPath, buffer);
                    resolve(localPath);
                    return;
                }

                resolve(null);
            } catch (error) {
                if (existsSync(localPath)) unlinkSync(localPath);
                console.error(`Error fetching image ${url}:`, error);
                resolve(null);
            }
        });
    } catch (error) {
        console.error(`Error downloading image ${url}:`, error);
        return null;
    }
}
