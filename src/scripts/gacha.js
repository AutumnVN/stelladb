// @ts-nocheck
const STORAGE_KEY = 'stelladb:gacha';
const REGION_ORDER = ['en', 'jp', 'kr', 'tw', 'cn'];
const REGION_LABELS = { en: 'EN', jp: 'JP', kr: 'KR', tw: 'TW', cn: 'CN' };
const RARITY_ORDER = ['SSR', 'SR', 'R'];
const RARITY_COLORS = { SSR: 'var(--pink)', SR: 'var(--yellow)', R: 'var(--blue)' };
const RARITY_LABELS = { SSR: '5★', SR: '4★', R: '3★' };
const PITY_CATEGORIES = [
    { storageId: 1, storageKey: 'CharacterUpCardPool', label: 'Limited Character', threshold: 160, rateUp: true },
    { storageId: 3, storageKey: 'DiscUpCardPool', label: 'Limited Disc', threshold: 120, rateUp: true },
    { storageId: 2, storageKey: 'CharacterCardPool', label: 'Standard Character', threshold: 160, rateUp: false },
    { storageId: 4, storageKey: 'DiscCardPool', label: 'Standard Disc', threshold: 120, rateUp: false },
    { storageId: 6, storageKey: 'CharacterCardRewardPool', label: 'Anniversary', threshold: 160, rateUp: false },
];
const CDN_IMAGE = 'https://chino.is-a.dev/cdn-cgi/image/format=avif/';
const ASSETS = `${CDN_IMAGE}https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/export/assets/assetbundles`;
const BANNER_ASSETS = `${CDN_IMAGE}https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/export/assets/assetbundles_en`;
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
let page = null;
let els = null;
let state = { accounts: {}, active: null };
let filters = { mode: 'history', query: '' };
let bannerMap = new Map();
let pityItems = new WeakSet();
let demoMode = false;
let toastTimer = 0;
let copyStatusTimer = 0;
let dragDepth = 0;

const root = document.querySelector('.gacha-page');
if (root) init(root);

function init(element) {
    page = element;
    els = {
        file: page.querySelector('#gacha-file'),
        import: page.querySelector('#gacha-import'),
        export: page.querySelector('#gacha-export'),
        clear: page.querySelector('#gacha-clear'),
        drop: page.querySelector('#gacha-drop'),
        command: page.querySelector('#gacha-command'),
        copy: page.querySelector('#gacha-copy'),
        copyStatus: page.querySelector('#gacha-copy-status'),
        accounts: page.querySelector('#gacha-accounts'),
        view: page.querySelector('#gacha-view'),
        account: page.querySelector('#gacha-account'),
        summary: page.querySelector('#gacha-summary'),
        rarity: page.querySelector('#gacha-rarity'),
        storages: page.querySelector('#gacha-storages'),
        filters: page.querySelector('#gacha-filters'),
        search: page.querySelector('#gacha-search'),
        banners: page.querySelector('#gacha-banners'),
        sectionTitle: page.querySelector('#gacha-section-title'),
        count: page.querySelector('#gacha-banner-count'),
        toast: page.querySelector('#gacha-toast'),
    };
    const demoUrl = String(page.dataset.demoUrl || '').trim();
    demoMode = Boolean(demoUrl);
    state = demoMode ? { accounts: {}, active: null } : loadStored();
    bind();
    if (demoMode) {
        page.classList.add('demo');
        els.import.hidden = true;
        els.clear.hidden = true;
        loadDemo(demoUrl);
    } else {
        render();
    }
}

function bind() {
    els.import.addEventListener('click', () => els.file.click());
    els.file.addEventListener('change', () => {
        importFiles(els.file.files);
        els.file.value = '';
    });
    els.export.addEventListener('click', exportActive);
    els.clear.addEventListener('click', clearActive);
    els.copy.addEventListener('click', copyCommand);
    els.drop.addEventListener('click', () => els.file.click());
    els.drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            els.file.click();
        }
    });
    els.accounts.addEventListener('click', (event) => {
        const button = event.target.closest('[data-uid]');
        if (!button || !state.accounts[button.dataset.uid]) return;
        state.active = button.dataset.uid;
        filters = { mode: 'history', query: '' };
        els.search.value = '';
        saveStored();
        render();
    });
    els.filters.addEventListener('click', (event) => {
        const button = event.target.closest('[data-mode]');
        if (!button) return;
        filters.mode = button.dataset.mode;
        renderBanners(activeData());
    });
    els.search.addEventListener('input', () => {
        filters.query = els.search.value;
        renderBanners(activeData());
    });
    document.addEventListener('dragenter', (event) => {
        if (demoMode || !hasFileDrag(event)) return;
        event.preventDefault();
        dragDepth += 1;
        page.classList.add('dragging');
    });
    document.addEventListener('dragover', (event) => {
        if (demoMode || !hasFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) page.classList.remove('dragging');
    });
    document.addEventListener('drop', (event) => {
        if (demoMode || !hasFileDrag(event)) return;
        event.preventDefault();
        dragDepth = 0;
        page.classList.remove('dragging');
        importFiles(event.dataTransfer.files);
    });
}

function hasFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function render() {
    const data = activeData();
    const hasData = Boolean(data);
    els.view.hidden = !hasData;
    els.drop.hidden = hasData;
    els.export.disabled = !hasData;
    els.clear.disabled = !hasData;
    renderAccounts();
    if (!hasData) {
        [els.account, els.summary, els.rarity, els.storages, els.filters, els.banners]
            .forEach((element) => { element.innerHTML = ''; });
        els.count.textContent = '';
        return;
    }
    renderAccount(data);
    renderSummary(data);
    renderRarity(data);
    renderStorages(data);
    renderBanners(data);
}

function renderAccounts() {
    els.accounts.innerHTML = accountList().map((data) => {
        const uid = normalizeUid(data.uid);
        if (!uid) return '';
        const region = normalizeRegion(data.region);
        const active = uid === state.active;
        const gameUid = normalizeUid(data.gameUid);
        const gameName = normalizeUid(data.gameName);
        const title = [gameName, `UID ${gameUid || uid}`]
            .filter(Boolean)
            .join(' · ');
        return `<button type="button" class="account-tab${active ? ' active' : ''}" data-uid="${escAttr(uid)}" aria-pressed="${active}" title="${escAttr(title)}">
            <span>${esc(gameName || gameUid || uid)}</span>
            <small>${REGION_LABELS[region] || '??'} · ${formatNumber(totalPulls(data))} pulls</small>
        </button>`;
    }).join('');
}

