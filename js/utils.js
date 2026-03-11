// ============================================================
// IRON DOMINION - Utilities
// ============================================================

// MinHeap for A* pathfinding
class MinHeap {
  constructor(compareFn) {
    this.data = [];
    this.compare = compareFn || ((a, b) => a - b);
  }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  peek() { return this.data[0]; }
  get size() { return this.data.length; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.compare(this.data[l], this.data[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.data[r], this.data[smallest]) < 0) smallest = r;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else break;
    }
  }
}

// Math helpers
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.sqrt((bx-ax)**2 + (by-ay)**2); }
function dist2(ax, ay, bx, by) { return (bx-ax)**2 + (by-ay)**2; }
function distTiles(ax, ay, bx, by) { return Math.sqrt((bx-ax)**2 + (by-ay)**2); }
function angle(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFloat(min, max) { return Math.random() * (max - min) + min; }
function tileToWorld(tx, ty) { return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 }; }
function worldToTile(wx, wy) { return { tx: Math.floor(wx / TILE_SIZE), ty: Math.floor(wy / TILE_SIZE) }; }
function inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H; }

// ── Isometric coordinate transforms ─────────────────────────
// Tile grid (tx, ty) → isometric world position (top-left of tile bounding box)
function tileToIso(tx, ty) {
  return {
    x: (tx - ty) * (ISO_TILE_W / 2) + ISO_ORIGIN_X,
    y: (tx + ty) * (ISO_TILE_H / 2)
  };
}

// Isometric world position → floating-point tile coords
function isoToTileF(wx, wy) {
  const ax = wx - ISO_ORIGIN_X;
  return {
    tx: ax / ISO_TILE_W + wy / ISO_TILE_H,
    ty: wy / ISO_TILE_H - ax / ISO_TILE_W
  };
}

// Iso world → integer tile (floored)
function isoToTile(wx, wy) {
  const f = isoToTileF(wx, wy);
  return { tx: Math.floor(f.tx), ty: Math.floor(f.ty) };
}

// Simulation pixel position → isometric world position (center of entity's tile)
// For fractional tile coords (tx+0.5, ty+0.5), tileToIso y is already at the diamond center.
// Only the x needs a +ISO_TILE_W/2 shift (tileToIso gives the left corner, not horizontal center).
function simToIso(simX, simY) {
  const tx = simX / TILE_SIZE;
  const ty = simY / TILE_SIZE;
  const iso = tileToIso(tx, ty);
  return { x: iso.x + ISO_TILE_W / 2, y: iso.y };
}

// Isometric world → sim pixel position (exact inverse of simToIso)
function isoToSim(wx, wy) {
  // Subtract the ISO_TILE_W/2 x-centering offset that simToIso adds
  const t = isoToTileF(wx - ISO_TILE_W / 2, wy);
  return { x: t.tx * TILE_SIZE, y: t.ty * TILE_SIZE };
}

// Total isometric map dimensions in world space
function isoMapWidth()  { return (MAP_W + MAP_H) * ISO_TILE_W / 2; }
function isoMapHeight() { return (MAP_W + MAP_H) * ISO_TILE_H / 2; }

// Simple noise (Perlin-like using sine mixing)
function smoothNoise(x, y, seed) {
  const s = seed || 0;
  const nx = x + s * 1.1;
  const ny = y + s * 1.7;
  const v = Math.sin(nx * 0.3 + ny * 0.7) * 0.5 +
            Math.sin(nx * 0.7 + ny * 0.3) * 0.3 +
            Math.sin((nx + ny) * 0.5) * 0.2;
  return (v + 1) / 2; // normalize to [0,1]
}

function fractalNoise(x, y, octaves, seed) {
  let val = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 13.7) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return val / maxAmp;
}

// Color helpers
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function blendColor(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

// Draw a rounded rect
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Get all tiles in a radius (in tiles)
function tilesInRadius(cx, cy, radius) {
  const tiles = [];
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const tx = cx + dx, ty = cy + dy;
        if (inBounds(tx, ty)) tiles.push({ tx, ty });
      }
    }
  }
  return tiles;
}

// Find nearest entity from list
function nearestEntity(wx, wy, entities) {
  let best = null, bestDist = Infinity;
  for (const e of entities) {
    if (!e || e.dead) continue;
    const d = dist2(wx, wy, e.x, e.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}
