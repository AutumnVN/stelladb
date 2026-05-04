import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';

import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path from 'path';
import serviceWorker from 'astrojs-service-worker';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://stelladb.pages.dev',
    build: {
        format: 'file',
    },
    adapter: cloudflare({
        imageService: 'passthrough',
    }),
    integrations: [
        downloadRemoteImage([
            'https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/export/assets/'
        ]),
        sitemap(),
        serviceWorker({
            workbox: {
                globIgnores: [
                    '**/_routes.json',
                    '**/_worker.js/**/*',
                ]
            }
        }),
    ],
    vite: {
        resolve: {
            alias: {
                '@': path.resolve('./src')
            }
        },
        ssr: {
            external: ['buffer']
        }
    },
});

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
                                    localPath = await downloadImage(imgUrl, distPath, url);
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
                                    localPath = await downloadImage(imgUrl, distPath, url);
                                    if (localPath) downloadedImages.set(imgUrl, localPath);
                                }

                                if (localPath) {
                                    const relativePath = path.relative(path.dirname(file), localPath).replace(/\\/g, '/');
                                    content = content.replace(imgUrl, relativePath);
                                    modified = true;
                                }
                            }

                            const styleUrlRegex = new RegExp(`(url\\(\\s*['"]?)(${url}[^'"\\)\\s]+)(['"]?\\s*\\))`, 'gi');
                            const styleUrlMatches = [...content.matchAll(styleUrlRegex)];

                            for (const match of styleUrlMatches) {
                                const [fullMatch, prefix, imgUrl, suffix] = match;

                                let localPath;
                                if (downloadedImages.has(imgUrl)) {
                                    localPath = downloadedImages.get(imgUrl);
                                } else {
                                    localPath = await downloadImage(imgUrl, distPath, url);
                                    if (localPath) downloadedImages.set(imgUrl, localPath);
                                }

                                if (localPath) {
                                    const relativePath = path.relative(path.dirname(file), localPath).replace(/\\/g, '/');
                                    const newTag = `${prefix}${relativePath}${suffix}`;
                                    content = content.replace(fullMatch, newTag);
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

async function downloadImage(url, distPath, basePrefix) {
    try {
        let contentType = null;
        try {
            const headResponse = await fetch(url, { method: 'HEAD' });
            contentType = headResponse.headers.get('content-type');
        } catch (e) {
            contentType = null;
        }

        let extension = '';
        if (contentType) {
            const extMatch = contentType.match(/image\/(jpeg|png|gif|webp|avif|svg)/);
            if (extMatch) extension = '.' + (extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1]);
        }

        const parsedUrl = new URL(url);
        let relativePath = '';
        relativePath = url.slice(basePrefix.length);
        relativePath = relativePath.split('?')[0].split('#')[0];

        const extFromPath = path.extname(relativePath);
        if (!extFromPath) {
            if (extension) relativePath = relativePath + extension;
            else relativePath = relativePath + '.png';
        }

        const safeSegments = relativePath.split('/').map(seg => seg.replace(/[^a-zA-Z0-9._-]/g, '_'));
        const safeRelativePath = safeSegments.join('/');
        const localPath = path.join(distPath, safeRelativePath);

        const localDir = path.dirname(localPath);
        if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });

        return new Promise(async resolve => {
            try {
                const response = await fetch(url);

                if (response.status >= 300 && response.status <= 399 && response.headers.get('location')) {
                    if (existsSync(localPath)) unlinkSync(localPath);

                    const redirectedUrl = new URL(response.headers.get('location'), url).href;
                    downloadImage(redirectedUrl, distPath, basePrefix).then(resolve);
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