function renderAccount(data) {
    const region = normalizeRegion(data.region);
    const updated = formatTime(parseDate(data.updatedAt));
    const errors = Array.isArray(data.errors) ? data.errors.length : 0;
    const gameUid = normalizeUid(data.gameUid);
    const gameName = normalizeUid(data.gameName);
    const uid = gameUid || normalizeUid(data.uid);
    const uidText = uid ? `UID ${esc(uid)}` : 'UID unknown';
    const nameHtml = gameName ? `<strong>${esc(gameName)}</strong> ` : '';
    els.account.innerHTML = `<div class="account-identity">
        <span class="region-pill">${REGION_LABELS[region] || '??'}</span>
        ${nameHtml}<span class="muted">(${uidText}) • Updated ${esc(updated)}</span>
    </div>
    ${errors ? `<div class="account-notes"><span class="warning">${formatNumber(errors)} fetch ${errors === 1 ? 'error' : 'errors'}</span></div>` : ''}`;
}

function renderSummary(data) {
    const totals = summarize(data);
    const cards = [
        ['Pulls', totals.pulls, 'recruits', 'pulls'],
        [rarityLabel('SSR'), totals.ssr, `${percent(totals.ssr, totals.pulls)} of pulls`, 'ssr'],
        [`Rate-up ${rarityLabel('SSR')}`, totals.rateUpSSR, `${percent(totals.rateUpSSR, totals.pulls)} of pulls`, 'rateup'],
        ['Banners', totals.bannersWithHistory, `of ${formatNumber(totals.banners)} total`],
        ['Spark', totals.sparks, totals.sparks === 1 ? 'spark reached' : 'sparks reached', 'spark'],
        ['Pity', totals.pityHits, totals.pityHits === 1 ? 'pity hit' : 'pity hits', 'pity'],
    ];
    els.summary.innerHTML = cards.map(([label, value, hint, tone]) => `<div class="stat-card${tone ? ` tone-${tone}` : ''}">
        <span class="stat-label">${esc(label)}</span>
        <strong class="stat-value">${formatNumber(value)}</strong>
        <span class="stat-hint">${esc(hint)}</span>
    </div>`).join('');
}

function renderRarity(data) {
    const totals = summarize(data);
    const entries = [...RARITY_ORDER, ...Object.keys(totals.byRarity).filter((key) => !RARITY_ORDER.includes(key))]
        .filter((key) => number(totals.byRarity[key]) > 0)
        .map((key) => [key, number(totals.byRarity[key])]);
    if (!entries.length) {
        els.rarity.innerHTML = '<p class="empty">No rarity data.</p>';
        return;
    }
    const max = Math.max(1, ...entries.map(([, value]) => value));
    els.rarity.innerHTML = entries.map(([rarity, value]) => {
        const color = RARITY_COLORS[rarity] || 'var(--muted)';
        return chartRow(rarityLabel(rarity), value, max, color, percent(value, totals.items));
    }).join('');
}

function renderStorages(data) {
    const storages = storageList(data).filter((storage) => storagePulls(storage) > 0);
    if (!storages.length) {
        els.storages.innerHTML = '<p class="empty">No banner type data.</p>';
        return;
    }
    const max = Math.max(1, ...storages.map((storage) => storagePulls(storage)));
    els.storages.innerHTML = storages.map((storage) => {
        const name = storage.name || storage.key || `Pool ${storage.id}`;
        const pulls = storagePulls(storage);
        const ssr = number(storage.byRarity?.SSR);
        return `<div class="storage-row" title="${escAttr(`${formatNumber(pulls)} pulls · ${formatNumber(ssr)} ${rarityLabel('SSR')}`)}">
            <div class="storage-label"><span>${esc(name)}</span></div>
            <div class="chart-track"><span class="chart-fill" style="width:${(pulls / max) * 100}%;background:var(--green)"></span></div>
            <div class="storage-value">${pulls ? `<b>${formatNumber(pulls)}</b>` : ''}</div>
        </div>`;
    }).join('');
}

function renderBanners(data) {
    if (!data) return;
    const banners = Array.isArray(data.banners) ? data.banners : [];
    const pityHits = pityHitInfo(data);
    const pitiedBanners = pityHits.bannerIds;
    const pitied = pitiedBanners.size;
    pityItems = pityHits.items;
    const counts = {
        history: banners.filter((banner) => banner.history?.length).length,
        ongoing: banners.filter((banner) => ['active', 'standard'].includes(bannerStatus(banner).key)).length,
        pity: pitied,
        sparked: banners.filter((banner) => hasSpark(banner) && banner.spark.sparked).length,
        all: banners.length,
    };
    const modes = [
        ['history', 'Pulled', counts.history],
        ['ongoing', 'Ongoing', counts.ongoing],
        ['sparked', 'Spark', counts.sparked],
        ['pity', 'Pity', counts.pity],
        ['all', 'All', counts.all],
    ];
    if (!modes.some(([key]) => key === filters.mode)) filters.mode = 'history';
    els.filters.innerHTML = modes.map(([key, label, count]) => `<button type="button" class="filter-tab${key === filters.mode ? ' active' : ''}" data-mode="${key}" aria-pressed="${key === filters.mode}">
        ${label}<span>${formatNumber(count)}</span>
    </button>`).join('');
    const query = filters.query.trim().toLowerCase();
    const suffix = query ? ` matching “${filters.query.trim()}”` : '';
    els.sectionTitle.textContent = filters.mode === 'pity' ? 'Pity' : 'Banners';
    bannerMap = new Map(banners.map((banner) => [String(banner.id), banner]));
    const filtered = banners
        .filter((banner) => bannerMatches(banner, filters.mode, query, pitiedBanners))
        .sort(sortBanners);
    els.count.textContent = `${formatNumber(filtered.length)} of ${formatNumber(banners.length)} banners${suffix}`;
    if (!filtered.length) {
        els.banners.innerHTML = '<div class="no-results">No banners match this view.</div>';
        return;
    }
    els.banners.innerHTML = filtered.map((banner) => renderBannerCard(banner, pitiedBanners)).join('');
    els.banners.querySelectorAll('details.banner-card').forEach((details) => {
        details.addEventListener('toggle', () => {
            if (details.open) loadBannerBody(details);
        });
    });
}

