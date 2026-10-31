const DEFAULT_BASE = 'https://raw.githubusercontent.com/AutumnVN/ssleaderboard/refs/heads/main';

export const LEADERBOARD_BASE = (process.env.SSLEADERBOARD_URL || DEFAULT_BASE).replace(/\/$/, '');
export const META_URL = `${LEADERBOARD_BASE}/meta.json`;
export const PLAYER_INDEX_URL = `${LEADERBOARD_BASE}/player.json`;
export const PLAYER_HEAD_URL = 'https://raw.githubusercontent.com/AutumnVN/ss-data/refs/heads/main/EN/bin/PlayerHead.json';
export const CHARACTER_ID_URL = 'https://raw.githubusercontent.com/AutumnVN/ss-data/refs/heads/main/characterid.json';

export function playerDataUrl(id) {
    return `${LEADERBOARD_BASE}/player/${encodeURIComponent(id)}.json`;
}

export function isBBSeason(season) {
    return /^bb/.test(String(season));
}

export function seasonName(season) {
    const number = String(season).match(/\d+/)?.[0] || '';
    return isBBSeason(season) ? `Boss Blitz S${number}` : `Finale Echoing S${number}`;
}

export function playerIconUrl(icon, playerHeadData, { cdn = true } = {}) {
    const iconPath = playerHeadData?.[icon]?.Icon;
    if (!iconPath) return '';

    const [, folder, file] = iconPath.split('/');
    const rawUrl = `https://raw.githubusercontent.com/AutumnVN/ssassets/refs/heads/main/export/assets/assetbundles/icon/${folder.toLowerCase()}/${file}.webp`;
    return cdn ? `https://chino.is-a.dev/cdn-cgi/image/format=avif/${rawUrl}` : rawUrl;
}


