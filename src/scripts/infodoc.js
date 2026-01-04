export const style = `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=0.5, minimum-scale=0.5">
    <style>
        .column-headers-background,
        .row-headers-background {
            display: none !important;
        }

        .grid-container {
            overflow: unset !important;
            background: none !important;
        }

        :root {
            color-scheme: only dark;
        }

        body {
            margin: 0;
            background: #303030 !important;
        }

        nav {
            display: flex;
            position: sticky;
            top: 0;
            left: 0;
            align-items: center;
            z-index: 727;
            backdrop-filter: blur(5px);
            padding: 0 1rem;
            background: #30303066;
            white-space: nowrap;
            gap: 0.5rem;
            line-height: 1.3;
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

export const nav = `
    <nav>
        <a href="/" style="color: #6f9; font-weight: 700;">stelladb</a>
        <a href="https://docs.google.com/spreadsheets/d/1otsS2C1RkXLaFSvp2SMOS-vtRBaEBpZlcgR361_fdAE/edit?gid=1265175955#\w+?=1265175955" style="color: #ccf; font-weight: 700;">original infodoc</a>
        <a href="/infodoc">build</a>
        <a href="/infodoc/aqua">aqua</a>
        <a href="/infodoc/ignis">ignis</a>
        <a href="/infodoc/terra">terra</a>
        <a href="/infodoc/ventus">ventus</a>
        <a href="/infodoc/lux">lux</a>
        <a href="/infodoc/umbra">umbra</a>
    </nav>
`;

export function clientScript(url) {
    return `
    <script>
        (async () => {
            const url = '${url}';
            try {
                const res = await fetch(url);
                const html = await res.text();
                const modifiedHtml = html
                    .replace(/<meta name="viewport".+?>/, '')
                    .replace(/style="display:none;position:relative;"/, '')
                    .replace(/pointer-events:none;/g, '')
                    .replace(/<link href='\\/static.+?>/g, '')
                    .replace(/<style>@import.+?<\\/style>/, '')
                    .replace(/<script.+?<\\/script>/gs, '')
                    .replace(/target="_blank" rel="noreferrer" href="#\\w+?=\\d+?"/g, 'href="javascript:void(0);"')
                    .replace(/<div id="\\d+?".+?>/, \`${nav}$&\`)
                    .replace(/<head>/, \`$&${style}\`);
                document.documentElement.innerHTML = modifiedHtml;
            } catch (e) {
                console.error(e);
            }
        })();
    </script>`;
}
