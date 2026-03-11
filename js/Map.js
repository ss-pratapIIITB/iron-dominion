// ============================================================
// IRON DOMINION - Map Generation & Rendering
// ============================================================

class GameMap {
  constructor() {
    this.width  = MAP_W;
    this.height = MAP_H;
    this.tiles  = []; // flat array [ty * MAP_W + tx]
    this.passable = []; // boolean flat array
    this.resourceNodes = []; // placed by Game after generation
    this.seed = Math.random() * 9999 | 0;
    this._tileCache = null; // offscreen canvas for tile layer
    this._cacheDirty = true;
  }

  generate() {
    const W = MAP_W, H = MAP_H;
    this.tiles    = new Array(W * H).fill(TERRAIN.GRASS);
    this.passable = new Array(W * H).fill(true);

    const set = (tx, ty, t) => {
      if (tx >= 0 && tx < W && ty >= 0 && ty < H)
        this.tiles[ty * W + tx] = t;
    };

    // Seeded pseudo-random for farmland scatter
    const rng = (x, y) => (((x * 1664525 + y * 1013904223 + this.seed * 22695477) >>> 0) / 4294967295);

    const cx = 32, cy = 32; // map center

    // ── 1. Dense forest border (outer 5 tiles) ─────────────────────────────
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (tx < 5 || tx >= W - 5 || ty < 5 || ty >= H - 5) {
          set(tx, ty, TERRAIN.FOREST);
        }
      }
    }

    // ── 1b. Interior forest patches — AoE2-style scattered woodland ─────────
    // Use low-frequency noise to create 4-8 blob-shaped forest patches
    const forestPatchCenters = [
      {px:14, py:28}, {px:50, py:14}, {px:24, py:48}, {px:48, py:38},
      {px:10, py:42}, {px:55, py:26}, {px:38, py:55}, {px:18, py:18},
    ];
    for (const {px, py} of forestPatchCenters) {
      const radius = 4 + Math.round(rng(px, py) * 3); // 4-7 tile blob
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const d2 = dx*dx + dy*dy;
          if (d2 > radius * radius) continue;
          const tx = px + dx, ty = py + dy;
          if (!inBounds(tx, ty)) continue;
          // Only paint grass tiles; don't override water/roads/start zones
          if (this.tiles[ty * W + tx] === TERRAIN.GRASS) {
            // Irregular edge: skip based on rng for organic shape
            if (d2 > (radius - 1) * (radius - 1) && rng(tx + 100, ty + 100) < 0.45) continue;
            set(tx, ty, TERRAIN.FOREST);
          }
        }
      }
    }

    // ── 2. Secondary dirt paths (drawn before main roads so roads override) ─
    // Two N-S paths and two E-W paths dividing map into 9 zones (2 tiles wide each)
    for (let ty = 4; ty < H - 4; ty++) {
      set(20, ty, TERRAIN.SAND); set(21, ty, TERRAIN.SAND);
      set(44, ty, TERRAIN.SAND); set(45, ty, TERRAIN.SAND);
    }
    for (let tx = 4; tx < W - 4; tx++) {
      set(tx, 20, TERRAIN.SAND); set(tx, 21, TERRAIN.SAND);
      set(tx, 44, TERRAIN.SAND); set(tx, 45, TERRAIN.SAND);
    }

    // ── 3. Winding river (NE to SW) — 3-4 tiles wide with sand banks ────────
    // Flows from top-right area down to bottom-left
    {
      let rx = 50, ry = 5;
      for (let i = 0; i < 56; i++) {
        // Double-frequency wobble creates a more natural S-curve river
        const wobble = Math.round(Math.sin(i * 0.55) * 2.5 + Math.cos(i * 0.28) * 1.5);
        const wx = Math.max(6, Math.min(W - 7, Math.floor(rx) + wobble));
        // Core water — 3 tiles wide
        for (let ox = 0; ox <= 2; ox++) {
          set(wx + ox, ry,   TERRAIN.WATER);
          set(wx + ox, ry+1, TERRAIN.WATER);
        }
        // Sand banks on both sides (only on grass — don't overwrite roads)
        const leftBank  = wx - 1;
        const rightBank = wx + 3;
        if (leftBank >= 4  && this.tiles[ry * W + leftBank]  === TERRAIN.GRASS) set(leftBank,  ry, TERRAIN.SAND);
        if (rightBank < W-4 && this.tiles[ry * W + rightBank] === TERRAIN.GRASS) set(rightBank, ry, TERRAIN.SAND);
        if (leftBank >= 4  && this.tiles[(ry+1) * W + leftBank]  === TERRAIN.GRASS) set(leftBank,  ry+1, TERRAIN.SAND);
        if (rightBank < W-4 && this.tiles[(ry+1) * W + rightBank] === TERRAIN.GRASS) set(rightBank, ry+1, TERRAIN.SAND);
        ry++;
        rx -= 0.90;
        if (ry >= H - 5 || rx < 5) break;
      }
    }

    // ── 4. Main stone roads — 2 tiles wide, cross pattern ──────────────────
    for (let tx = 4; tx < W - 4; tx++) {
      set(tx, 31, TERRAIN.MOUNTAIN); // E-W boulevard
      set(tx, 32, TERRAIN.MOUNTAIN);
    }
    for (let ty = 4; ty < H - 4; ty++) {
      set(31, ty, TERRAIN.MOUNTAIN); // N-S boulevard
      set(32, ty, TERRAIN.MOUNTAIN);
    }

    // ── 5. Central plaza — 13×13 cobblestone square ─────────────────────────
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        set(cx + dx, cy + dy, TERRAIN.MOUNTAIN);
      }
    }

    // ── 6. Fountain at plaza center — 3×3 water feature ─────────────────────
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        set(cx + dx, cy + dy, TERRAIN.WATER);
      }
    }

    // ── 7a. Clustered farmland in outer grass zones ───────────────────────────
    // Use a low-frequency noise (average of 3×3 neighborhood) for natural patches
    const farmRng = (tx, ty) => {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          sum += rng(tx + dx, ty + dy);
      return sum / 25;
    };
    for (let ty = 5; ty < H - 5; ty++) {
      for (let tx = 5; tx < W - 5; tx++) {
        const idx = ty * W + tx;
        if (this.tiles[idx] === TERRAIN.GRASS) {
          const distFromCenter = Math.abs(tx - cx) + Math.abs(ty - cy);
          // Clustered patches: higher threshold on smoothed rng creates blobs
          if (distFromCenter > 18 && farmRng(tx, ty) < 0.30) {
            set(tx, ty, TERRAIN.DIRT);
          }
        }
      }
    }

    // ── 7b. Small interior ponds — 2 ponds in NW and SE quadrants ────────────
    // NW pond (near player 1 zone but outside cleared start)
    { const px = 18, py = 14;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++)
        if (dx*dx*0.3 + dy*dy < 1.5) set(px+dx, py+dy, TERRAIN.WATER);
    }
    // SE pond (near player 2 zone)
    { const px = 44, py = 48;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++)
        if (dx*dx*0.3 + dy*dy < 1.5) set(px+dx, py+dy, TERRAIN.WATER);
    }

    // ── 7c. Road shoulder sand (dirt path effect at road edges) ──────────────
    // Thin sand border on either side of main roads for visual depth
    for (let tx = 5; tx < W - 5; tx++) {
      if (this.tiles[30 * W + tx] === TERRAIN.GRASS) set(tx, 30, TERRAIN.SAND);
      if (this.tiles[33 * W + tx] === TERRAIN.GRASS) set(tx, 33, TERRAIN.SAND);
    }
    for (let ty = 5; ty < H - 5; ty++) {
      if (this.tiles[ty * W + 30] === TERRAIN.GRASS) set(30, ty, TERRAIN.SAND);
      if (this.tiles[ty * W + 33] === TERRAIN.GRASS) set(33, ty, TERRAIN.SAND);
    }

    // ── 8. Build passability map ─────────────────────────────────────────────
    for (let i = 0; i < W * H; i++) {
      this.passable[i] = TERRAIN_PASSABLE[this.tiles[i]];
    }

    // ── 9. Clear player starting zones (sets terrain to GRASS) ───────────────
    this._clearStartZone(10, 10, 8);   // Player 1 — NW quadrant
    this._clearStartZone(52, 52, 8);   // Player 2 — SE quadrant

    this._cacheDirty = true;
  }

  _clearStartZone(cx, cy, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const tx = cx + dx, ty = cy + dy;
        if (!inBounds(tx, ty)) continue;
        const idx = ty * MAP_W + tx;
        this.tiles[idx] = TERRAIN.GRASS;
        this.passable[idx] = true;
      }
    }
  }

  getTile(tx, ty) {
    if (!inBounds(tx, ty)) return TERRAIN.WATER;
    return this.tiles[ty * MAP_W + tx];
  }

  isPassable(tx, ty) {
    if (!inBounds(tx, ty)) return false;
    return this.passable[ty * MAP_W + tx];
  }

  setPassable(tx, ty, val) {
    if (!inBounds(tx, ty)) return;
    this.passable[ty * MAP_W + tx] = val;
  }

  // Mark tiles covered by a building as impassable
  occupyBuilding(btx, bty, size, passable) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        this.setPassable(btx + dx, bty + dy, passable);
      }
    }
    this._cacheDirty = true;
  }

  update(dt) {
    SpriteR.tickWater(dt);
  }

  // Compute tile range visible in camera viewport (isometric)
  _getVisibleTileRange(camera) {
    const vw = camera.viewW / camera.zoom;
    const vh = camera.viewH / camera.zoom;
    const wx = camera.worldX, wy = camera.worldY;

    // Convert viewport corners to tile space
    const c0 = isoToTileF(wx,      wy);
    const c1 = isoToTileF(wx + vw, wy);
    const c2 = isoToTileF(wx,      wy + vh);
    const c3 = isoToTileF(wx + vw, wy + vh);

    const minTx = Math.max(0,       Math.floor(Math.min(c0.tx, c1.tx, c2.tx, c3.tx)) - 2);
    const maxTx = Math.min(MAP_W-1, Math.ceil (Math.max(c0.tx, c1.tx, c2.tx, c3.tx)) + 2);
    const minTy = Math.max(0,       Math.floor(Math.min(c0.ty, c1.ty, c2.ty, c3.ty)) - 2);
    const maxTy = Math.min(MAP_H-1, Math.ceil (Math.max(c0.ty, c1.ty, c2.ty, c3.ty)) + 2);

    return { minTx, maxTx, minTy, maxTy };
  }

  // Smooth bilinear-interpolated noise color for grass tiles.
  // Uses a 5-tile grid with smoothstep interpolation — produces seamless, organic
  // color variation with no visible tile boundaries or block artifacts.
  // Shared two-octave bilinear value noise sampler.
  _biNoise(tx, ty, G1, G2, seed1, seed2, w1, w2) {
    const sample = (G, seed) => {
      const x0 = Math.floor(tx / G) * G, y0 = Math.floor(ty / G) * G;
      const hv = (gx, gy) => (((gx * 374761393 + gy * 1234567891 + seed) >>> 0) % 256) / 255;
      const h00 = hv(x0,   y0); const h10 = hv(x0+G, y0);
      const h01 = hv(x0, y0+G); const h11 = hv(x0+G, y0+G);
      const fx = (tx-x0)/G, fy = (ty-y0)/G;
      const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
      return h00*(1-ux)*(1-uy) + h10*ux*(1-uy) + h01*(1-ux)*uy + h11*ux*uy;
    };
    return sample(G1, seed1) * w1 + sample(G2, seed2) * w2;
  }

  _grassColor(tx, ty) {
    const n = this._biNoise(tx, ty, 10, 4, 77777, 33333, 0.70, 0.30);
    // AoE2-style bright green: base rgb(90,145,95), amplitude ±26
    const d = Math.round((n - 0.5) * 52);
    return `rgb(${Math.max(45,Math.min(135,90+d))},${Math.max(100,Math.min(190,145+d))},${Math.max(58,Math.min(125,95+Math.round(d*0.55)))})`;
  }

  _dirtColor(tx, ty) {
    const n = this._biNoise(tx, ty, 8, 3, 11111, 55555, 0.65, 0.35);
    // Earthy brown: base #7a6040 = rgb(122,96,64), amplitude ±15 (less variation than grass)
    const d = Math.round((n - 0.5) * 30);
    return `rgb(${Math.max(80,Math.min(155,122+d))},${Math.max(65,Math.min(125,96+d))},${Math.max(40,Math.min(90,64+Math.round(d*0.6)))})`;
  }

  _sandColor(tx, ty) {
    const n = this._biNoise(tx, ty, 8, 3, 22222, 66666, 0.65, 0.35);
    // Earthy tan: base #a88858 = rgb(168,136,88), amplitude ±14
    const d = Math.round((n - 0.5) * 28);
    return `rgb(${Math.max(125,Math.min(205,168+d))},${Math.max(100,Math.min(170,136+d))},${Math.max(58,Math.min(115,88+Math.round(d*0.5)))})`;
  }

  _mountainColor(tx, ty) {
    const n = this._biNoise(tx, ty, 7, 3, 44444, 88888, 0.60, 0.40);
    // Cobblestone gray: base #8a8a7a = rgb(138,138,122), amplitude ±14
    const d = Math.round((n - 0.5) * 28);
    const r = Math.max(105, Math.min(165, 138 + d));
    const g = Math.max(105, Math.min(165, 138 + d));
    const b = Math.max(90,  Math.min(148, 122 + Math.round(d * 0.7)));
    return `rgb(${r},${g},${b})`;
  }

  _drawIsoTile(ctx, tx, ty) {
    const terrain = this.getTile(tx, ty);
    const iso = tileToIso(tx, ty);
    const iw = ISO_TILE_W, ih = ISO_TILE_H;

    const terrainName = Object.keys(TERRAIN).find(k => TERRAIN[k] === terrain) || 'GRASS';
    const rx = Math.round(iso.x), ry = Math.round(iso.y);

    // Solid diamond background using smooth bilinear noise color for organic terrain types.
    // GRASS/DIRT/SAND/MOUNTAIN all use procedural color (no Kenney sprite) to eliminate tile-grid artifacts.
    // FOREST uses flat TERRAIN_COLORS base, then Kenney sprite draws over it.
    if (terrain === TERRAIN.GRASS) {
      ctx.fillStyle = this._grassColor(tx, ty);
    } else if (terrain === TERRAIN.DIRT) {
      ctx.fillStyle = this._dirtColor(tx, ty);
    } else if (terrain === TERRAIN.SAND) {
      ctx.fillStyle = this._sandColor(tx, ty);
    } else if (terrain === TERRAIN.MOUNTAIN) {
      ctx.fillStyle = this._mountainColor(tx, ty);
    } else {
      ctx.fillStyle = TERRAIN_COLORS[terrain];
    }
    // Expand diamond fill by 0.5px to eliminate 1px seam gaps between adjacent tiles.
    ctx.beginPath();
    ctx.moveTo(rx + iw / 2, ry - 0.5);
    ctx.lineTo(rx + iw + 0.5, ry + ih / 2);
    ctx.lineTo(rx + iw / 2, ry + ih + 0.5);
    ctx.lineTo(rx - 0.5,    ry + ih / 2);
    ctx.closePath();
    ctx.fill();

    // Water → animated procedural (waves, shimmer).
    // GRASS/DIRT/SAND/MOUNTAIN → pure procedural noise color — no Kenney sprite (baked shading creates grid).
    // FOREST → Kenney sprite at full opacity for vegetation texture.
    if (terrain === TERRAIN.WATER) {
      SpriteR.drawWaterTileIso(ctx, iso.x, iso.y, iw, ih, SpriteR._waterTime);
    } else if (terrain === TERRAIN.FOREST) {
      const sprite = SpriteLoader.getTerrainSprite(terrainName, tx, ty);
      if (sprite) {
        ctx.drawImage(sprite, rx, ry, iw + 1, ih + 1);
      } else {
        const tile = SpriteR.getTerrainTile(terrain, tx, ty);
        if (tile) {
          ctx.drawImage(tile, iso.x, iso.y, iw, ih);
        }
      }
    }

    // Tree shadow casting: forest tiles behind this tile (in render order) cast shadows.
    // Light from NW → shadows fall toward SE. Neighbors (tx-1,ty) and (tx,ty-1) are behind.
    if (terrain !== TERRAIN.FOREST && terrain !== TERRAIN.WATER) {
      const shadowSources = [
        { dtx: -1, dty:  0,
          gx0: rx + iw * 0.22, gy0: ry + ih * 0.22,
          gx1: rx + iw * 0.78, gy1: ry + ih * 0.78 },
        { dtx:  0, dty: -1,
          gx0: rx + iw * 0.78, gy0: ry + ih * 0.22,
          gx1: rx + iw * 0.22, gy1: ry + ih * 0.78 },
      ];
      for (const e of shadowSources) {
        if (this.getTile(tx + e.dtx, ty + e.dty) !== TERRAIN.FOREST) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx + iw / 2, ry);
        ctx.lineTo(rx + iw,     ry + ih / 2);
        ctx.lineTo(rx + iw / 2, ry + ih);
        ctx.lineTo(rx,          ry + ih / 2);
        ctx.closePath();
        ctx.clip();
        const sg = ctx.createLinearGradient(e.gx0, e.gy0, e.gx1, e.gy1);
        sg.addColorStop(0,   'rgba(0,0,0,0.38)');
        sg.addColorStop(0.5, 'rgba(0,0,0,0.14)');
        sg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
        ctx.restore();
      }
    }

    // Grass fine micro-detail: short blade strokes on ~30% of tiles.
    // The smooth bilinear base color handles all large-scale variation; tufts add close-up richness.
    if (terrain === TERRAIN.GRASS) {
      const bladeSeed = ((tx * 2246822519 + ty * 3266489917) >>> 0);
      if (bladeSeed % 10 < 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx + iw / 2, ry);
        ctx.lineTo(rx + iw,     ry + ih / 2);
        ctx.lineTo(rx + iw / 2, ry + ih);
        ctx.lineTo(rx,          ry + ih / 2);
        ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = 'rgba(0,30,0, 0.28)';
        ctx.lineWidth = 0.8;
        const numBlades = 2 + (bladeSeed % 3);
        for (let b = 0; b < numBlades; b++) {
          const bx2 = rx + 6 + (((bladeSeed >> (b * 5)) & 0xff) % (iw - 12));
          const by2 = ry + Math.round(ih * 0.2) + (((bladeSeed >> (b * 5 + 2)) & 0x1f) % Math.round(ih * 0.5));
          const tilt = (((bladeSeed >> (b + 15)) & 0x7) - 3) * 0.6;
          ctx.beginPath();
          ctx.moveTo(bx2, by2 + 3);
          ctx.lineTo(bx2 + tilt, by2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Cobblestone mortar detail: small stone marks on MOUNTAIN tiles.
    // Draws darker ellipses representing individual stones embedded in mortar,
    // giving a paved cobblestone look without any repeating tile-grid artifact.
    if (terrain === TERRAIN.MOUNTAIN) {
      const cSeed = ((tx * 1952351 + ty * 2999483) >>> 0);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx + iw / 2, ry);
      ctx.lineTo(rx + iw,     ry + ih / 2);
      ctx.lineTo(rx + iw / 2, ry + ih);
      ctx.lineTo(rx,          ry + ih / 2);
      ctx.closePath();
      ctx.clip();
      const numStones = 6;
      for (let s = 0; s < numStones; s++) {
        const seed2 = ((cSeed + s * 7919) >>> 0);
        const cx2 = rx + 6 + (seed2 % (iw - 12));
        const cy2 = ry + 4 + ((seed2 >> 8) % (ih - 8));
        const rw2 = 1.5 + (seed2 >> 16) % 3;   // 1.5-3.5px wide
        const rh2 = 1.0 + (seed2 >> 20) % 2;   // 1-2px tall
        const angle = ((seed2 >> 24) % 6) * 0.35;
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, rw2, rh2, angle, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Directional depth shading: lighter NW, darker SE (isometric lighting).
    // Only for FOREST — its Kenney sprites benefit from the 3D depth effect.
    // GRASS/DIRT/SAND/MOUNTAIN use smooth noise; per-tile depth gradient recreates tile-grid artifact.
    if (terrain === TERRAIN.FOREST) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx + iw / 2, ry);
      ctx.lineTo(rx + iw,     ry + ih / 2);
      ctx.lineTo(rx + iw / 2, ry + ih);
      ctx.lineTo(rx,          ry + ih / 2);
      ctx.closePath();
      ctx.clip();
      const depthGrad = ctx.createLinearGradient(rx, ry, rx + iw, ry + ih);
      depthGrad.addColorStop(0,    'rgba(255,255,255,0.10)');
      depthGrad.addColorStop(0.42, 'rgba(0,0,0,0.00)');
      depthGrad.addColorStop(1,    'rgba(0,0,0,0.22)');
      ctx.fillStyle = depthGrad;
      ctx.fillRect(rx, ry, iw + 1, ih + 1);
      ctx.restore();
    }

    // Terrain edge transitions: gradient fringe based on adjacent terrain types.
    // Adds a thin color fringe along diamond edges facing differently-typed neighbors.
    // FRINGE_MAP: for each base terrain, maps neighbor terrain → fringe RGBA color.
    const FRINGE_MAP = {
      [TERRAIN.GRASS]: {
        [TERRAIN.SAND]:     'rgba(145,108,68, 0.55)',
        [TERRAIN.DIRT]:     'rgba(145,108,68, 0.55)',
        [TERRAIN.MOUNTAIN]: 'rgba(80,75,70, 0.45)',
        [TERRAIN.FOREST]:   'rgba(30,60,20, 0.50)',
        [TERRAIN.WATER]:    'rgba(60,120,180, 0.40)',
      },
      [TERRAIN.DIRT]: {
        [TERRAIN.GRASS]:    'rgba(60,100,40, 0.40)',
      },
      [TERRAIN.SAND]: {
        [TERRAIN.GRASS]:    'rgba(60,100,40, 0.35)',
      },
      [TERRAIN.FOREST]: {
        [TERRAIN.GRASS]:    'rgba(55,110,30, 0.38)',
        [TERRAIN.DIRT]:     'rgba(55,110,30, 0.28)',
      },
      [TERRAIN.MOUNTAIN]: {
        [TERRAIN.GRASS]:    'rgba(55,90,35, 0.32)',
        [TERRAIN.DIRT]:     'rgba(80,65,50, 0.35)',
        [TERRAIN.SAND]:     'rgba(120,100,60, 0.38)',
      },
      [TERRAIN.WATER]: {
        [TERRAIN.GRASS]:    'rgba(40,140,80, 0.30)',
        [TERRAIN.SAND]:     'rgba(140,120,70, 0.32)',
      },
    };
    // Farmland furrow detail on DIRT tiles: plowed-row banding + per-tile brightness noise
    if (terrain === TERRAIN.DIRT) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx + iw / 2, ry);
      ctx.lineTo(rx + iw,     ry + ih / 2);
      ctx.lineTo(rx + iw / 2, ry + ih);
      ctx.lineTo(rx,          ry + ih / 2);
      ctx.closePath();
      ctx.clip();
      // Per-tile brightness variation so farmland isn't a solid color block
      const dirtNoise = ((tx * 374761393 + ty * 1234567891 + 55555) >>> 0) % 256;
      if (dirtNoise < 90) {
        ctx.fillStyle = `rgba(0,0,0,${(90 - dirtNoise) / 90 * 0.12})`;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
      } else if (dirtNoise > 170) {
        ctx.fillStyle = `rgba(255,230,180,${(dirtNoise - 170) / 85 * 0.08})`;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
      }
      // Horizontal plowed furrows (stronger than before)
      ctx.strokeStyle = 'rgba(50,25,5, 0.35)';
      ctx.lineWidth = 1.0;
      for (let i = 1; i <= 3; i++) {
        const lineY = ry + ih * (i / 4);
        ctx.beginPath();
        ctx.moveTo(rx, lineY);
        ctx.lineTo(rx + iw, lineY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Stone cobblestone texture on MOUNTAIN (road/plaza) tiles
    if (terrain === TERRAIN.MOUNTAIN) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx + iw / 2, ry);
      ctx.lineTo(rx + iw,     ry + ih / 2);
      ctx.lineTo(rx + iw / 2, ry + ih);
      ctx.lineTo(rx,          ry + ih / 2);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = 'rgba(60,60,65, 0.22)';
      ctx.lineWidth = 0.7;
      // Horizontal row lines (flat iso paving)
      for (let i = 1; i <= 3; i++) {
        const lineY = ry + ih * (i / 4);
        ctx.beginPath();
        ctx.moveTo(rx, lineY);
        ctx.lineTo(rx + iw, lineY);
        ctx.stroke();
      }
      // Alternating vertical offsets to suggest staggered stone blocks
      const seed = ((tx * 1664525 + ty * 22695477) >>> 0);
      const offset = (seed % 2) ? iw * 0.25 : 0;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 3; i++) {
        const lx = rx + (i / 3) * iw + offset;
        ctx.beginPath();
        ctx.moveTo(lx, ry);
        ctx.lineTo(lx, ry + ih);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sandy grain texture on SAND (path shoulder) tiles + per-tile noise
    if (terrain === TERRAIN.SAND) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx + iw / 2, ry);
      ctx.lineTo(rx + iw,     ry + ih / 2);
      ctx.lineTo(rx + iw / 2, ry + ih);
      ctx.lineTo(rx,          ry + ih / 2);
      ctx.closePath();
      ctx.clip();
      // Per-tile brightness noise
      const sandNoise = ((tx * 2246822519 + ty * 3266489917 + 22222) >>> 0) % 256;
      if (sandNoise < 90) {
        ctx.fillStyle = `rgba(80,55,10, ${(90 - sandNoise) / 90 * 0.14})`;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
      } else if (sandNoise > 170) {
        ctx.fillStyle = `rgba(255,240,200, ${(sandNoise - 170) / 85 * 0.10})`;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
      }
      // Wavy grain lines (stronger opacity)
      ctx.strokeStyle = 'rgba(85,55,15, 0.38)';
      ctx.lineWidth = 1.0;
      const sandSeed = ((tx * 2246822519 + ty * 3266489917) >>> 0);
      const waveShift = (sandSeed % 4) * 2;
      for (let i = 0; i <= 4; i++) {
        const lineY = ry + ih * (i / 4) + waveShift * 0.5;
        ctx.beginPath();
        ctx.moveTo(rx,        lineY + 1.5);
        ctx.quadraticCurveTo(rx + iw * 0.5, lineY - 1.5, rx + iw, lineY + 1.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    const fringeSet = FRINGE_MAP[terrain];
    if (fringeSet) {
      const cx0 = rx + iw / 2, cy0 = ry + ih / 2;
      // Widen fringe coverage from 15% to 28% of tile width for more visible blending
      const blendEdges = [
        { dtx: +1, dty:  0, gx0: rx + iw,        gy0: ry + ih/2,    gx1: cx0 + iw*0.28, gy1: cy0 },
        { dtx:  0, dty: +1, gx0: rx,              gy0: ry + ih/2,    gx1: cx0 - iw*0.28, gy1: cy0 },
        { dtx: -1, dty:  0, gx0: rx + iw * 0.18,  gy0: ry + ih*0.18, gx1: cx0,           gy1: cy0 },
        { dtx:  0, dty: -1, gx0: rx + iw * 0.82,  gy0: ry + ih*0.18, gx1: cx0,           gy1: cy0 },
      ];
      for (const e of blendEdges) {
        const nTerrain = this.getTile(tx + e.dtx, ty + e.dty);
        const fringeColor = fringeSet[nTerrain];
        if (!fringeColor) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx + iw / 2, ry);
        ctx.lineTo(rx + iw,     ry + ih / 2);
        ctx.lineTo(rx + iw / 2, ry + ih);
        ctx.lineTo(rx,          ry + ih / 2);
        ctx.closePath();
        ctx.clip();
        const tg = ctx.createLinearGradient(e.gx0, e.gy0, e.gx1, e.gy1);
        tg.addColorStop(0, fringeColor);
        tg.addColorStop(1, fringeColor.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = tg;
        ctx.fillRect(rx, ry, iw + 1, ih + 1);
        ctx.restore();
      }
    }
  }

  // Draw a procedural tree overlay above a forest tile (call in iso order after ground tiles)
  _drawTreeOverlay(ctx, tx, ty) {
    const iso = tileToIso(tx, ty);
    const iw = ISO_TILE_W, ih = ISO_TILE_H;
    const rx = Math.round(iso.x), ry = Math.round(iso.y);

    // Seeded variety per tile position
    const h = ((tx * 1664525 + ty * 1013904223) >>> 0);
    const variant = h % 4;
    const jitter = (h >> 8) % 4; // secondary seed for size jitter

    // Tree geometry (scaled to tile size) — taller than before for stronger 3D forest feel
    const tcx = rx + iw / 2 + ((h >> 12) % 5) - 2; // slight horizontal jitter
    const baseY = ry + ih * 0.45;
    const trunkH = Math.round(ih * 0.85) + (jitter % 4);
    const crownW = Math.round(iw * 0.34) + (jitter % 5);
    const crownH = Math.round(ih * 1.25) + (jitter % 6);
    const crownY = baseY - trunkH - crownH * 0.62;

    // Ground shadow ellipse (flat iso shadow to the right)
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(tcx + 3, baseY + 1, crownW * 0.85, ih * 0.22, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Trunk
    ctx.fillStyle = '#3a1f08';
    ctx.fillRect(tcx - 2, baseY - trunkH, 3, trunkH + 1);

    // Shadow crown (darkest layer, offset down-right for depth)
    ctx.fillStyle = '#142d07';
    ctx.beginPath();
    ctx.ellipse(tcx + 2, crownY + 3, crownW, crownH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mid crown (base color)
    const greens = ['#2d5c10', '#2f6213', '#28560d', '#356618'];
    ctx.fillStyle = greens[variant];
    ctx.beginPath();
    ctx.ellipse(tcx, crownY, crownW, crownH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Secondary foliage blob (slightly offset, mid-brightness)
    const greens2 = ['#346e12', '#3a7214', '#30680f', '#3d7a1a'];
    ctx.fillStyle = greens2[variant];
    ctx.beginPath();
    ctx.ellipse(tcx - 1, crownY - crownH * 0.12, crownW * 0.78, crownH * 0.72, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Highlight (top-left, bright green — simulates light from upper-left)
    ctx.fillStyle = '#52a025';
    ctx.beginPath();
    ctx.ellipse(tcx - crownW * 0.22, crownY - crownH * 0.26, crownW * 0.44, crownH * 0.38, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  render(ctx, camera) {
    SpriteR.tickWater(0); // water time updated externally via update(dt)
    const { minTx, maxTx, minTy, maxTy } = this._getVisibleTileRange(camera);

    // Pass 1: ground terrain tiles (back-to-front)
    for (let sum = minTx + minTy; sum <= maxTx + maxTy; sum++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const ty = sum - tx;
        if (ty < minTy || ty > maxTy) continue;
        this._drawIsoTile(ctx, tx, ty);
      }
    }

    // Pass 2: tall object overlays (trees) — drawn after all ground so they appear above terrain
    for (let sum = minTx + minTy; sum <= maxTx + maxTy; sum++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const ty = sum - tx;
        if (ty < minTy || ty > maxTy) continue;
        if (this.getTile(tx, ty) === TERRAIN.FOREST) {
          this._drawTreeOverlay(ctx, tx, ty);
        }
      }
    }
  }

  // For minimap - render color dots per tile
  renderMinimap(ctx, x, y, w, h) {
    const tileW = w / MAP_W;
    const tileH = h / MAP_H;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const terrain = this.getTile(tx, ty);
        ctx.fillStyle = TERRAIN_COLORS[terrain];
        ctx.fillRect(x + tx * tileW, y + ty * tileH, Math.ceil(tileW), Math.ceil(tileH));
      }
    }
  }
}
