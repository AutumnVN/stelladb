export const style = `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=0.5, minimum-scale=0.5">
    <style>
        .column-header-wrapper,
        .row-header-wrapper {
            display: none !important;
        }

        .grid-container {
            overflow: unset !important;
            background: none !important;
        }

        .waffle {
            table-layout: fixed !important;
            width: 0 !important;
        }

        :root {
            color-scheme: only dark !important;
        }

        body {
            margin: 0;
            background: #303030 !important;
        }

        nav {
            display: flex !important;
            position: sticky !important;
            top: 0 !important;
            left: 0 !important;
            align-items: center !important;
            z-index: 727 !important;
            backdrop-filter: blur(5px) !important;
            padding: 0 1rem !important;
            background: #30303066 !important;
            white-space: nowrap !important;
            gap: 0.5rem !important;
            line-height: 1.3 !important;
        }

        nav a {
            padding: 0.5rem !important;
            font-size: 1rem !important;
            font-family: Arial !important;
            color: #bbb !important;
            text-decoration: none !important;
        }

        nav a:hover {
            color: #eee !important;
        }

        nav details {
            position: relative !important;
        }

        nav summary {
            cursor: pointer !important;
            padding: 0.5rem !important;
            color: #bbb !important;
            list-style: none !important;
            font-family: Arial !important;
            font-size: 1rem !important;
        }

        nav summary::marker,
        nav summary::-webkit-details-marker {
            display: none !important;
        }

        nav summary:hover,
        nav summary:focus-visible {
            color: #eee !important;
        }

        nav details[open] summary {
            color: #eee !important;
        }

        nav details[open] div {
            display: flex !important;
            position: absolute !important;
            right: 0 !important;
            flex-direction: column !important;
            box-shadow: 0 12px 28px #0008 !important;
            border-radius: 6px !important;
            background: #444 !important;
            padding: 0.25rem 0 !important;
            width: max-content !important;
        }

        nav details[open] a {
            padding: 0.5rem 0.75rem !important;
        }
    </style>
`;

export const nav = `
    <nav>
        <a href="/" style="color: #6f9 !important; font-weight: 700;">stelladb</a>
        <a href="https://docs.google.com/spreadsheets/d/1otsS2C1RkXLaFSvp2SMOS-vtRBaEBpZlcgR361_fdAE/edit?gid=1265175955#gid?=1265175955" style="color: #ccf !important; font-weight: 700;">infodoc</a>
        <a href="/infodoc">Build</a>
        <a href="/infodoc/aqua">Aqua</a>
        <a href="/infodoc/ignis">Ignis</a>
        <a href="/infodoc/terra">Terra</a>
        <a href="/infodoc/ventus">Ventus</a>
        <a href="/infodoc/lux">Lux</a>
        <a href="/infodoc/umbra">Umbra</a>
        <details>
            <summary>Other</summary>
            <div>
                <a href="/infodoc/welcome">Welcome</a>
                <a href="/infodoc/infodump">Info Dump</a>
                <a href="/infodoc/pullincome">Pull Income</a>
            </div>
        </details>
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
