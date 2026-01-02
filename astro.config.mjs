// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://stelladb.pages.dev',
    integrations: [sitemap()],
    vite: {
        resolve: {
            alias: {
                '@': path.resolve('./src')
            }
        }
    }
});
