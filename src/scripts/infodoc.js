export const style = `
    <meta name="viewport" content="width=device-width, initial-scale=0.5, minimum-scale=0.5">
    <style>
        #docs-chrome,
        #grid-bottom-bar,
        #core-js-error-dialog-overlay,
        .column-headers-background,
        .row-headers-background,
        .docs-butterbar-container {
            display: none !important;
        }
        body {
            overflow: auto;
            background: #303030 !important;
        }
        [style*='overflow:'][style*='height:'][style*='width:'] {
            overflow: visible !important;
            height: auto !important;
            width: auto !important;
        }
        #waffle-grid-container {
            display: inline-block
        }
    </style>
`;

export const nav = `
    <nav>
        <a href="/" style="color: #6f9; font-weight: 700;">stelladb</a>
        <a href="https://docs.google.com/spreadsheets/d/1otsS2C1RkXLaFSvp2SMOS-vtRBaEBpZlcgR361_fdAE/edit?gid=1265175955#gid=1265175955" style="color: #ccf; font-weight: 700;">original infodoc</a>
        <a href="/infodoc">build</a>
        <a href="/infodoc/aqua">aqua</a>
        <a href="/infodoc/ignis">ignis</a>
        <a href="/infodoc/terra">terra</a>
        <a href="/infodoc/ventus">ventus</a>
        <a href="/infodoc/lux">lux</a>
        <a href="/infodoc/umbra">umbra</a>
    </nav>
    <style>
        nav {
            display: inline-flex;
            position: sticky;
            top: 0;
            left: 0;
            align-items: center;
            z-index: 727;
            backdrop-filter: blur(5px);
            margin: 0 auto;
            padding: 0 1rem;
            background: #30303066;
            white-space: nowrap;
            gap: 0.5rem;
            line-height: 1.3;
            min-width: 100vw;
        }
        nav>a {
            padding: 0.5rem;
            font-size: 1rem;
            font-family: Arial;
            color: #bbb;
            text-decoration: none;
        }
        nav>a:hover {
            color: #eee;
        }
    </style>
`;

export function clientScript(url) {
    return `
    <script>
        (async () => {
            const url = ${JSON.stringify(url)};
            try {
                const res = await fetch(url,
                    {
                        headers: {
                            'sec-ch-ua-mobile': '?0'
                        }
                    }
                });
                const html = await res.text();
                const modifiedHtml = html
                    .replace('<div class="grid-table-container">', \`${nav}$&\`)
                    .replace(/<head>/, \`$&${style}\`);
                document.documentElement.innerHTML = modifiedHtml;
            } catch (e) {
                console.error(e);
            }
        })();
    </script>`;
}
