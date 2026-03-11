// ─────────────────────────────────────────────
//  MapGen – Procedural map generation
//  Produces varied terrain for each scenario type
// ─────────────────────────────────────────────
import { T, MAP_W, MAP_H, NODE_DEF } from './config.js';

// Seeded LCG pseudo-random number generator
function makePRNG(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// Simplex-like noise using seeded RNG
function makeNoise(prng, scale, mapW, mapH) {
    // Build a random gradient grid at lower resolution
    const gs = Math.ceil(scale);
    const gw = Math.ceil(mapW / gs) + 2;
    const gh = Math.ceil(mapH / gs) + 2;
    const grid = [];
    for (let y = 0; y < gh; y++) {
        grid[y] = [];
        for (let x = 0; x < gw; x++) {
            const angle = prng() * Math.PI * 2;
            grid[y][x] = { x: Math.cos(angle), y: Math.sin(angle) };
        }
    }

    function dot(gx, gy, dx, dy) {
        const g = grid[((gy % gh) + gh) % gh][((gx % gw) + gw) % gw];
        return g.x * dx + g.y * dy;
    }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }

    return (tx, ty) => {
        const fx = tx / gs, fy = ty / gs;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const x1 = x0 + 1,       y1 = y0 + 1;
        const sx = fade(fx - x0), sy = fade(fy - y0);
        const n00 = dot(x0, y0, fx - x0, fy - y0);
        const n10 = dot(x1, y0, fx - x1, fy - y0);
        const n01 = dot(x0, y1, fx - x0, fy - y1);
        const n11 = dot(x1, y1, fx - x1, fy - y1);
        return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
    };
}

function fbm(noise, tx, ty, octaves = 4) {
    let val = 0, amp = 0.5, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
        val += noise(tx * freq, ty * freq) * amp;
        max += amp;
        amp *= 0.5; freq *= 2;
    }
    return val / max; // [-1, 1]
}

// ── Grassland map ─────────────────────────────
function generateGrassland(prng, mapW, mapH) {
    const hNoise  = makeNoise(prng, 12, mapW, mapH);
    const wNoise  = makeNoise(prng, 8,  mapW, mapH);
    const fNoise  = makeNoise(prng, 6,  mapW, mapH);

    const tiles = [];
    for (let y = 0; y < mapH; y++) {
        tiles[y] = [];
        for (let x = 0; x < mapW; x++) {
            const h  = fbm(hNoise, x, y);
            const w  = fbm(wNoise, x, y, 3);
            const f  = fbm(fNoise, x, y, 3);

            // Clear buffer zone around player (bottom-left) and enemy (top-right) spawn
            const pDist = Math.sqrt((x - 8) ** 2 + (y - (mapH - 8)) ** 2);
            const eDist = Math.sqrt((x - (mapW - 8)) ** 2 + (y - 8) ** 2);
            const clearRadius = 10;

            let tile;
            if (pDist < clearRadius || eDist < clearRadius) {
                tile = T.GRASS;
            } else if (w > 0.28) {
                tile = T.WATER;
            } else if (f > 0.22) {
                tile = T.FOREST;
            } else if (h > 0.30) {
                tile = T.DIRT;
            } else {
                tile = T.GRASS;
            }
            tiles[y][x] = tile;
        }
    }

    // Roads connecting corners through center
    drawRoad(tiles, 8, mapH - 8, mapW / 2, mapH / 2, mapW, mapH);
    drawRoad(tiles, mapW / 2, mapH / 2, mapW - 8, 8, mapW, mapH);

    return tiles;
}

// ── Desert map ────────────────────────────────
function generateDesert(prng, mapW, mapH) {
    const hNoise = makeNoise(prng, 10, mapW, mapH);
    const dNoise = makeNoise(prng, 6,  mapW, mapH);
    const tiles = [];
    for (let y = 0; y < mapH; y++) {
        tiles[y] = [];
        for (let x = 0; x < mapW; x++) {
            const h = fbm(hNoise, x, y);
            const d = fbm(dNoise, x, y, 3);
            const pDist = Math.sqrt((x - 8) ** 2 + (y - (mapH - 8)) ** 2);
            const eDist = Math.sqrt((x - (mapW - 8)) ** 2 + (y - 8) ** 2);
            let tile;
            if (pDist < 10 || eDist < 10) {
                tile = T.SAND;
            } else if (h > 0.35) {
                tile = T.MOUNTAIN;
            } else if (d > 0.30 && h < 0.05) {
                tile = T.WATER; // oasis
            } else if (h > 0.15) {
                tile = T.DIRT;
            } else {
                tile = T.SAND;
            }
            tiles[y][x] = tile;
        }
    }
    drawRoad(tiles, 8, mapH - 8, mapW - 8, 8, mapW, mapH);
    return tiles;
}