function renderBannerCard(banner, pitiedBanners = new Set()) {
    const status = bannerStatus(banner);
    const stats = banner.stats || {};
    const pulls = number(stats.items) || number(stats.pulls);
    const pitied = pitiedBanners.has(String(banner.id));
    const rateUp = bannerRateUpSSR(banner);
    const ssr = number(stats.byRarity?.SSR);
    const start = parseDate(banner.startTime);
    const end = parseDate(banner.endTime);
    const range = start || end ? `${start ? formatDate(start) : '?'} → ${end ? formatDate(end) : '?'}` : 'Always available';
    const lastPull = number(stats.lastPullTime);
    const last = lastPull ? `Last pull ${formatTime(new Date(lastPull * 1000))}` : 'No pulls yet';
    const rateUps = [
        ...(Array.isArray(banner.rateUp5Star) ? banner.rateUp5Star : []).map((item) => ({ ...item, star: 5 })),
        ...(Array.isArray(banner.rateUp4Star) ? banner.rateUp4Star : []).map((item) => ({ ...item, star: 4 })),
    ];
    const rateUpHtml = rateUps.slice(0, 4).map((item) => {
        const url = rateUpImage(item, banner.type);
        return `<span class="rate-up star${item.star}${banner.type === 'character' ? ' character' : ''}" title="${escAttr(`${item.name || 'Unknown'} · ${item.star}★`)}">
            ${url ? `<span class="rate-up-image"><img src="${escAttr(url)}" alt="" loading="lazy" onerror="this.remove()" /></span>` : ''}
        </span>`;
    }).join('') + (rateUps.length > 4 ? `<span class="rate-up-more">+${rateUps.length - 4}</span>` : '');
    const iconUrl = bannerIconUrl(banner);
    const icon = iconUrl
        ? `<img src="${escAttr(iconUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
        : `<span>${esc(String(banner.name || '?').slice(0, 1))}</span>`;
    const spark = banner.spark || {};
    const sparkThreshold = number(spark.threshold, 120);
    const sparkReached = hasSpark(banner) && pulls >= sparkThreshold;
    let sparkHtml = '';
    if (hasSpark(banner)) {
        const current = number(spark.countedPulls);
        const threshold = sparkThreshold;
        const shown = spark.sparked ? threshold : Math.min(current, threshold);
        const width = threshold ? Math.min(100, (shown / threshold) * 100) : 0;
        const bannerPulls = spark.bannerPulls ?? spark.lifetimePulls;
        const title = bannerPulls == null
            ? 'Spark counts every pull on this banner'
            : `Banner pulls: ${formatNumber(number(bannerPulls))}`;
        sparkHtml = `<div class="spark-label" title="${escAttr(title)}"><span>Spark</span><span>${formatNumber(shown)} / ${formatNumber(threshold)}</span></div>
            <div class="spark-track"><span class="spark-fill${spark.sparked ? ' ready' : ''}" style="width:${width}%"></span></div>`;
    }
    const pityHtml = renderPityBar(banner, status.key);
    const chips = [
        `<span class="status ${status.key}">${status.label}</span>`,
        banner.storageName ? `<span class="chip">${esc(banner.storageName)}</span>` : '',
        hasSpark(banner) && spark.sparked ? '<span class="chip spark">Sparked</span>' : '',
        pitied ? '<span class="chip pitied">Pitied</span>' : '',
    ].filter(Boolean).join('');
    const pullClasses = [sparkReached ? 'spark-reached' : '', pitied ? 'pitied' : ''].filter(Boolean).join(' ');
    return `<details class="banner-card" data-banner="${escAttr(banner.id)}">
        <summary>
            <div class="banner-icon">${icon}</div>
            <div class="banner-main">
                <div class="banner-chips">${chips}</div>
                <h3>${esc(banner.name || `Banner ${banner.id}`)}</h3>
                <div class="banner-meta"><span>${esc(range)}</span><span>• ${esc(last)}</span></div>
                ${rateUpHtml ? `<div class="rate-ups">${rateUpHtml}</div>` : ''}
            </div>
            <div class="banner-numbers">
                <div class="${pullClasses}"><b>${formatNumber(pulls)}</b><span>pulls</span></div>
                <div class="${ssr ? 'has-ssr' : ''}"><b>${formatNumber(ssr)}</b><span>${rarityLabel('SSR')}</span></div>
                <div class="${rateUp ? 'has-rateup' : ''}"><b>${formatNumber(rateUp)}</b><span>rate-up ${rarityLabel('SSR')}</span></div>
                <span class="chevron">⌄</span>
            </div>
            ${sparkHtml || pityHtml ? `<div class="banner-bars">
                ${sparkHtml ? `<div class="banner-spark">${sparkHtml}</div>` : ''}
                ${pityHtml}
            </div>` : ''}
        </summary>
        <div class="banner-body"></div>
    </details>`;
}

function loadBannerBody(details) {
    const body = details.querySelector('.banner-body');
    const banner = bannerMap.get(details.dataset.banner);
    if (!body || !banner || body.dataset.loaded === '1') return;
    body.innerHTML = renderBannerBody(banner);
    body.dataset.loaded = '1';
}

function renderBannerBody(banner) {
    const history = (Array.isArray(banner.history) ? banner.history.slice() : []).sort((a, b) => number(b.time) - number(a.time));
    const groups = groupHistory(history);
    const spark = banner.spark || {};
    const threshold = number(spark.threshold, 120);
    let sparkAfter = -1;
    if (hasSpark(banner) && spark.sparked) {
        let seen = 0;
        for (let index = groups.length - 1; index >= 0; index -= 1) {
            seen += groupPullCount(groups[index]);
            if (seen >= threshold) {
                sparkAfter = index;
                break;
            }
        }
        if (sparkAfter < 0 && groups.length) sparkAfter = groups.length - 1;
    }
    const records = groups.map((group, index) =>
        `${renderHistoryGroup(group)}${index === sparkAfter ? renderSparkClaim(banner, threshold) : ''}`).join('');
    return `<div class="history-head"><h4>Pull history</h4></div>
        ${history.length ? `<div class="history-list">${records}</div>` : '<p class="empty">No pulls recorded on this banner.</p>'}`;
}

function groupHistory(history) {
    const groups = [];
    let singles = [];
    const flushSingles = () => {
        if (!singles.length) return;
        const oldestFirst = singles.slice().reverse();
        const chunks = [];
        for (let index = 0; index < oldestFirst.length; index += 5) {
            chunks.push(oldestFirst.slice(index, index + 5));
        }
        for (let index = chunks.length - 1; index >= 0; index -= 1) {
            groups.push({ records: chunks[index].reverse() });
        }
        singles = [];
    };
    for (const record of history) {
        const count = recordItems(record).length || 1;
        if (count === 1) {
            singles.push(record);
        } else {
            flushSingles();
            groups.push({ records: [record] });
        }
    }
    flushSingles();
    return groups;
}

function groupPullCount(group) {
    return group.records.reduce((sum, record) => sum + (recordItems(record).length || 1), 0);
}

function renderSparkClaim(banner, threshold) {
    const characters = (Array.isArray(banner?.rateUp5Star) ? banner.rateUp5Star : [])
        .filter((item) => item && item.id != null)
        .map((item) => {
            const url = rateUpImage(item, banner.type);
            const name = item.name || 'Rate-up 5★';
            return `<span class="spark-character" title="${escAttr(`${name} · ${rarityLabel('SSR')}`)}">
                ${url ? `<img src="${escAttr(url)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
                <span>${esc(name)}</span>
                <small class="star5">${rarityLabel('SSR')} rate-up</small>
            </span>`;
        }).join('');
    return `<div class="pull-record spark-claim">
        <div class="pull-meta"><span>Spark</span><span>${formatNumber(threshold)} / ${formatNumber(threshold)}</span></div>
        ${characters ? `<div class="spark-claim-body"><span class="spark-characters">${characters}</span></div>` : ''}
    </div>`;
}

