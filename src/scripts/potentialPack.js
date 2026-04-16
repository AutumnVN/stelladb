import { Buffer } from 'node:buffer';

export function packPotentialData(tbCharPotential, charCfgMap = {}) {
    if (!Array.isArray(tbCharPotential) || tbCharPotential.length !== 3) {
        throw new Error('tbCharPotential must be an array of 3 characters');
    }

    const bitBuffer = [];
    const addBit = b => bitBuffer.push(b ? 1 : 0);
    const writeBits = (value, numBits) => {
        for (let i = numBits - 1; i >= 0; i--) {
            addBit((value >>> i) & 1);
        }
    };
    const toUint32 = num => {
        num = Math.floor(num || 0);
        if (num < 0) num = 0;
        if (num > 0xFFFFFFFF) num = 0xFFFFFFFF;
        return num >>> 0;
    };

    const getLevelFromPotentials = (tbPotential, nId) => {
        if (!Array.isArray(tbPotential)) return 0;
        for (const p of tbPotential) {
            if ((p.nId ?? p.Id ?? p.id) === nId) {
                return (p.nLevel ?? p.Level ?? p.level ?? 0) | 0;
            }
        }
        return 0;
    };

    const pack_potential = (tbAll, tbPotential, bSpecial) => {
        for (const nId of tbAll) {
            const nLevel = getLevelFromPotentials(tbPotential, nId);
            if (bSpecial) {
                const flag = nLevel > 0 ? 1 : 0;
                writeBits(flag, 1);
            } else {
                writeBits(nLevel, 3);
            }
        }
    };

    for (const v of tbCharPotential) {
        const nCharId = v.nCharId ?? v.CharId ?? v.charId;
        if (!nCharId || nCharId === 0) return null;
        writeBits(toUint32(nCharId), 32);
    }

    tbCharPotential.forEach((v, idx) => {
        const nCharId = v.nCharId ?? v.CharId ?? v.charId;
        const potentials = v.tbPotential ?? v.Potentials ?? v.potentials ?? [];
        const cfg = charCfgMap[nCharId];
        if (!cfg) return;
        if (idx === 0) {
            pack_potential(cfg.MasterSpecificPotentialIds || [], potentials, true);
            pack_potential(cfg.MasterNormalPotentialIds || [], potentials, false);
            pack_potential(cfg.CommonPotentialIds || [], potentials, false);
        } else {
            pack_potential(cfg.AssistSpecificPotentialIds || [], potentials, true);
            pack_potential(cfg.AssistNormalPotentialIds || [], potentials, false);
            pack_potential(cfg.CommonPotentialIds || [], potentials, false);
        }
    });

    const bytes = [];
    for (let i = 0; i < bitBuffer.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | (bitBuffer[i + j] || 0);
        }
        bytes.push(byte & 0xFF);
    }

    return Buffer.from(bytes).toString('base64');
}

export function unpackPotentialData(b64Str, charCfgMap = {}, options = {}) {
    if (!b64Str || typeof b64Str !== 'string') return null;

    b64Str = b64Str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    b64Str = b64Str.replace(/[^A-Za-z0-9+/=]/g, '');
    if (b64Str.length % 4 !== 0) {
        b64Str += '='.repeat(4 - (b64Str.length % 4));
    }
    if (b64Str.length % 4 !== 0) {
        console.error('Base64 length error');
        return null;
    }

    let packed;
    try {
        packed = Buffer.from(b64Str, 'base64');
    } catch (e) {
        console.error('Base64 decode failed:', e && e.message);
        return null;
    }

    const bitBuffer = [];
    for (let i = 0; i < packed.length; i++) {
        const byte = packed[i];
        for (let j = 7; j >= 0; j--) {
            bitBuffer.push((byte >> j) & 1);
        }
    }

    let bitIndex = 0;
    const readBits = numBits => {
        let value = 0;
        for (let i = numBits - 1; i >= 0; i--) {
            if (bitIndex >= bitBuffer.length) break;
            value += (bitBuffer[bitIndex++] || 0) << i;
        }
        return value >>> 0;
    };

    const tbCharPotential = [];
    for (let i = 0; i < 3; i++) {
        const nCharId = readBits(32);
        if (options.validateChar && typeof options.validateChar === 'function') {
            if (!options.validateChar(nCharId)) {
                console.error('Character validation failed for id', nCharId);
                return null;
            }
        }
        tbCharPotential.push({ CharId: nCharId, Potentials: [] });
    }

    const maxLevel = options.maxLevel ?? 7;

    const unpack_potential = (tbPotential, tbAll, bSpecial) => {
        for (const nId of tbAll) {
            if (bSpecial) {
                const flag = readBits(1);
                if (flag === 1) tbPotential.push({ Id: nId, Level: 1 });
            } else {
                const nLevel = readBits(3);
                if (nLevel > maxLevel) {
                    console.error('Potential level out of range', nLevel);
                    return false;
                }
                if (nLevel > 0) tbPotential.push({ Id: nId, Level: nLevel });
            }
        }
        return true;
    };

    for (let k = 0; k < tbCharPotential.length; k++) {
        const entry = tbCharPotential[k];
        const cfg = charCfgMap[entry.CharId];
        if (!cfg) continue;
        let ok = true;
        if (k === 0) {
            ok = ok && unpack_potential(entry.Potentials, cfg.MasterSpecificPotentialIds || [], true);
            ok = ok && unpack_potential(entry.Potentials, cfg.MasterNormalPotentialIds || [], false);
        } else {
            ok = ok && unpack_potential(entry.Potentials, cfg.AssistSpecificPotentialIds || [], true);
            ok = ok && unpack_potential(entry.Potentials, cfg.AssistNormalPotentialIds || [], false);
        }
        ok = ok && unpack_potential(entry.Potentials, cfg.CommonPotentialIds || [], false);
        if (!ok) return null;
    }

    return tbCharPotential;
}