// ── Mountains map ─────────────────────────────
function generateMountains(prng, mapW, mapH) {
    const hNoise = makeNoise(prng, 8, mapW, mapH);
    const fNoise = makeNoise(prng, 5, mapW, mapH);
    const tiles = [];
    for (let y = 0; y < mapH; y++) {
        tiles[y] = [];
        for (let x = 0; x < mapW; x++) {
            const h = fbm(hNoise, x, y);
            const f = fbm(fNoise, x, y, 3);
            const pDist = Math.sqrt((x - 8) ** 2 + (y - (mapH - 8)) ** 2);
            const eDist = Math.sqrt((x - (mapW - 8)) ** 2 + (y - 8) ** 2);
            let tile;
            if (pDist < 12 || eDist < 12) {
                tile = T.GRASS;
            } else if (h > 0.20) {
                tile = T.MOUNTAIN;
            } else if (f > 0.15) {
                tile = T.FOREST;
            } else if (h < -0.10) {
                tile = T.WATER;
            } else {
                tile = T.GRASS;
            }
            tiles[y][x] = tile;
        }
    }
    // Narrow pass roads
    drawRoad(tiles, 8, mapH - 8, mapW / 2, mapH / 2, mapW, mapH);
    drawRoad(tiles, mapW / 2, mapH / 2, mapW - 8, 8, mapW, mapH);
    return tiles;
}

// Draw a thick road (3 tiles wide) between two points using Bresenham
function drawRoad(tiles, x0, y0, x1, y1, mapW, mapH) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = Math.floor(x0), cy = Math.floor(y0);
    const ex = Math.floor(x1), ey = Math.floor(y1);

    while (true) {
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const nx = cx + ox, ny = cy + oy;
                if (nx >= 0 && ny >= 0 && nx < mapW && ny < mapH) {
                    tiles[ny][nx] = T.ROAD;
                }
            }
        }
        if (cx === ex && cy === ey) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx)  { err += dx; cy += sy; }
    }
}

// ── Resource node placement ───────────────────
export function placeResourceNodes(tiles, prng, mapW, mapH) {
    const nodeTypes = ['oil', 'food', 'steel'];
    const nodes = [];
    const margin = 12;
    const attempts = 120;

    const counts = { oil: 0, food: 0, steel: 0 };
    const targets = { oil: 4, food: 5, steel: 4 };

    for (let attempt = 0; attempt < attempts; attempt++) {
        const type = nodeTypes[Math.floor(prng() * nodeTypes.length)];
        if (counts[type] >= targets[type]) continue;

        const tx = margin + Math.floor(prng() * (mapW - margin * 2));
        const ty = margin + Math.floor(prng() * (mapH - margin * 2));

        // Must be on walkable, non-forest tile
        const tile = tiles[ty]?.[tx];
        if (tile === T.WATER || tile === T.MOUNTAIN || tile === T.FOREST) continue;

        // Not too close to spawns
        const pDist = Math.sqrt((tx - 8) ** 2 + (ty - (mapH - 8)) ** 2);
        const eDist = Math.sqrt((tx - (mapW - 8)) ** 2 + (ty - 8) ** 2);
        if (pDist < 14 || eDist < 14) continue;

        // Not too close to other nodes
        const tooClose = nodes.some(n => Math.sqrt((n.tx - tx) ** 2 + (n.ty - ty) ** 2) < 8);
        if (tooClose) continue;

        nodes.push({ type, tx, ty });
        counts[type]++;
    }

    return nodes;
}

// ── Main entry ────────────────────────────────
export function generateMap(seed, mapType, mapW = MAP_W, mapH = MAP_H) {
    const prng = makePRNG(seed);

    let tiles;
    if (mapType === 'desert')    tiles = generateDesert(prng, mapW, mapH);
    else if (mapType === 'mountains') tiles = generateMountains(prng, mapW, mapH);
    else                          tiles = generateGrassland(prng, mapW, mapH);

    const nodeList = placeResourceNodes(tiles, prng, mapW, mapH);

    return { tiles, nodeList };
}

// ── Tile accessors ────────────────────────────
export function getTile(tiles, tx, ty) {
    if (ty < 0 || ty >= tiles.length || tx < 0 || tx >= tiles[0].length) return -1;
    return tiles[ty][tx];
}

export function setTile(tiles, tx, ty, type) {
    if (ty >= 0 && ty < tiles.length && tx >= 0 && tx < tiles[0].length) {
        tiles[ty][tx] = type;
    }
}