function renderHistoryGroup(group) {
    const records = group.records;
    if (records.length === 1) return renderRecord(records[0]);
    const items = records.flatMap(recordItems);
    const newest = recordDate(records[0]);
    const oldest = recordDate(records[records.length - 1]);
    const newestText = formatTime(newest);
    const oldestText = formatTime(oldest);
    const timeText = newestText === oldestText ? newestText : `${oldestText} – ${newestText}`;
    return `<div class="pull-record grouped">
        <div class="pull-meta"><time datetime="${escAttr(newest ? newest.toISOString() : '')}">${esc(timeText)}</time><span>${formatNumber(records.length)} single pulls</span></div>
        <div class="pull-items grid">${items.map(renderPullItem).join('')}</div>
    </div>`;
}

function pityCategories(data = activeData()) {
    const banners = Array.isArray(data?.banners) ? data.banners : [];
    return PITY_CATEGORIES.map((category) => {
        const source = banners.find((banner) => banner.pity && bannerMatchesPityCategory(banner, category)) || null;
        const field = category.rateUp ? 'aupMissTimes' : 'amissTimes';
        return {
            ...category,
            current: source ? number(source.pity[field]) : 0,
            guarantee: category.rateUp ? 'rate-up 5★' : 'any 5★',
        };
    });
}

function pityHitInfo(data = activeData(), categories = PITY_CATEGORIES) {
    const banners = Array.isArray(data?.banners) ? data.banners : [];
    const items = data?.items && typeof data.items === 'object' ? data.items : {};
    const bannerIds = new Set();
    const itemSet = new WeakSet();
    let hits = 0;
    for (const category of categories) {
        const entries = [];
        for (const banner of banners) {
            if (!bannerMatchesPityCategory(banner, category)) continue;
            for (const record of Array.isArray(banner.history) ? banner.history : []) {
                entries.push({ time: number(record.time), banner, record });
            }
        }
        entries.sort((a, b) => a.time - b.time);
        let counter = 0;
        for (const entry of entries) {
            for (const item of recordItemsFor(entry.record, items)) {
                const qualifies = category.rateUp
                    ? number(item?.rateUp) >= 5
                    : String(item?.rarity || '').toUpperCase() === 'SSR';
                if (qualifies) {
                    if (counter >= category.threshold - 1) {
                        hits += 1;
                        bannerIds.add(String(entry.banner.id));
                        if (item && typeof item === 'object') itemSet.add(item);
                    }
                    counter = 0;
                } else {
                    counter += 1;
                }
            }
        }
    }
    return { bannerIds, items: itemSet, hits };
}

function bannerMatchesPityCategory(banner, category) {
    return (category.storageKey && banner?.storageKey === category.storageKey) ||
        (category.storageId != null && number(banner?.storageId) === category.storageId);
}

function pityInfo(banner) {
    const category = pityCategories().find((entry) => bannerMatchesPityCategory(banner, entry));
    return category || null;
}

function renderPityBar(banner, statusKey = bannerStatus(banner).key) {
    if (!['active', 'standard'].includes(statusKey)) return '';
    const info = pityInfo(banner);
    if (!info) return '';
    const shown = Math.max(0, Math.min(info.current, info.threshold));
    const width = info.threshold ? (shown / info.threshold) * 100 : 0;
    const title = `${info.label} pity · Guarantees ${info.guarantee}`;
    return `<div class="banner-pity">
        <div class="pity-label" title="${escAttr(title)}"><span>Pity</span><span>${formatNumber(shown)} / ${formatNumber(info.threshold)}</span></div>
        <div class="pity-track"><span class="pity-fill" style="width:${width}%"></span></div>
    </div>`;
}

function renderRecord(record) {
    const items = recordItems(record);
    const time = recordDate(record);
    const count = items.length || number(record.count, 1);
    return `<div class="pull-record">
        <div class="pull-meta"><time datetime="${escAttr(time ? time.toISOString() : '')}">${esc(formatTime(time))}</time><span>${formatNumber(count)} ${count === 1 ? 'pull' : 'pulls'}</span></div>
        <div class="pull-items${count > 1 ? ' grid' : ''}">${items.map(renderPullItem).join('')}</div>
    </div>`;
}

function recordItems(record) {
    return recordItemsFor(record, activeData()?.items);
}

function recordItemsFor(record, items) {
    return Array.isArray(record?.items) && record.items.length
        ? record.items
        : (Array.isArray(record?.ids) ? record.ids : []).map((id) => items?.[id] || { id, name: `#${id}` });
}

function renderPullItem(item) {
    const rarity = String(item.rarity || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const rate = number(item.rateUp);
    const pitied = pityItems.has(item);
    const url = itemImage(item);
    const name = item.name || (item.id != null ? `#${item.id}` : 'Unknown');
    const rarityName = item.rarity ? rarityLabel(item.rarity) : '';
    return `<span class="pull-item ${rarity}" title="${escAttr(`${name}${item.rarity ? ` · ${rarityName}` : ''}${pitied ? ' · pitied' : ''}`)}">
        ${url ? `<img${item.type === 'Char' ? ' class="character"' : ''} src="${escAttr(url)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
        <span class="pull-text">
            <span>${esc(name)}</span>
            ${rate ? `<small${rate >= 5 ? ' class="star5"' : ''}>${rate}★ rate-up${pitied ? ' <span class="pitied">pitied</span>' : ''}</small>` : pitied ? '<small class="pitied">pitied</small>' : ''}
        </span>
    </span>`;
}

function chartRow(label, value, max, color, suffix) {
    return `<div class="chart-row">
        <span class="chart-label">${esc(label)}</span>
        <div class="chart-track"><span class="chart-fill" style="width:${(value / max) * 100}%;background:${color}"></span></div>
        <span class="chart-value"><b>${formatNumber(value)}</b><small>${esc(suffix)}</small></span>
    </div>`;
}

function rarityLabel(rarity) {
    return RARITY_LABELS[rarity] || rarity;
}

function summarize(data) {
    const totals = data.totals || {};
    const banners = Array.isArray(data.banners) ? data.banners : [];
    const byRarity = { ...(totals.byRarity || {}) };
    if (!Object.keys(byRarity).length) {
        for (const banner of banners) {
            for (const [rarity, count] of Object.entries(banner.stats?.byRarity || {})) {
                byRarity[rarity] = number(byRarity[rarity]) + number(count);
            }
        }
    }
    const sumStat = (field) => banners.reduce((sum, banner) => sum + number(banner.stats?.[field]), 0);
    const items = number(totals.items) || sumStat('items') || number(totals.pulls) || sumStat('pulls');
    const rateUpSSR = number(totals.rateUpSSR)
        || sumStat('rateUpSSR')
        || banners.reduce((sum, banner) => sum + bannerRateUpSSR(banner), 0);
    const pity = pityCategories(data);
    return {
        pulls: items,
        items,
        rateUpSSR,
        ssr: number(byRarity.SSR),
        byRarity,
        banners: number(totals.banners, banners.length),
        bannersWithHistory: number(totals.bannersWithHistory, banners.filter((banner) => banner.history?.length).length),
        activeBanners: number(totals.activeBanners, banners.filter((banner) => ['active', 'standard'].includes(bannerStatus(banner).key)).length),
        pityTypes: pity.length,
        pityHits: pityHitInfo(data).hits,
        sparks: banners.filter((banner) => hasSpark(banner) && banner.spark.sparked).length,
    };
}

function bannerRateUpSSR(banner) {
    if (banner?.stats?.rateUpSSR != null) return number(banner.stats.rateUpSSR);
    let total = 0;
    for (const record of Array.isArray(banner?.history) ? banner.history : []) {
        for (const item of Array.isArray(record.items) ? record.items : []) {
            if (number(item?.rateUp) >= 5) total += 1;
        }
    }
    return total;
}

function totalPulls(data) {
    return number(data?.totals?.items) || number(data?.totals?.pulls);
}

function storagePulls(storage) {
    return number(storage?.items) || number(storage?.pulls);
}

function storageList(data) {
    const raw = data.storages;
    const list = Array.isArray(raw?.value) ? raw.value : Array.isArray(raw) ? raw : [];
    if (list.length) return list.slice().sort((a, b) => number(a.id) - number(b.id));
    const groups = new Map();
    for (const banner of Array.isArray(data.banners) ? data.banners : []) {
        const key = String(banner.storageId ?? banner.storageKey ?? '0');
        let group = groups.get(key);
        if (!group) {
            group = { id: banner.storageId, name: banner.storageName, key: banner.storageKey, type: banner.type, pulls: 0, items: 0, byRarity: {} };
            groups.set(key, group);
        }
        const stats = banner.stats || {};
        group.pulls += number(stats.pulls);
        group.items += number(stats.items);
        for (const [rarity, count] of Object.entries(stats.byRarity || {})) {
            group.byRarity[rarity] = number(group.byRarity[rarity]) + number(count);
        }
    }
    return [...groups.values()].sort((a, b) => number(a.id) - number(b.id));
}

function bannerMatches(banner, mode, query, pitiedBanners = null) {
    const status = bannerStatus(banner).key;
    if (mode === 'history' && !banner.history?.length) return false;
    if (mode === 'ongoing' && status !== 'active' && status !== 'standard') return false;
    if (mode === 'pity' && !pitiedBanners?.has(String(banner.id))) return false;
    if (mode === 'sparked' && !(hasSpark(banner) && banner.spark.sparked)) return false;
    if (!query) return true;
    const names = [
        banner.name,
        banner.storageName,
        banner.storageKey,
        ...(Array.isArray(banner.rateUp5Star) ? banner.rateUp5Star : []).map((item) => item.name),
        ...(Array.isArray(banner.rateUp4Star) ? banner.rateUp4Star : []).map((item) => item.name),
    ];
    return names.filter(Boolean).join(' ').toLowerCase().includes(query);
}

function sortBanners(a, b) {
    if (filters.mode === 'history') {
        return number(b.stats?.lastPullTime) - number(a.stats?.lastPullTime) || number(b.id) - number(a.id);
    }
    const rank = { active: 0, standard: 1, upcoming: 2, ended: 3 };
    return (rank[bannerStatus(a).key] ?? 4) - (rank[bannerStatus(b).key] ?? 4)
        || String(b.startTime || '').localeCompare(String(a.startTime || ''))
        || number(a.id) - number(b.id);
}

function bannerStatus(banner) {
    const start = parseDate(banner?.startTime);
    const end = parseDate(banner?.endTime);
    const now = Date.now();
    if (!start && !end) return { key: 'standard', label: 'Standard' };
    if (start && now < start.getTime()) return { key: 'upcoming', label: 'Upcoming' };
    if (end && now > end.getTime()) return { key: 'ended', label: 'Ended' };
    return { key: 'active', label: 'Ongoing' };
}

function hasSpark(banner) {
    return banner?.type === 'character' &&
        Boolean(banner?.rateUp5Star?.length) &&
        Boolean(banner?.spark?.sparkable ?? banner?.spark?.limited);
}

function itemImage(item) {
    if (!item || item.id == null) return '';
    if (item.type === 'Disc') {
        const id = String(item.id).replace(/^.{2}/, '');
        return `${ASSETS}/icon/outfit/outfit_${encodeURIComponent(id)}.webp`;
    }
    if (item.type === 'Char') {
        return `${ASSETS}/icon/head/head_${encodeURIComponent(item.id)}01_XL.webp`;
    }
    return '';
}

function rateUpImage(item, type) {
    if (!item || item.id == null) return '';
    if (type === 'disc') {
        const id = String(item.id).replace(/^.{2}/, '');
        return `${ASSETS}/icon/outfit/outfit_${encodeURIComponent(id)}.webp`;
    }
    return `${ASSETS}/icon/head/head_${encodeURIComponent(item.id)}01_XL.webp`;
}

function bannerIconUrl(banner) {
    const icon = String(banner?.icon || '').trim();
    return icon ? `${BANNER_ASSETS}/icon/gacha/${encodeURIComponent(icon)}.webp` : '';
}

async function loadDemo(url) {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const data = parseGacha(await response.text(), 'gacha.en.json');
        const uid = normalizeUid(data.uid);
        state.accounts = { [uid]: data };
        state.active = uid;
        filters = { mode: 'history', query: '' };
        els.search.value = '';
        render();
    } catch (error) {
        toast(`Could not load demo: ${error.message}`, 'error');
    }
}

async function importFiles(fileList) {
    if (demoMode) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const imported = [];
    const failed = [];
    for (const file of files) {
        try {
            const data = parseGacha(await file.text(), file.name);
            const uid = normalizeUid(data.uid);
            const existing = state.accounts[uid];
            state.accounts[uid] = existing ? mergeGachaAccounts(existing, data) : data;
            imported.push(uid);
        } catch (error) {
            failed.push(`${file.name}: ${error.message}`);
        }
    }
    if (imported.length) {
        const unique = [...new Set(imported)];
        state.active = unique[0];
        filters = { mode: 'history', query: '' };
        els.search.value = '';
        const saved = saveStored();
        render();
        if (failed.length) {
            toast(`Imported ${unique.length} account${unique.length === 1 ? '' : 's'}; ${failed.length} failed.`, 'error');
        } else if (saved) {
            const labels = unique.map((uid) => accountLabel(state.accounts[uid]));
            toast(`Imported ${labels.join(', ')}.`);
        }
    } else if (failed.length) {
        toast(failed[0], 'error');
    }
}

function mergeGachaAccounts(existing, incoming) {
    if (!existing) return incoming;
    if (String(existing.uid) !== String(incoming.uid)) return incoming;

    const existingTime = parseDate(existing.updatedAt)?.getTime() || 0;
    const incomingTime = parseDate(incoming.updatedAt)?.getTime() || 0;
    const primary = incomingTime >= existingTime ? incoming : existing;
    const secondary = primary === incoming ? existing : incoming;
    const items = { ...(secondary.items || {}), ...(primary.items || {}) };

    const bannerMap = new Map();
    for (const banner of Array.isArray(secondary.banners) ? secondary.banners : []) {
        if (!banner || banner.id == null) continue;
        bannerMap.set(String(banner.id), { ...banner });
    }
    for (const banner of Array.isArray(primary.banners) ? primary.banners : []) {
        if (!banner || banner.id == null) continue;
        const key = String(banner.id);
        const previous = bannerMap.get(key);
        const merged = previous ? { ...previous, ...banner } : { ...banner };
        if (!merged.rateUp5Star?.length && previous?.rateUp5Star?.length) merged.rateUp5Star = previous.rateUp5Star;
        if (!merged.rateUp4Star?.length && previous?.rateUp4Star?.length) merged.rateUp4Star = previous.rateUp4Star;
        merged.history = mergeHistoryRecords(previous?.history, banner.history, items);
        merged.pity = banner.pity ?? previous?.pity ?? null;
        bannerMap.set(key, merged);
    }

    const banners = [...bannerMap.values()].map((banner) => {
        banner.history = mergeHistoryRecords([], banner.history, items);
        rebuildBannerStats(banner, items);
        banner.spark = rebuildBannerSpark(banner, banner.stats, banner.spark);
        return banner;
    });
    banners.sort((a, b) => number(a.storageId) - number(b.storageId) || number(a.id) - number(b.id));

    return {
        ...primary,
        uid: incoming.uid,
        gameUid: primary.gameUid || secondary.gameUid || null,
        gameName: primary.gameName || secondary.gameName || null,
        region: primary.region || secondary.region,
        updatedAt: primary.updatedAt || secondary.updatedAt || new Date().toISOString(),
        totals: rebuildGachaTotals(banners),
        storages: rebuildGachaStorages(banners, secondary, primary),
        banners,
        items,
        history: rebuildFlatHistory(banners, items),
        errors: Array.isArray(primary.errors)
            ? primary.errors
            : (Array.isArray(secondary.errors) ? secondary.errors : []),
    };
}

function mergeHistoryRecords(existingRecords, incomingRecords, items) {
    const records = new Map();
    for (const record of [...(incomingRecords || []), ...(existingRecords || [])]) {
        const normalized = normalizeHistoryRecord(record, items);
        if (!normalized) continue;
        const key = historyRecordKey(normalized);
        if (!records.has(key)) records.set(key, normalized);
    }
    return [...records.values()].sort((a, b) => historyRecordTime(b) - historyRecordTime(a));
}

function normalizeHistoryRecord(record, items) {
    if (!record || typeof record !== 'object') return null;
    const normalizedItems = recordItemsFor(record, items)
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const id = item.id ?? item.Id;
            const base = id != null ? (items?.[String(id)] || {}) : {};
            return { ...base, ...item, ...(id != null ? { id } : {}) };
        });
    const ids = normalizedItems
        .map((item) => number(item.id, NaN))
        .filter((id) => Number.isFinite(id));
    if (!ids.length && Array.isArray(record.ids)) {
        ids.push(...record.ids.map(Number).filter((id) => Number.isFinite(id)));
    }
    const time = historyRecordTime(record);
    return {
        ...record,
        time: time || record.time,
        timeISO: record.timeISO || (time ? new Date(time * 1000).toISOString() : undefined),
        ids,
        items: normalizedItems,
    };
}

function historyRecordTime(record) {
    const direct = number(record?.time);
    if (direct > 0) return direct;
    const date = parseDate(record?.timeISO);
    return date ? date.getTime() / 1000 : 0;
}

function historyRecordKey(record) {
    return `${historyRecordTime(record)}|${record.ids.join(',')}`;
}

function rebuildBannerStats(banner, items) {
    const stats = {
        pulls: 0,
        items: 0,
        rateUpItems: 0,
        rateUpSSR: 0,
        byRarity: {},
        byType: {},
        firstPullTime: null,
        lastPullTime: null,
    };
    const history = Array.isArray(banner.history) ? banner.history : [];
    for (const record of history) {
        const recordItems = recordItemsFor(record, items);
        stats.pulls += recordItems.length || number(record.count, 1);
        for (const item of recordItems) addItemToStats(stats, item);
    }
    const times = history
        .map((record) => historyRecordTime(record))
        .filter((time) => time > 0);
    if (times.length) {
        stats.firstPullTime = Math.min(...times);
        stats.lastPullTime = Math.max(...times);
    }
    stats.byRarity = sortCounts(stats.byRarity);
    stats.byType = sortCounts(stats.byType);
    banner.stats = stats;
}

function rebuildBannerSpark(banner, stats, previous) {
    const sparkable = banner.type === 'character' && Boolean(banner.rateUp5Star?.length);
    const threshold = number(previous?.threshold, 120) || 120;
    const bannerPulls = banner.pity && banner.pity.gachaTotalTimes != null
        ? number(banner.pity.gachaTotalTimes)
        : null;
    const countedPulls = sparkable ? Math.max(stats.items, bannerPulls || 0) : stats.items;
    return {
        ...previous,
        sparkable,
        threshold,
        countedPulls,
        historyItems: stats.items,
        bannerPulls,
        sparked: sparkable && countedPulls >= threshold,
    };
}

function rebuildGachaTotals(banners) {
    const totals = {
        pulls: 0,
        items: 0,
        rateUpItems: 0,
        rateUpSSR: 0,
        byRarity: {},
        byType: {},
        banners: banners.length,
        activeBanners: 0,
        bannersWithHistory: 0,
        sparks: 0,
        sparkedBannerIds: [],
    };
    for (const banner of banners) {
        addStatsToTarget(totals, banner.stats);
        if (banner.active ?? ['active', 'standard'].includes(bannerStatus(banner).key)) totals.activeBanners += 1;
        if (banner.history?.length) totals.bannersWithHistory += 1;
        if (hasSpark(banner) && banner.spark?.sparked) {
            totals.sparks += 1;
            totals.sparkedBannerIds.push(banner.id);
        }
    }
    totals.byRarity = sortCounts(totals.byRarity);
    totals.byType = sortCounts(totals.byType);
    return totals;
}

function rebuildGachaStorages(banners, secondary, primary) {
    const storages = new Map();
    const addStorage = (storage) => {
        if (!storage || storage.id == null) return;
        const key = String(storage.id);
        const previous = storages.get(key) || {
            id: storage.id,
            bannerIds: [],
            pulls: 0,
            items: 0,
            rateUpItems: 0,
            rateUpSSR: 0,
            byRarity: {},
            byType: {},
        };
        storages.set(key, {
            ...previous,
            ...storage,
            bannerIds: [],
            pulls: 0,
            items: 0,
            rateUpItems: 0,
            rateUpSSR: 0,
            byRarity: {},
            byType: {},
        });
    };
    for (const storage of storageEntries(secondary)) addStorage(storage);
    for (const storage of storageEntries(primary)) addStorage(storage);

    for (const banner of banners) {
        if (banner.storageId == null) continue;
        const key = String(banner.storageId);
        let storage = storages.get(key);
        if (!storage) {
            storage = {
                id: banner.storageId,
                name: banner.storageName,
                key: banner.storageKey,
                type: banner.type,
                bannerIds: [],
                pulls: 0,
                items: 0,
                rateUpItems: 0,
                rateUpSSR: 0,
                byRarity: {},
                byType: {},
            };
            storages.set(key, storage);
        }
        storage.bannerIds.push(banner.id);
        addStatsToTarget(storage, banner.stats);
    }

    const result = [...storages.values()].map((storage) => ({
        ...storage,
        bannerIds: [...new Set(storage.bannerIds)].sort((a, b) => number(a) - number(b)),
        byRarity: sortCounts(storage.byRarity),
        byType: sortCounts(storage.byType),
    }));
    result.sort((a, b) => number(a.id) - number(b.id));
    return result;
}

function rebuildFlatHistory(banners, items) {
    const history = [];
    for (const banner of banners) {
        for (const record of Array.isArray(banner.history) ? banner.history : []) {
            const recordItems = recordItemsFor(record, items);
            const time = historyRecordTime(record);
            history.push({
                bannerId: banner.id,
                bannerName: banner.name,
                storageId: banner.storageId,
                time,
                timeISO: record.timeISO || (time ? new Date(time * 1000).toISOString() : undefined),
                count: recordItems.length || number(record.count, 1),
                ids: recordItems.map((item) => number(item.id)).filter((id) => Number.isFinite(id)),
            });
        }
    }
    history.sort((a, b) => b.time - a.time || number(a.bannerId) - number(b.bannerId));
    return history;
}

function storageEntries(data) {
    const raw = data?.storages;
    if (Array.isArray(raw?.value)) return raw.value;
    return Array.isArray(raw) ? raw : [];
}

function addItemToStats(target, item) {
    target.items += 1;
    if (item?.rarity) target.byRarity[item.rarity] = (target.byRarity[item.rarity] || 0) + 1;
    if (item?.type) target.byType[item.type] = (target.byType[item.type] || 0) + 1;
    if (number(item?.rateUp) > 0) target.rateUpItems += 1;
    if (number(item?.rateUp) >= 5) target.rateUpSSR += 1;
}

function addStatsToTarget(target, stats) {
    target.pulls += number(stats?.pulls);
    target.items += number(stats?.items);
    target.rateUpItems += number(stats?.rateUpItems);
    target.rateUpSSR += number(stats?.rateUpSSR);
    for (const [rarity, count] of Object.entries(stats?.byRarity || {})) {
        target.byRarity[rarity] = (target.byRarity[rarity] || 0) + number(count);
    }
    for (const [type, count] of Object.entries(stats?.byType || {})) {
        target.byType[type] = (target.byType[type] || 0) + number(count);
    }
}

function sortCounts(counts) {
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function parseGacha(text, filename) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('Invalid JSON');
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.banners) || !data.totals) {
        throw new Error('Not a gacha history file');
    }
    const uid = normalizeUid(data.uid);
    if (!uid) throw new Error('Missing UID');
    const region = normalizeRegion(data.region) || regionFromFilename(filename);
    if (!region) throw new Error('Unknown region');
    const gameUid = normalizeUid(data.gameUid ?? data.game_uid);
    const gameName = normalizeUid(data.gameName ?? data.game_name);
    return {
        ...data,
        uid,
        region,
        ...(gameUid ? { gameUid } : {}),
        ...(gameName ? { gameName } : {}),
    };
}

function regionFromFilename(filename) {
    const match = String(filename || '').toLowerCase().match(/^gacha(?:[._-][^.]+)?[._-](en|jp|kr|tw|cn)(?:[._-].*)?\.json$/);
    return match ? match[1] : null;
}

function exportActive() {
    const data = activeData();
    if (!data) return;
    const gameUid = normalizeUid(data.gameUid);
    if (!gameUid) {
        toast('Missing game UID; cannot export.', 'error');
        return;
    }
    const region = normalizeRegion(data.region);
    if (!region) {
        toast('Missing region; cannot export.', 'error');
        return;
    }
    const filename = `gacha.${gameUid}.${region}.json`;
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${filename}.`);
}

function clearActive() {
    if (demoMode) return;
    const data = activeData();
    if (!data) return;
    const uid = normalizeUid(data.uid) || state.active;
    const label = accountLabel(data);
    if (!window.confirm(`Remove gacha data for ${label}?`)) return;
    delete state.accounts[uid];
    const next = accountList()[0];
    state.active = next ? normalizeUid(next.uid) : null;
    filters = { mode: 'history', query: '' };
    els.search.value = '';
    saveStored();
    render();
    toast(`Cleared ${label}.`);
}

async function copyCommand() {
    const command = els.command?.textContent.trim();
    if (!command) return;
    let copied = false;
    try {
        await navigator.clipboard.writeText(command);
        copied = true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
    }
    if (!copied) {
        toast('Could not copy command.', 'error');
        return;
    }
    els.copyStatus.textContent = 'Command copied';
    clearTimeout(copyStatusTimer);
    copyStatusTimer = setTimeout(() => { els.copyStatus.textContent = ''; }, 2500);
}

function loadStored() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        const stored = parsed?.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {};
        const accounts = {};
        for (const [key, data] of Object.entries(stored)) {
            if (!isGachaData(data)) continue;
            const uid = normalizeUid(data.uid) || normalizeUid(key);
            if (!uid) continue;
            const gameUid = normalizeUid(data.gameUid ?? data.game_uid);
            const gameName = normalizeUid(data.gameName ?? data.game_name);
            accounts[uid] = {
                ...data,
                uid,
                ...(gameUid ? { gameUid } : {}),
                ...(gameName ? { gameName } : {}),
            };
        }
        const active = normalizeUid(parsed?.active);
        return { accounts, active: active && accounts[active] ? active : firstAccountUid(accounts) };
    } catch {
        return { accounts: {}, active: null };
    }
}

function saveStored() {
    if (demoMode) return true;
    try {
        if (!Object.keys(state.accounts).length) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, accounts: state.accounts, active: state.active }));
        }
        return true;
    } catch (error) {
        toast(`Could not save locally: ${error.message}`, 'error');
        return false;
    }
}

function isGachaData(data) {
    return Boolean(data && typeof data === 'object' && Array.isArray(data.banners) && data.totals && typeof data.totals === 'object');
}

function activeData() {
    return state.active ? state.accounts[state.active] || null : null;
}

function accountList() {
    return sortAccounts(Object.values(state.accounts));
}

function firstAccountUid(accounts) {
    const list = sortAccounts(Object.values(accounts));
    return list.length ? normalizeUid(list[0].uid) : null;
}

function sortAccounts(accounts) {
    return accounts.slice().sort((a, b) => {
        const ra = REGION_ORDER.indexOf(normalizeRegion(a?.region));
        const rb = REGION_ORDER.indexOf(normalizeRegion(b?.region));
        return (ra < 0 ? REGION_ORDER.length : ra) - (rb < 0 ? REGION_ORDER.length : rb)
            || String(a?.uid ?? '').localeCompare(String(b?.uid ?? ''), undefined, { numeric: true });
    });
}

function accountLabel(data) {
    const uid = normalizeUid(data?.uid);
    const gameUid = normalizeUid(data?.gameUid);
    const gameName = normalizeUid(data?.gameName);
    const region = normalizeRegion(data?.region);
    const id = gameUid || uid;
    const label = gameName
        ? `${gameName}${id ? ` (UID ${id})` : ''}`
        : (id ? `UID ${id}` : 'unknown');
    return `${REGION_LABELS[region] || '??'} ${label}`;
}

function normalizeUid(value) {
    const uid = String(value ?? '').trim();
    return uid || null;
}

function normalizeRegion(value) {
    const key = String(value ?? '').trim().toLowerCase();
    return REGION_LABELS[key] ? key : null;
}

function recordDate(record) {
    const seconds = Number(record?.time);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000);
    return parseDate(record?.timeISO);
}

function parseDate(value) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(date) {
    return date ? DATE_FMT.format(date) : 'Unknown';
}

function formatTime(date) {
    return date ? TIME_FMT.format(date) : 'Unknown';
}

function formatNumber(value) {
    return number(value).toLocaleString('en-US');
}

function number(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function percent(part, total) {
    return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0%';
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escAttr(value) {
    return esc(value);
}

function toast(message, tone = 'info') {
    if (!els?.toast) return;
    els.toast.textContent = message;
    els.toast.dataset.tone = tone;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5000);
}
