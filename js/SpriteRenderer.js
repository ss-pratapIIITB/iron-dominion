'use strict';

// ============================================================
// IRON DOMINION - SpriteRenderer
// Pure procedural Canvas 2D drawing - no external images
// ============================================================

const SpriteR = {
  _terrainVariants: {},
  _waterFrame: 0,
  _waterTime: 0,

  init() {
    this._terrainVariants = {};
    this._waterFrame = 0;
    this._waterTime = 0;
    this._genAllTerrainVariants();
  },

  tickWater(dt) {
    this._waterTime += dt;
    this._waterFrame = Math.floor(this._waterTime / 200) % 4;
  },

  // ── TERRAIN ──────────────────────────────────────────────

  _genAllTerrainVariants() {
    const types = ['GRASS','FOREST','WATER','MOUNTAIN','SAND','DIRT'];
    for (const t of types) {
      if (t === 'WATER') continue; // water is animated, not cached
      for (let v = 0; v < 4; v++) {
        const key = `${t}_${v}`;
        const iw = ISO_TILE_W, ih = ISO_TILE_H;
        const oc = new OffscreenCanvas(iw, ih);
        const ctx = oc.getContext('2d');
        // Apply diamond clip for isometric tile shape
        ctx.save();
        this._clipDiamond(ctx, iw, ih);
        this[`_gen${t.charAt(0) + t.slice(1).toLowerCase()}`](ctx, v, iw, ih);
        ctx.restore();
        this._terrainVariants[key] = oc;
      }
    }
  },

  // Clip to isometric diamond shape
  _clipDiamond(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w/2, 0);
    ctx.lineTo(w,   h/2);
    ctx.lineTo(w/2, h);
    ctx.lineTo(0,   h/2);
    ctx.closePath();
    ctx.clip();
  },

  // Draw a diamond shape for terrain with fill
  _fillDiamond(ctx, w, h, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.moveTo(w/2, 0);
    ctx.lineTo(w,   h/2);
    ctx.lineTo(w/2, h);
    ctx.lineTo(0,   h/2);
    ctx.closePath();
    ctx.fill();
  },

  getTerrainTile(tileType, tx, ty) {
    const hash = ((tx * 2971 + ty * 5923) >>> 0) % 4;
    const names = ['GRASS','FOREST','WATER','MOUNTAIN','SAND','DIRT'];
    const name = names[tileType] || 'GRASS';
    return this._terrainVariants[`${name}_${hash}`];
  },

  // Seeded pseudo-random for deterministic tile variants
  _rng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  },

  _genGrass(ctx, variant, sw, sh) {
    const r = this._rng(variant * 997 + 1);
    // Isometric top-face gradient (lighter top-left = "lit from above-left")
    const bg = ctx.createLinearGradient(0, 0, sw, sh);
    const h1 = 128 + r() * 6, l1 = 38 + r() * 6;
    const h2 = 132 + r() * 5, l2 = 28 + r() * 5;
    bg.addColorStop(0, `hsl(${h1},52%,${l1}%)`);
    bg.addColorStop(0.5, `hsl(${h1},48%,${l1-3}%)`);
    bg.addColorStop(1, `hsl(${h2},44%,${l2}%)`);
    this._fillDiamond(ctx, sw, sh, bg);

    // Grass detail texture within the diamond
    ctx.save();
    this._clipDiamond(ctx, sw, sh);

    // Grass blades clustered
    ctx.lineWidth = 0.8;
    const bladeCount = 40 + Math.floor(r() * 25);
    for (let i = 0; i < bladeCount; i++) {
      const bx = r() * sw;
      const by = r() * sh;
      const len = 3 + r() * 5;
      const angle = -Math.PI * 0.6 + (r() - 0.5) * 1.0;
      const bright = 20 + Math.floor(r() * 12);
      ctx.strokeStyle = `hsl(${125 + r()*10},${50+r()*15}%,${bright}%)`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle) * len, by + Math.sin(angle) * len);
      ctx.stroke();
    }

    // Dark soil patches
    for (let i = 0; i < 4 + Math.floor(r()*3); i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + r()*0.06})`;
      ctx.beginPath();
      ctx.ellipse(r()*sw, r()*sh, 3+r()*6, 2+r()*4, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Tiny wildflowers
    for (let i = 0; i < 2 + Math.floor(r()*2); i++) {
      const fx = r() * sw, fy = r() * sh;
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,240,160,0.9)' : 'rgba(220,240,255,0.85)';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.3, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,50,0.7)';
      ctx.beginPath();
      ctx.arc(fx, fy, 0.6, 0, Math.PI*2);
      ctx.fill();
    }

    // Subtle highlight (sunlight from top-left)
    const hi = ctx.createLinearGradient(0, 0, sw*0.5, sh*0.3);
    hi.addColorStop(0, 'rgba(255,255,200,0.08)');
    hi.addColorStop(1, 'rgba(255,255,200,0)');
    this._fillDiamond(ctx, sw, sh, hi);

    ctx.restore();
  },

  _genForest(ctx, variant, sw, sh) {
    const r = this._rng(variant * 1103 + 7);
    // Dark forest floor base
    const bg = ctx.createLinearGradient(0, 0, sw, sh);
    bg.addColorStop(0, `hsl(125,48%,14%)`);
    bg.addColorStop(1, `hsl(128,52%,18%)`);
    this._fillDiamond(ctx, sw, sh, bg);

    ctx.save();
    this._clipDiamond(ctx, sw, sh);

    // Tree canopies - multiple layered circles
    const treeCount = 6 + Math.floor(r() * 4);
    for (let i = 0; i < treeCount; i++) {
      const tx = r() * sw;
      const ty = r() * sh;
      const tr = 5 + r() * 10;
      const cg = ctx.createRadialGradient(tx - tr*0.3, ty - tr*0.3, 0, tx, ty, tr);
      cg.addColorStop(0, `hsl(${125+r()*10},58%,${24+r()*8}%)`);
      cg.addColorStop(0.6, `hsl(${123+r()*8},52%,${16+r()*5}%)`);
      cg.addColorStop(1, `hsl(${120+r()*6},45%,${10+r()*4}%)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI*2);
      ctx.fill();
    }

    // Leaf texture strokes
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 25; i++) {
      ctx.strokeStyle = `hsl(${124+r()*14},${52+r()*14}%,${20+r()*12}%)`;
      ctx.beginPath();
      const lx = r()*sw, ly = r()*sh;
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + (r()-0.5)*8, ly + (r()-0.5)*7);
      ctx.stroke();
    }

    // Sun dapples through canopy
    const dappleCount = 2 + Math.floor(r()*4);
    for (let i = 0; i < dappleCount; i++) {
      ctx.fillStyle = 'rgba(255,255,200,0.07)';
      ctx.beginPath();
      ctx.ellipse(r()*sw, r()*sh, 5+r()*9, 3+r()*6, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Dark vignette at edges
    const vg = ctx.createRadialGradient(sw/2, sh/2, sh*0.1, sw/2, sh/2, sw*0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    this._fillDiamond(ctx, sw, sh, vg);

    ctx.restore();
  },

  _genWater(ctx, variant, sw, sh) {
    // Water is handled by drawWaterTileIso animation, so this is a placeholder
    const r = this._rng(variant * 1301 + 13);
    const bg = ctx.createRadialGradient(sw/2, sh/2, 0, sw/2, sh/2, sw*0.6);
    bg.addColorStop(0, `hsl(212,68%,52%)`);
    bg.addColorStop(1, `hsl(210,65%,40%)`);
    this._fillDiamond(ctx, sw, sh, bg);
  },

  _genMountain(ctx, variant, sw, sh) {
    const r = this._rng(variant * 1451 + 19);
    // Rocky gradient - lighter from above-left
    const bg = ctx.createLinearGradient(0, 0, sw, sh);
    bg.addColorStop(0, `hsl(30,22%,48%)`);
    bg.addColorStop(0.5, `hsl(28,25%,40%)`);
    bg.addColorStop(1, `hsl(25,20%,30%)`);
    this._fillDiamond(ctx, sw, sh, bg);

    ctx.save();
    this._clipDiamond(ctx, sw, sh);

    // Boulder shapes scattered across tile
    const rockCount = 2 + Math.floor(r()*3);
    for (let i = 0; i < rockCount; i++) {
      const rx = 8 + r()*(sw-16);
      const ry = 6 + r()*(sh-12);
      const pts = 5 + Math.floor(r()*4);
      const grad = ctx.createRadialGradient(rx - 2, ry - 2, 0, rx, ry, 7+r()*5);
      grad.addColorStop(0, `hsl(${30+r()*10},${18+r()*10}%,${44+r()*10}%)`);
      grad.addColorStop(1, `hsl(${25+r()*8},${15+r()*8}%,${25+r()*6}%)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const rad = 4 + r()*7;
        const px = rx + Math.cos(a) * rad * (0.8 + r()*0.4);
        const py = ry + Math.sin(a) * rad * (0.5 + r()*0.3);
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Snow cap highlighting at top of diamond
    ctx.fillStyle = 'rgba(230,238,250,0.45)';
    ctx.beginPath();
    ctx.moveTo(sw*0.35, sh*0.08);
    ctx.lineTo(sw*0.5, 0);
    ctx.lineTo(sw*0.65, sh*0.08);
    ctx.lineTo(sw*0.5, sh*0.18);
    ctx.closePath();
    ctx.fill();

    // Crack lines
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const cx1 = r()*sw, cy1 = r()*sh;
      ctx.moveTo(cx1, cy1);
      ctx.bezierCurveTo(cx1+(r()-0.5)*15, cy1+(r()-0.5)*10, cx1+(r()-0.5)*12, cy1+(r()-0.5)*12, cx1+(r()-0.5)*22, cy1+(r()-0.5)*18);
      ctx.stroke();
    }

    // Shadow from top-right (cool blue-grey)
    const shadow = ctx.createLinearGradient(sw, 0, sw*0.4, sh);
    shadow.addColorStop(0, 'rgba(60,80,130,0.0)');
    shadow.addColorStop(1, 'rgba(60,80,130,0.18)');
    this._fillDiamond(ctx, sw, sh, shadow);

    ctx.restore();
  },

  _genSand(ctx, variant, sw, sh) {
    const r = this._rng(variant * 1597 + 23);
    // Warm sandy gradient
    const bg = ctx.createLinearGradient(0, 0, sw, sh);
    bg.addColorStop(0, `hsl(43,70%,64%)`);
    bg.addColorStop(0.5, `hsl(42,65%,58%)`);
    bg.addColorStop(1, `hsl(40,60%,50%)`);
    this._fillDiamond(ctx, sw, sh, bg);

    ctx.save();
    this._clipDiamond(ctx, sw, sh);

    // Dune ripple lines
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,225,130,${0.3+r()*0.2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const dy = sh*(0.2 + i*0.25) + r()*sh*0.08;
      ctx.moveTo(0, dy);
      ctx.quadraticCurveTo(sw*0.5, dy - sh*(0.06+r()*0.04), sw, dy);
      ctx.stroke();
    }

    // Pebble dots
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(${120+Math.floor(r()*30)},${90+Math.floor(r()*20)},${50+Math.floor(r()*20)},${0.35+r()*0.25})`;
      ctx.beginPath();
      ctx.ellipse(r()*sw, r()*sh, 1+r()*2, 0.7+r()*1.5, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Grain stipple noise
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = `rgba(${170+Math.floor(r()*30)},${135+Math.floor(r()*20)},${65+Math.floor(r()*15)},${0.12+r()*0.1})`;
      ctx.fillRect(r()*sw, r()*sh, 1.5, 1.5);
    }

    // Sunlight highlight at top
    const hi = ctx.createLinearGradient(0, 0, sw*0.5, sh*0.3);
    hi.addColorStop(0, 'rgba(255,240,180,0.12)');
    hi.addColorStop(1, 'rgba(255,240,180,0)');
    this._fillDiamond(ctx, sw, sh, hi);

    ctx.restore();
  },

  _genDirt(ctx, variant, sw, sh) {
    const r = this._rng(variant * 1699 + 29);
    // Brown gradient
    const bg = ctx.createLinearGradient(0, 0, sw, sh);
    bg.addColorStop(0, `hsl(24,48%,32%)`);
    bg.addColorStop(0.5, `hsl(25,44%,26%)`);
    bg.addColorStop(1, `hsl(22,40%,20%)`);
    this._fillDiamond(ctx, sw, sh, bg);

    ctx.save();
    this._clipDiamond(ctx, sw, sh);

    // Soil texture patches
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.05+r()*0.07})`;
      ctx.beginPath();
      ctx.ellipse(r()*sw, r()*sh, 2+r()*4, 1.5+r()*3, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Light soil patches
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(180,140,90,${0.08+r()*0.08})`;
      ctx.beginPath();
      ctx.ellipse(r()*sw, r()*sh, 3+r()*5, 2+r()*3, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Small grey pebbles
    for (let i = 0; i < 4; i++) {
      const gv = 40 + Math.floor(r()*20);
      ctx.fillStyle = `hsl(0,0%,${gv}%)`;
      ctx.beginPath();
      const rx = r()*sw, ry = r()*sh;
      ctx.ellipse(rx, ry, 2+r()*3, 1.5+r()*2.5, r()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }

    // Crack lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const cx1 = r()*sw, cy1 = r()*sh;
      ctx.moveTo(cx1, cy1);
      ctx.bezierCurveTo(
        cx1+(r()-0.5)*14, cy1+(r()-0.5)*9,
        cx1+(r()-0.5)*10, cy1+(r()-0.5)*11,
        cx1+(r()-0.5)*20, cy1+(r()-0.5)*16
      );
      ctx.stroke();
    }

    // Sunlight sheen top-left
    const hi = ctx.createLinearGradient(0, 0, sw*0.4, sh*0.3);
    hi.addColorStop(0, 'rgba(200,160,100,0.10)');
    hi.addColorStop(1, 'rgba(200,160,100,0)');
    this._fillDiamond(ctx, sw, sh, hi);

    ctx.restore();
  },

  // Animated isometric water tile (replaces old drawWaterTile)
  drawWaterTileIso(ctx, px, py, iw, ih, time) {
    ctx.save();
    // Clip to diamond
    ctx.beginPath();
    ctx.moveTo(px + iw/2, py);
    ctx.lineTo(px + iw,   py + ih/2);
    ctx.lineTo(px + iw/2, py + ih);
    ctx.lineTo(px,        py + ih/2);
    ctx.closePath();
    ctx.clip();

    const offset = (time * 0.025) % iw;

    // Deep water gradient base
    const bg = ctx.createLinearGradient(px, py, px + iw*0.5, py + ih);
    bg.addColorStop(0, 'hsl(210,72%,50%)');
    bg.addColorStop(0.5, 'hsl(212,68%,44%)');
    bg.addColorStop(1, 'hsl(215,64%,36%)');
    ctx.fillStyle = bg;
    ctx.fillRect(px, py, iw, ih);

    // Animated wave lines (follow iso perspective - slanted)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const waveY = py + ih*(0.2 + i*0.22) + (time*0.012 + i*0.7) % (ih*0.25);
      const waveOff = (offset + i*iw/3) % iw;
      ctx.beginPath();
      // Draw wave across diamond width at this Y
      for (let wx = 0; wx <= iw; wx += 5) {
        const wy2 = waveY + Math.sin((wx + time*0.03 + i*2) * 0.25) * 2;
        wx === 0 ? ctx.moveTo(px + wx, wy2) : ctx.lineTo(px + wx, wy2);
      }
      ctx.stroke();
    }

    // Foam dots
    const foamSeed = Math.floor(time / 400);
    for (let i = 0; i < 5; i++) {
      const rs = this._rng(foamSeed * 17 + i * 31);
      ctx.fillStyle = `rgba(255,255,255,${0.08 + rs() * 0.22})`;
      ctx.beginPath();
      ctx.arc(px + rs() * iw, py + rs() * ih, 1 + rs() * 2.5, 0, Math.PI*2);
      ctx.fill();
    }

    // Shimmer highlight (moving glint)
    const shimX = px + ((time * 0.015) % iw);
    const shimY = py + ih/2;
    const shimG = ctx.createRadialGradient(shimX, shimY, 0, shimX, shimY, 6);
    shimG.addColorStop(0, 'rgba(255,255,255,0.25)');
    shimG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shimG;
    ctx.fillRect(px, py, iw, ih);

    ctx.restore();
  },

  // ── UNITS ─────────────────────────────────────────────────

  drawUnit(ctx, wx, wy, r, color, facing, state, carryType, unitType, walkFrame = 0) {
    const isMoving = state === 'MOVING' || state === 'GATHERING' || state === 'RETURNING_RESOURCE';
    const legPhase = isMoving ? walkFrame : 0;
    switch (unitType) {
      case 'VILLAGER':  this._drawVillager(ctx, wx, wy, r, color, facing, state, carryType, legPhase); break;
      case 'MILITIA':   this._drawMilitia(ctx, wx, wy, r, color, facing, legPhase); break;
      case 'ARCHER':    this._drawArcher(ctx, wx, wy, r, color, facing, legPhase); break;
      case 'SPEARMAN':  this._drawSpearman(ctx, wx, wy, r, color, facing, legPhase); break;
      case 'KNIGHT':    this._drawKnight(ctx, wx, wy, r, color, facing, legPhase); break;
      case 'TREBUCHET': this._drawTrebuchet(ctx, wx, wy, r, color, facing); break;
      case 'WARLORD':   this._drawWarlord(ctx, wx, wy, r, color, facing, legPhase); break;
      default:          this._drawGenericUnit(ctx, wx, wy, r, color); break;
    }
  },

  _drawShadow(ctx, x, y, r) {
    const sg = ctx.createRadialGradient(x, y + r*0.8, 0, x, y + r*0.8, r*1.2);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y + r*0.8, r*1.1, r*0.4, 0, 0, Math.PI*2);
    ctx.fill();
  },

  _drawVillager(ctx, wx, wy, r, color, facing, state, carryType, legPhase = 0) {
    const s = r / 11;
    // legPhase 0-3: walking cycle offsets for left/right legs
    const legSwing = [0, s*2.5, 0, -s*2.5];
    const leftLegOY  =  legSwing[legPhase % 4];
    const rightLegOY = -legSwing[legPhase % 4];

    ctx.save();
    ctx.translate(wx, wy);

    this._drawShadow(ctx, 0, 0, r);

    // Boots (animated y offset for walking)
    ctx.fillStyle = '#3d2010';
    ctx.fillRect(-s*4.5, s*8 + leftLegOY,  s*4, s*3);
    ctx.fillRect(s*0.5,  s*8 + rightLegOY, s*4, s*3);

    // Pants (animated)
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(-s*4, s*3 + leftLegOY,  s*3.5, s*6);
    ctx.fillRect(s*0.5, s*3 + rightLegOY, s*3.5, s*6);

    // Tunic
    const bg = ctx.createLinearGradient(-s*5, -s*6, s*5, s*4);
    bg.addColorStop(0, '#c8954a');
    bg.addColorStop(1, '#a07530');
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-s*5, -s*6, s*10, s*10, s*2);
    } else {
      ctx.rect(-s*5, -s*6, s*10, s*10);
    }
    ctx.fill();

    // Belt (player color)
    ctx.fillStyle = color;
    ctx.fillRect(-s*5, s*2, s*10, s*2);

    // Left arm
    ctx.fillStyle = '#c8954a';
    ctx.fillRect(-s*8, -s*4, s*3.5, s*8);
    // Right arm
    ctx.fillRect(s*4.5, -s*4, s*3.5, s*8);

    // Neck
    ctx.fillStyle = '#d4a060';
    ctx.fillRect(-s*2, -s*8, s*4, s*3);

    // Head
    const hg = ctx.createRadialGradient(-s, -s*11, 0, 0, -s*10, s*5.5);
    hg.addColorStop(0, '#e0ac6a');
    hg.addColorStop(1, '#b87840');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, -s*10, s*5, 0, Math.PI*2);
    ctx.fill();

    // Hat brim
    ctx.fillStyle = '#d4b040';
    ctx.beginPath();
    ctx.ellipse(0, -s*14, s*7, s*2.5, 0, 0, Math.PI*2);
    ctx.fill();
    // Hat cone
    ctx.fillStyle = '#c4a030';
    ctx.beginPath();
    ctx.moveTo(-s*3.5, -s*14);
    ctx.lineTo(0, -s*22);
    ctx.lineTo(s*3.5, -s*14);
    ctx.closePath();
    ctx.fill();
    // Hat shadow line
    ctx.strokeStyle = '#a08020';
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.moveTo(-s*6, -s*14);
    ctx.lineTo(s*6, -s*14);
    ctx.stroke();

    // Tool (pickaxe)
    ctx.strokeStyle = '#6a4418';
    ctx.lineWidth = s*1.5;
    ctx.beginPath();
    ctx.moveTo(s*6, -s*2);
    ctx.lineTo(s*10, -s*10);
    ctx.stroke();
    ctx.fillStyle = '#9aaaaa';
    ctx.beginPath();
    ctx.moveTo(s*8, -s*11);
    ctx.lineTo(s*12, -s*10);
    ctx.lineTo(s*11, -s*8);
    ctx.closePath();
    ctx.fill();

    // Carrying bundle
    if (carryType) {
      let bundleColor = '#ffffff';
      if (carryType === 'wood')  bundleColor = '#8b5a2b';
      if (carryType === 'gold')  bundleColor = '#f0c040';
      if (carryType === 'stone') bundleColor = '#aaaaaa';
      if (carryType === 'food')  bundleColor = '#44aa44';
      ctx.fillStyle = bundleColor;
      ctx.beginPath();
      ctx.arc(-s*9, 0, s*3, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = s*0.8;
      ctx.beginPath();
      ctx.arc(-s*9, 0, s*3, 0, Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();
  },

  _drawMilitia(ctx, wx, wy, r, color, facing, legPhase = 0) {
    const s = r / 11;
    const legSwing = [0, s*2.5, 0, -s*2.5];
    const leftLegOY  =  legSwing[legPhase % 4];
    const rightLegOY = -legSwing[legPhase % 4];
    ctx.save();
    ctx.translate(wx, wy);

    this._drawShadow(ctx, 0, 0, r);

    // Boots / greaves (animated)
    ctx.fillStyle = '#222830';
    ctx.fillRect(-s*4, s*8 + leftLegOY,  s*3.5, s*3);
    ctx.fillRect(s*0.5, s*8 + rightLegOY, s*3.5, s*3);
    // Greaves (animated)
    ctx.fillStyle = '#6a7888';
    ctx.fillRect(-s*4, s*3 + leftLegOY,  s*3.5, s*6);
    ctx.fillRect(s*0.5, s*3 + rightLegOY, s*3.5, s*6);

    // Chainmail body
    const chainGrad = ctx.createLinearGradient(-s*5, -s*6, s*5, s*4);
    chainGrad.addColorStop(0, '#5a6070');
    chainGrad.addColorStop(1, '#3a4050');
    ctx.fillStyle = chainGrad;
    ctx.fillRect(-s*5, -s*6, s*10, s*10);
    // Player color overlay
    ctx.fillStyle = color + 'b3'; // ~70% opacity
    ctx.fillRect(-s*5, -s*6, s*10, s*4);

    // Shield (left arm)
    ctx.fillStyle = '#888';
    ctx.fillRect(-s*10, -s*6, s*2, s*8);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-s*9, -s*2, s*4, -Math.PI*0.7, Math.PI*0.7);
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = s*0.8;
    ctx.stroke();
    // Shield star emblem
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-s*9, -s*2, s*1.2, 0, Math.PI*2);
    ctx.fill();

    // Sword arm (right)
    ctx.fillStyle = '#5a6070';
    ctx.fillRect(s*4.5, -s*4, s*3, s*6);
    // Sword blade
    ctx.fillStyle = '#d0d8e0';
    ctx.fillRect(s*7, -s*10, s*1.5, s*10);
    // Crossguard
    ctx.fillStyle = '#556';
    ctx.fillRect(s*5.5, -s*4, s*4.5, s*1.5);
    // Handle
    ctx.fillStyle = '#6b3a1f';
    ctx.fillRect(s*7.2, -s*2.5, s*1.1, s*4);

    // Neck
    ctx.fillStyle = '#3a4050';
    ctx.fillRect(-s*2, -s*8, s*4, s*3);

    // Head/helmet
    const helmGrad = ctx.createRadialGradient(-s, -s*12, 0, 0, -s*11, s*6);
    helmGrad.addColorStop(0, '#8090a0');
    helmGrad.addColorStop(1, '#4a5560');
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.arc(0, -s*11, s*5.5, 0, Math.PI*2);
    ctx.fill();
    // Nasal guard
    ctx.strokeStyle = '#6a7888';
    ctx.lineWidth = s*1.2;
    ctx.beginPath();
    ctx.moveTo(0, -s*8);
    ctx.lineTo(0, -s*6);
    ctx.stroke();
    // Cheek guards
    ctx.fillStyle = '#5a6878';
    ctx.fillRect(-s*5, -s*9, s*2, s*3.5);
    ctx.fillRect(s*3, -s*9, s*2, s*3.5);
    // Plume
    ctx.strokeStyle = color;
    ctx.lineWidth = s*2;
    ctx.beginPath();
    ctx.moveTo(0, -s*16);
    ctx.lineTo(0, -s*22);
    ctx.stroke();

    ctx.restore();
  },

  _drawArcher(ctx, wx, wy, r, color, facing, legPhase = 0) {
    const s = r / 11;
    const legSwing = [0, s*2.5, 0, -s*2.5];
    const leftLegOY  =  legSwing[legPhase % 4];
    const rightLegOY = -legSwing[legPhase % 4];
    ctx.save();
    ctx.translate(wx, wy);

    this._drawShadow(ctx, 0, 0, r);

    // Boots (animated)
    ctx.fillStyle = '#3d2a12';
    ctx.fillRect(-s*4, s*8 + leftLegOY,  s*3.5, s*3);
    ctx.fillRect(s*0.5, s*8 + rightLegOY, s*3.5, s*3);
    // Leather pants (animated)
    ctx.fillStyle = '#6b4c28';
    ctx.fillRect(-s*4, s*3 + leftLegOY,  s*3.5, s*6);
    ctx.fillRect(s*0.5, s*3 + rightLegOY, s*3.5, s*6);

    // Leather jerkin
    const jg = ctx.createLinearGradient(-s*5, -s*6, s*5, s*4);
    jg.addColorStop(0, color);
    jg.addColorStop(1, '#5a4020');
    ctx.fillStyle = jg;
    ctx.fillRect(-s*5, -s*6, s*10, s*10);
    // Brown trim
    ctx.strokeStyle = '#4a3010';
    ctx.lineWidth = s;
    ctx.strokeRect(-s*5, -s*6, s*10, s*10);

    // Quiver (left back)
    ctx.fillStyle = '#6b4c28';
    ctx.fillRect(-s*8, -s*7, s*2.5, s*8);
    // Arrows in quiver
    ctx.strokeStyle = '#c8a040';
    ctx.lineWidth = s*0.7;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-s*7.5 + i*s*0.8, -s*7);
      ctx.lineTo(-s*7.5 + i*s*0.8, -s*12);
      ctx.stroke();
    }

    // Bow arms extended
    ctx.fillStyle = '#8a6030';
    ctx.fillRect(s*4, -s*8, s*3, s*5);
    ctx.fillRect(s*4, s*1, s*3, s*5);

    // Bow arc
    ctx.strokeStyle = '#6b4020';
    ctx.lineWidth = s*2;
    ctx.beginPath();
    ctx.arc(s*8, -s*2, s*6.5, -Math.PI*0.55, Math.PI*0.55);
    ctx.stroke();
    // Bowstring
    ctx.strokeStyle = 'rgba(220,200,160,0.8)';
    ctx.lineWidth = s*0.5;
    ctx.beginPath();
    ctx.moveTo(s*8, -s*8.5);
    ctx.lineTo(s*5, -s*2);
    ctx.lineTo(s*8, s*4.5);
    ctx.stroke();
    // Arrow nocked
    ctx.strokeStyle = '#c8a040';
    ctx.lineWidth = s*0.8;
    ctx.beginPath();
    ctx.moveTo(s*5, -s*2);
    ctx.lineTo(s*11, -s*4);
    ctx.stroke();

    // Neck
    ctx.fillStyle = '#c08050';
    ctx.fillRect(-s*2, -s*8, s*4, s*3);

    // Head with hood
    ctx.fillStyle = '#3a4a2a';
    ctx.beginPath();
    ctx.arc(0, -s*11, s*5.5, 0, Math.PI*2);
    ctx.fill();
    // Face showing
    ctx.fillStyle = '#c08050';
    ctx.beginPath();
    ctx.arc(s*1, -s*11, s*3.5, -Math.PI*0.6, Math.PI*0.2);
    ctx.fill();
    // Hood point
    ctx.fillStyle = '#3a4a2a';
    ctx.beginPath();
    ctx.moveTo(-s*3, -s*14);
    ctx.lineTo(s*1, -s*20);
    ctx.lineTo(s*4, -s*15);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  _drawSpearman(ctx, wx, wy, r, color, facing, legPhase = 0) {
    const s = r / 11;
    const legSwing = [0, s*2.5, 0, -s*2.5];
    const leftLegOY  =  legSwing[legPhase % 4];
    const rightLegOY = -legSwing[legPhase % 4];
    ctx.save();
    ctx.translate(wx, wy);

    this._drawShadow(ctx, 0, 0, r);

    // Dark armored boots (animated)
    ctx.fillStyle = '#202428';
    ctx.fillRect(-s*4.5, s*8 + leftLegOY,  s*4, s*3);
    ctx.fillRect(s*0.5,  s*8 + rightLegOY, s*4, s*3);
    // Greaves (animated)
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(-s*4.5, s*2 + leftLegOY,  s*4, s*7);
    ctx.fillRect(s*0.5,  s*2 + rightLegOY, s*4, s*7);

    // Heavy armor body
    const ag = ctx.createLinearGradient(-s*5, -s*8, s*5, s*4);
    ag.addColorStop(0, '#6a7888');
    ag.addColorStop(1, '#3a4550');
    ctx.fillStyle = ag;
    ctx.fillRect(-s*5, -s*8, s*10, s*11);
    // Player color highlights on shoulders
    ctx.fillStyle = color;
    ctx.fillRect(-s*6, -s*8, s*3.5, s*3);
    ctx.fillRect(s*2.5, -s*8, s*3.5, s*3);

    // Large shield left
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-s*13, -s*8, s*6, s*14, s*1.5);
    } else {
      ctx.rect(-s*13, -s*8, s*6, s*14);
    }
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = s;
    ctx.stroke();
    // Shield boss
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(-s*10, s*1, s*2, 0, Math.PI*2);
    ctx.fill();

    // Left arm holding shield
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(-s*7, -s*4, s*2.5, s*6);

    // Right arm holding spear
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(s*4.5, -s*6, s*3, s*7);

    // Spear shaft
    ctx.strokeStyle = '#7a5a2a';
    ctx.lineWidth = s*1.5;
    ctx.beginPath();
    ctx.moveTo(s*6, s*6);
    ctx.lineTo(s*3, -s*28);
    ctx.stroke();
    // Spearhead
    ctx.fillStyle = '#c0c8d0';
    ctx.beginPath();
    ctx.moveTo(s*2, -s*26);
    ctx.lineTo(s*4.5, -s*28);
    ctx.lineTo(s*7, -s*26);
    ctx.lineTo(s*4.5, -s*20);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(-s*2, -s*10, s*4, s*3);

    // Conical helmet
    ctx.fillStyle = '#7a8898';
    ctx.beginPath();
    ctx.arc(0, -s*12, s*5.5, 0, Math.PI*2);
    ctx.fill();
    // Helmet cone top
    ctx.fillStyle = '#6a7888';
    ctx.beginPath();
    ctx.moveTo(-s*4, -s*12);
    ctx.lineTo(0, -s*20);
    ctx.lineTo(s*4, -s*12);
    ctx.closePath();
    ctx.fill();
    // Nasal
    ctx.strokeStyle = '#5a6878';
    ctx.lineWidth = s*1.2;
    ctx.beginPath();
    ctx.moveTo(0, -s*8.5);
    ctx.lineTo(0, -s*6);
    ctx.stroke();

    ctx.restore();
  },

  _drawKnight(ctx, wx, wy, r, color, facing, legPhase = 0) {
    const s = r / 11;
    ctx.save();
    ctx.translate(wx, wy);

    // Shadow (larger for horse)
    const sg = ctx.createRadialGradient(0, r*0.6, 0, 0, r*0.6, r*1.8);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, r*0.7, r*1.7, r*0.5, 0, 0, Math.PI*2);
    ctx.fill();

    // Horse body
    const hbg = ctx.createLinearGradient(-s*12, -s*2, s*12, s*6);
    hbg.addColorStop(0, '#8b6040');
    hbg.addColorStop(0.5, '#6b4820');
    hbg.addColorStop(1, '#4a3010');
    ctx.fillStyle = hbg;
    ctx.beginPath();
    ctx.ellipse(0, s*2, s*12, s*6, 0, 0, Math.PI*2);
    ctx.fill();

    // Caparison (cloth over horse)
    ctx.fillStyle = color + 'cc';
    ctx.beginPath();
    ctx.ellipse(0, s*3, s*10, s*4.5, 0, 0, Math.PI*2);
    ctx.fill();

    // Horse head/neck
    const hhg = ctx.createLinearGradient(s*8, -s*4, s*15, s*4);
    hhg.addColorStop(0, '#7a5030');
    hhg.addColorStop(1, '#5a3818');
    ctx.fillStyle = hhg;
    ctx.beginPath();
    ctx.ellipse(s*12, -s*1, s*4, s*3, -0.4, 0, Math.PI*2);
    ctx.fill();
    // Nostril
    ctx.fillStyle = '#3a1808';
    ctx.beginPath();
    ctx.arc(s*15, s*0.5, s*0.8, 0, Math.PI*2);
    ctx.fill();

    // Horse legs (4) - animated gallop using legPhase
    const legColor = '#5a3818';
    const legPositions = [[-s*8, s*5], [-s*4, s*5], [s*2, s*5], [s*6, s*5]];
    const gallop = [0.4, -0.3, 0.3, -0.4];
    const phaseOffset = [0, 2, 1, 3];
    ctx.fillStyle = legColor;
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = legPositions[i];
      const phase = (legPhase + phaseOffset[i]) % 4;
      const la = phase < 2 ? gallop[i] * 0.5 : gallop[i];
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(la);
      ctx.fillRect(-s*1.2, 0, s*2.4, s*7);
      // Hoof
      ctx.fillStyle = '#2a1808';
      ctx.fillRect(-s*1.4, s*6.5, s*2.8, s*1.5);
      ctx.fillStyle = legColor;
      ctx.restore();
    }

    // Horse tail
    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = s*2;
    ctx.beginPath();
    ctx.moveTo(-s*12, s*1);
    ctx.quadraticCurveTo(-s*16, -s*2, -s*15, s*6);
    ctx.stroke();

    // Rider body (plate armor)
    const rag = ctx.createLinearGradient(-s*5, -s*14, s*5, -s*2);
    rag.addColorStop(0, color);
    rag.addColorStop(0.5, '#e0e8f0');
    rag.addColorStop(1, color);
    ctx.fillStyle = rag;
    ctx.fillRect(-s*4.5, -s*14, s*9, s*11);
    // Shoulder pads
    ctx.fillStyle = '#c0c8d4';
    ctx.fillRect(-s*7, -s*13, s*4, s*4);
    ctx.fillRect(s*3, -s*13, s*4, s*4);

    // Rider left arm
    ctx.fillStyle = '#8090a0';
    ctx.fillRect(-s*7, -s*10, s*3, s*6);
    // Rider right arm (lance)
    ctx.fillStyle = '#8090a0';
    ctx.fillRect(s*4, -s*12, s*3, s*6);

    // Lance
    ctx.strokeStyle = '#8b6030';
    ctx.lineWidth = s*1.5;
    ctx.beginPath();
    ctx.moveTo(s*5.5, -s*8);
    ctx.lineTo(s*20, -s*22);
    ctx.stroke();
    // Lance tip
    ctx.fillStyle = '#c0c8d8';
    ctx.beginPath();
    ctx.moveTo(s*18.5, -s*23.5);
    ctx.lineTo(s*20, -s*22);
    ctx.lineTo(s*21, -s*20);
    ctx.closePath();
    ctx.fill();

    // Rider head (enclosed visor helmet)
    const helg = ctx.createRadialGradient(-s, -s*19, 0, 0, -s*18, s*6);
    helg.addColorStop(0, '#909aa8');
    helg.addColorStop(1, '#4a5560');
    ctx.fillStyle = helg;
    ctx.beginPath();
    ctx.arc(0, -s*18, s*5.5, 0, Math.PI*2);
    ctx.fill();
    // Visor slit
    ctx.strokeStyle = '#202830';
    ctx.lineWidth = s*1.2;
    ctx.beginPath();
    ctx.moveTo(-s*3.5, -s*18);
    ctx.lineTo(s*3.5, -s*18);
    ctx.stroke();
    // Crest/plume
    ctx.strokeStyle = color;
    ctx.lineWidth = s*2;
    ctx.beginPath();
    ctx.moveTo(0, -s*23.5);
    ctx.lineTo(-s*2, -s*28);
    ctx.stroke();

    ctx.restore();
  },

  // ── WARLORD HERO ──────────────────────────────────────────
  _drawWarlord(ctx, wx, wy, r, color, facing, legPhase = 0) {
    const s = r / 11;
    const legSwing = [0, s*3, 0, -s*3];
    const lv = legSwing[legPhase] || 0;

    this._drawShadow(ctx, wx, wy, r * 1.2);

    // Legs (thicker than normal)
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = s * 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wx - s*2.5, wy + s*2);
    ctx.lineTo(wx - s*2.5, wy + s*8 + lv);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx + s*2.5, wy + s*2);
    ctx.lineTo(wx + s*2.5, wy + s*8 - lv);
    ctx.stroke();

    // Armored torso (larger, plate look)
    const tg = ctx.createLinearGradient(wx - s*5, wy - s*4, wx + s*5, wy + s*4);
    tg.addColorStop(0, '#888');
    tg.addColorStop(0.4, '#ccc');
    tg.addColorStop(1, '#555');
    ctx.fillStyle = tg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(wx - s*5, wy - s*8, s*10, s*10, s*1.5);
    } else {
      ctx.rect(wx - s*5, wy - s*8, s*10, s*10);
    }
    ctx.fill();

    // Player-color sash/tabard
    ctx.fillStyle = color;
    ctx.fillRect(wx - s*2, wy - s*7, s*4, s*8);

    // Shoulder pads
    ctx.fillStyle = '#aaa';
    ctx.beginPath(); ctx.ellipse(wx - s*5.5, wy - s*5, s*2.2, s*1.5, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(wx + s*5.5, wy - s*5, s*2.2, s*1.5, 0.3, 0, Math.PI*2); ctx.fill();

    // Helmet with crown-like crest
    const hg = ctx.createLinearGradient(wx - s*4, wy - s*16, wx + s*4, wy - s*9);
    hg.addColorStop(0, '#999');
    hg.addColorStop(0.5, '#ddd');
    hg.addColorStop(1, '#666');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(wx, wy - s*12, s*4.5, Math.PI, Math.PI*2);
    ctx.lineTo(wx + s*5, wy - s*9);
    ctx.lineTo(wx - s*5, wy - s*9);
    ctx.closePath();
    ctx.fill();

    // Crown spikes (hero indicator)
    ctx.fillStyle = '#f0c040';
    const crownSpikes = [-s*3.5, -s*1.5, 0, s*1.5, s*3.5];
    const crownH = [s*3, s*4, s*5, s*4, s*3];
    for (let i = 0; i < crownSpikes.length; i++) {
      ctx.beginPath();
      ctx.moveTo(wx + crownSpikes[i] - s, wy - s*16);
      ctx.lineTo(wx + crownSpikes[i], wy - s*16 - crownH[i]);
      ctx.lineTo(wx + crownSpikes[i] + s, wy - s*16);
      ctx.closePath();
      ctx.fill();
    }
    // Gold crown band
    ctx.fillStyle = '#e8b820';
    ctx.fillRect(wx - s*4.5, wy - s*16, s*9, s*1.5);

    // Visor slit
    ctx.fillStyle = '#111';
    ctx.fillRect(wx - s*3.5, wy - s*12, s*7, s*1.5);

    // Two-handed great sword
    const swordAngle = facing + 0.3;
    ctx.save();
    ctx.translate(wx + s*5, wy - s*4);
    ctx.rotate(swordAngle);
    // Blade
    ctx.fillStyle = '#d0d8e0';
    ctx.fillRect(-s*1.2, -s*16, s*2.4, s*16);
    // Crossguard
    ctx.fillStyle = '#c8a020';
    ctx.fillRect(-s*5, -s*1, s*10, s*2);
    // Pommel
    ctx.fillStyle = '#c8a020';
    ctx.beginPath(); ctx.arc(0, s*2, s*2.2, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Hero aura (subtle golden glow)
    const aura = ctx.createRadialGradient(wx, wy - s*4, r*0.5, wx, wy - s*4, r*1.8);
    aura.addColorStop(0, 'rgba(255,200,30,0.12)');
    aura.addColorStop(1, 'rgba(255,200,30,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(wx, wy - s*4, r*1.8, r*2.4, 0, 0, Math.PI*2);
    ctx.fill();
  },

  _drawTrebuchet(ctx, wx, wy, r, color, facing) {
    const s = r / 11;
    ctx.save();
    ctx.translate(wx, wy);

    this._drawShadow(ctx, 0, 0, r * 1.5);

    // Large wheels
    const wheelPositions = [-s*9, s*9];
    for (const wx2 of wheelPositions) {
      // Wheel outer
      ctx.strokeStyle = '#4a3010';
      ctx.lineWidth = s*2.5;
      ctx.beginPath();
      ctx.arc(wx2, s*8, s*5, 0, Math.PI*2);
      ctx.stroke();
      // Spokes
      ctx.strokeStyle = '#6a4820';
      ctx.lineWidth = s*1.2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(wx2, s*8);
        ctx.lineTo(wx2 + Math.cos(a) * s*4.5, s*8 + Math.sin(a) * s*4.5);
        ctx.stroke();
      }
      // Hub
      ctx.fillStyle = '#3a2008';
      ctx.beginPath();
      ctx.arc(wx2, s*8, s*1.5, 0, Math.PI*2);
      ctx.fill();
    }

    // Base platform
    ctx.fillStyle = '#5a3a18';
    ctx.fillRect(-s*11, s*3, s*22, s*5);
    ctx.strokeStyle = '#3a2008';
    ctx.lineWidth = s;
    ctx.strokeRect(-s*11, s*3, s*22, s*5);

    // A-frame supports
    ctx.strokeStyle = '#5a3a18';
    ctx.lineWidth = s*3;
    ctx.beginPath();
    ctx.moveTo(-s*9, s*3);
    ctx.lineTo(-s*3, -s*10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s*9, s*3);
    ctx.lineTo(s*3, -s*10);
    ctx.stroke();

    // Cross-beam
    ctx.fillStyle = '#6a4a28';
    ctx.fillRect(-s*6, -s*11, s*12, s*2);

    // Pivot arm - long on front, short on back
    const pivotAngle = -0.4;
    ctx.save();
    ctx.translate(0, -s*10);
    ctx.rotate(pivotAngle);
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(-s*4, -s*2, s*20, s*2.5); // long sling end
    ctx.fillRect(-s*10, -s*2, s*6, s*2.5); // short counterweight end
    ctx.restore();

    // Counterweight
    ctx.save();
    ctx.translate(-s*10*Math.cos(-pivotAngle+Math.PI*0.5), -s*10 + s*10*Math.sin(-pivotAngle+Math.PI*0.5));
    ctx.fillStyle = '#2a2020';
    ctx.fillRect(-s*3, 0, s*6, s*5);
    ctx.restore();

    // Sling (thin curved line from arm tip)
    ctx.strokeStyle = 'rgba(180,150,100,0.7)';
    ctx.lineWidth = s*0.6;
    ctx.beginPath();
    const armTipX = s*16 * Math.cos(pivotAngle - Math.PI*0.5);
    const armTipY = -s*10 + s*16 * Math.sin(pivotAngle - Math.PI*0.5);
    ctx.moveTo(armTipX, armTipY);
    ctx.quadraticCurveTo(armTipX + s*3, armTipY + s*5, armTipX + s*1, armTipY + s*9);
    ctx.stroke();

    // Player color flag/banner
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s*2, -s*14);
    ctx.lineTo(-s*2, -s*10);
    ctx.lineTo(s*4, -s*12);
    ctx.closePath();
    ctx.fill();
    // Flag pole
    ctx.strokeStyle = '#6a4a28';
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.moveTo(-s*2, -s*8);
    ctx.lineTo(-s*2, -s*16);
    ctx.stroke();

    ctx.restore();
  },

  _drawGenericUnit(ctx, wx, wy, r, color) {
    ctx.save();
    this._drawShadow(ctx, wx, wy, r);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  },

  // ── BUILDINGS ─────────────────────────────────────────────
  // All buildings are drawn as isometric 3D boxes with:
  //   - Top face (flat roof, slightly tinted)
  //   - Left face (west-facing wall, medium lit)
  //   - Right face (south-facing wall, slightly darker)

  // isoTL = top-left tile iso world pos, isoCenter = center iso pos
  drawBuilding(ctx, building, camera, isoTL, isoCenter) {
    const color = PLAYER_COLORS[building.playerId];
    const sz = building.size;
    // Building visual height (in iso units) - bigger buildings are taller
    const heightU = sz * ISO_TILE_H * (building.type === 'TOWN_CENTER' ? 1.8 :
                    building.type === 'TOWER' ? 2.4 :
                    building.type === 'BARRACKS' ? 1.4 :
                    building.type === 'STABLE' ? 1.2 :
                    building.type === 'ARCHERY_RANGE' ? 1.3 :
                    building.type === 'SIEGE_WORKSHOP' ? 1.4 :
                    building.type === 'BLACKSMITH' ? 1.3 :
                    building.type === 'FARM' ? 0.3 :
                    building.type === 'WALL' ? 0.8 : 1.0);

    // Ground shadow: soft ellipse cast to the SE (away from NW light source)
    if (building.type !== 'FARM' && building.type !== 'WALL') {
      const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;
      const shadowCX = isoTL.x + iw * 0.82;
      const shadowCY = isoTL.y + ih * 0.78;
      const shadowRX = iw * 0.72 * (building.type === 'TOWN_CENTER' ? 1.2 : 0.95);
      const shadowRY = ih * 0.32 * (building.type === 'TOWN_CENTER' ? 1.2 : 0.95);
      const sg = ctx.createRadialGradient(shadowCX, shadowCY, 0, shadowCX, shadowCY, shadowRX);
      sg.addColorStop(0, 'rgba(0,0,0,0.28)');
      sg.addColorStop(0.6, 'rgba(0,0,0,0.14)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(shadowCX, shadowCY, shadowRX, shadowRY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Fade if under construction
    if (!building.built) {
      ctx.globalAlpha = 0.35 + (building.buildProgress / 100) * 0.65;
    }

    switch (building.type) {
      case 'TOWN_CENTER':    this._drawIsoTownCenter(ctx, isoTL, sz, heightU, color); break;
      case 'HOUSE':          this._drawIsoHouse(ctx, isoTL, sz, heightU, color); break;
      case 'BARRACKS':       this._drawIsoBarracks(ctx, isoTL, sz, heightU, color); break;
      case 'ARCHERY_RANGE':  this._drawIsoArcheryRange(ctx, isoTL, sz, heightU, color); break;
      case 'STABLE':         this._drawIsoStable(ctx, isoTL, sz, heightU, color); break;
      case 'BLACKSMITH':     this._drawIsoBlacksmith(ctx, isoTL, sz, heightU, color); break;
      case 'LUMBER_CAMP':    this._drawIsoLumberCamp(ctx, isoTL, sz, heightU, color); break;
      case 'MINING_CAMP':    this._drawIsoMiningCamp(ctx, isoTL, sz, heightU, color); break;
      case 'MILL':           this._drawIsoMill(ctx, isoTL, sz, heightU, color); break;
      case 'FARM':           this._drawIsoFarm(ctx, isoTL, sz, color); break;
      case 'TOWER':          this._drawIsoTower(ctx, isoTL, sz, heightU, color); break;
      case 'WALL':           this._drawIsoWall(ctx, isoTL, sz, heightU, color); break;
      case 'SIEGE_WORKSHOP': this._drawIsoSiegeWorkshop(ctx, isoTL, sz, heightU, color); break;
      default:               this._drawIsoGeneric(ctx, isoTL, sz, heightU, color); break;
    }

    ctx.globalAlpha = 1;
  },

  // ── ISO BOX HELPER ─────────────────────────────────────────
  // Draw an isometric 3D box at tile top-left iso position
  // tileX/tileY = starting tile, sz = tile size, height = pixel height
  // Colors: top (lit), left (medium), right (dark)
  _isoBox(ctx, isoTL, sz, height,
    topColor, leftColor, rightColor,
    borderColor = 'rgba(0,0,0,0.4)') {
    const iw = ISO_TILE_W * sz;
    const ih = ISO_TILE_H * sz;
    const tlx = isoTL.x, tly = isoTL.y;
    const h = height;

    // Top diamond vertices (raised by h above the tile top-left)
    const t0 = { x: tlx + iw/2, y: tly - h };        // top-tip
    const t1 = { x: tlx + iw,   y: tly + ih/2 - h }; // right-tip
    const t2 = { x: tlx + iw/2, y: tly + ih - h };   // bot-tip
    const t3 = { x: tlx,        y: tly + ih/2 - h }; // left-tip

    // Bottom vertices (walls go straight down by h to ground)
    const b0 = { x: t0.x, y: t0.y + h };
    const b1 = { x: t1.x, y: t1.y + h };
    const b2 = { x: t2.x, y: t2.y + h };
    const b3 = { x: t3.x, y: t3.y + h };

    // Left wall (t3 → t2 → b2 → b3)
    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(t3.x, t3.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.closePath();
    ctx.fill();
    // Stone mortar lines on left wall (horizontal rows follow iso slope)
    if (h > 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.6;
      const rows = Math.max(2, Math.floor(h / 7));
      for (let ri = 1; ri < rows; ri++) {
        const f = ri / rows;
        ctx.beginPath();
        ctx.moveTo(t3.x, t3.y + f * h);
        ctx.lineTo(t2.x, t2.y + f * h);
        ctx.stroke();
      }
      // Vertical brick joints on left wall
      const cols = 3;
      for (let row = 0; row < rows; row++) {
        const f1 = row / rows, f2 = (row + 1) / rows;
        const offset = row % 2 === 0 ? 0 : 0.5;
        for (let col = 1; col < cols; col++) {
          const fx = (col + offset) / cols;
          if (fx <= 0 || fx >= 1) continue;
          ctx.beginPath();
          ctx.moveTo(t3.x + (t2.x - t3.x) * fx, t3.y + (t2.y - t3.y) * fx + f1 * h);
          ctx.lineTo(t3.x + (t2.x - t3.x) * fx, t3.y + (t2.y - t3.y) * fx + f2 * h);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(t3.x, t3.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.closePath();
    ctx.stroke();

    // Right wall (t2 → t1 → b1 → b2)
    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(t2.x, t2.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.fill();
    // Stone mortar lines on right wall
    if (h > 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.6;
      const rows = Math.max(2, Math.floor(h / 7));
      for (let ri = 1; ri < rows; ri++) {
        const f = ri / rows;
        ctx.beginPath();
        ctx.moveTo(t2.x, t2.y + f * h);
        ctx.lineTo(t1.x, t1.y + f * h);
        ctx.stroke();
      }
      // Vertical joints on right wall
      const cols = 3;
      for (let row = 0; row < rows; row++) {
        const f1 = row / rows, f2 = (row + 1) / rows;
        const offset = row % 2 === 0 ? 0.5 : 0;
        for (let col = 1; col < cols; col++) {
          const fx = (col + offset) / cols;
          if (fx <= 0 || fx >= 1) continue;
          ctx.beginPath();
          ctx.moveTo(t2.x + (t1.x - t2.x) * fx, t2.y + (t1.y - t2.y) * fx + f1 * h);
          ctx.lineTo(t2.x + (t1.x - t2.x) * fx, t2.y + (t1.y - t2.y) * fx + f2 * h);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(t2.x, t2.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.stroke();

    // Top face (t0 → t1 → t2 → t3)
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Return vertices for decoration
    return { t0, t1, t2, t3, b0, b1, b2, b3 };
  },

  // Draw a flag/banner on top of an iso box
  _isoFlag(ctx, topTip, color, height) {
    const flagH = height * 0.5;
    const poleX = topTip.x, poleTopY = topTip.y - flagH - 4;
    // Pole
    ctx.strokeStyle = '#8b6a40';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(poleX, topTip.y);
    ctx.lineTo(poleX, poleTopY);
    ctx.stroke();
    // Flag triangle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(poleX, poleTopY);
    ctx.lineTo(poleX + 10, poleTopY + 4);
    ctx.lineTo(poleX, poleTopY + 8);
    ctx.closePath();
    ctx.fill();
  },

  _drawIsoTownCenter(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;

    // Front-right corner tower (draws first, behind main keep)
    const tSz = sz * 0.45;
    const tH  = h * 1.35;
    const frontTower = { x: isoTL.x + iw * 0.55, y: isoTL.y + ih * 0.35 };
    this._isoBox(ctx, frontTower, tSz, tH, '#d2c4a4', '#a89878', '#887858');
    this._drawCrenellations(ctx, frontTower, tSz, tH, '#b8aa88', 3);

    // Main keep body
    const v = this._isoBox(ctx, isoTL, sz, h,
      '#c8ba9a',  // top: warm lit stone
      '#9e8e74',  // left: stone shadow
      '#7e6e54'   // right: darkest stone
    );

    // Back-left tower (draws on top = visually in front on left side)
    const backTower = { x: isoTL.x - iw * 0.08, y: isoTL.y + ih * 0.05 };
    this._isoBox(ctx, backTower, tSz, tH, '#d2c4a4', '#a89878', '#887858');
    this._drawCrenellations(ctx, backTower, tSz, tH, '#b8aa88', 3);

    // Crenellations on main keep
    this._drawCrenellations(ctx, isoTL, sz, h, '#b0a282', 5);

    // Gate arch on right wall face
    const gateW = iw * 0.14, gateH = h * 0.48;
    const wallMidX = lerp(v.t2.x, v.t1.x, 0.5);
    const wallMidY = lerp(v.t2.y, v.t1.y, 0.5);
    const gateX = wallMidX - gateW/2;
    const gateY = wallMidY - gateH + h * 0.5;
    ctx.fillStyle = '#1e1006';
    ctx.fillRect(gateX, gateY, gateW, gateH);
    ctx.beginPath();
    ctx.arc(gateX + gateW/2, gateY, gateW/2, Math.PI, 0);
    ctx.fill();
    // Iron portcullis bars
    ctx.strokeStyle = 'rgba(60,50,40,0.7)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(gateX + (gateW/4)*i, gateY);
      ctx.lineTo(gateX + (gateW/4)*i, gateY + gateH);
      ctx.stroke();
    }

    // Windows on right wall (arrow slits)
    ctx.fillStyle = 'rgba(30,18,5,0.85)';
    for (const fx of [0.22, 0.7]) {
      const wx2 = lerp(v.t2.x, v.t1.x, fx) - 2;
      const wy2 = lerp(v.t2.y, v.t1.y, fx) + h * 0.08;
      ctx.fillRect(wx2, wy2, 3, h * 0.22);
    }

    // Player color banner across front
    ctx.fillStyle = color + 'cc';
    ctx.fillRect(wallMidX - gateW*1.2, wallMidY - h*0.3, gateW*2.4, h*0.12);

    // Flags on both towers
    this._isoFlag(ctx, { x: frontTower.x + ISO_TILE_W*tSz*0.5, y: frontTower.y - tH }, color, tH * 0.4);
    this._isoFlag(ctx, { x: backTower.x + ISO_TILE_W*tSz*0.5, y: backTower.y - tH }, color, tH * 0.4);
  },

  // Helper: draw crenellations along top edge of iso box
  _drawCrenellations(ctx, isoTL, sz, h, color, count) {
    const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;
    const tlx = isoTL.x, tly = isoTL.y;
    const crenH = h * 0.15;
    ctx.fillStyle = color;
    // Along right top edge (t0 → t1)
    const t0 = { x: tlx + iw/2, y: tly - h };
    const t1 = { x: tlx + iw,   y: tly + ih/2 - h };
    const t3 = { x: tlx,        y: tly + ih/2 - h };
    for (let i = 0; i < count; i++) {
      const fi = (i + 0.15) / count;
      const mx = lerp(t0.x, t1.x, fi);
      const my = lerp(t0.y, t1.y, fi) - crenH;
      ctx.fillRect(mx - 2, my, 4, crenH + 1);
    }
    // Along left top edge (t0 → t3)
    const lcount = Math.max(2, count - 1);
    for (let i = 0; i < lcount; i++) {
      const fi = (i + 0.15) / lcount;
      const mx = lerp(t0.x, t3.x, fi);
      const my = lerp(t0.y, t3.y, fi) - crenH;
      ctx.fillRect(mx - 2, my, 4, crenH + 1);
    }
  },

  _drawIsoHouse(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;
    // Base walls
    const v = this._isoBox(ctx, isoTL, sz, h * 0.65,
      '#d4c4a0',  // top: light plaster
      '#b0a080',  // left wall
      '#907860'   // right wall darker
    );
    // Triangular roof on top (isometric gabled)
    // Roof ridge runs left-right through tile center
    const roofH = h * 0.45;
    const ridgeTL = { x: v.t3.x + iw*0.08, y: v.t3.y - roofH };
    const ridgeTR = { x: v.t1.x - iw*0.08, y: v.t1.y - roofH };
    const ridgeCL = { x: v.t0.x,           y: v.t0.y - roofH * 0.5 };
    const ridgeCR = { x: v.t2.x,           y: v.t2.y - roofH * 0.5 };
    // Left roof face
    ctx.fillStyle = '#8b5a28';
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y);
    ctx.lineTo(v.t3.x, v.t3.y);
    ctx.lineTo(ridgeTL.x, ridgeTL.y);
    ctx.lineTo(ridgeCL.x, ridgeCL.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Right roof face
    ctx.fillStyle = '#6a4020';
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y);
    ctx.lineTo(v.t1.x, v.t1.y);
    ctx.lineTo(ridgeTR.x, ridgeTR.y);
    ctx.lineTo(ridgeCL.x, ridgeCL.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Chimney stub
    ctx.fillStyle = '#7a6858';
    const chX = v.t0.x + 6, chY = ridgeCL.y - 10;
    ctx.fillRect(chX - 3, chY, 6, 12);
    // Smoke
    ctx.fillStyle = 'rgba(180,180,180,0.25)';
    ctx.beginPath();
    ctx.arc(chX, chY - 4, 4, 0, Math.PI*2);
    ctx.fill();
    // Player color window shutters
    ctx.fillStyle = color + 'aa';
    ctx.fillRect(v.t1.x - iw*0.22, v.t1.y - h*0.25, 6, 9);
  },

  _drawIsoBarracks(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    const v = this._isoBox(ctx, isoTL, sz, h,
      '#8a8272',  // top: dark slate
      '#6e6460',  // left wall stone
      '#524c44'   // right wall darker
    );
    this._drawCrenellations(ctx, isoTL, sz, h, '#604e44', 4);
    // Heavy arched door
    const dw = iw * 0.13, dh = h * 0.48;
    const dx = (v.t2.x + v.t1.x)/2 - dw/2;
    const dy = (v.t2.y + v.t1.y)/2 - dh + h * 0.52;
    ctx.fillStyle = '#140c04';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.beginPath();
    ctx.arc(dx + dw/2, dy, dw/2, Math.PI, 0);
    ctx.fill();
    // Arrow slits on right wall
    ctx.fillStyle = 'rgba(10,8,5,0.9)';
    const slitH = h * 0.22, slitW = 3;
    ctx.fillRect(dx - iw*0.12, dy - h*0.05, slitW, slitH);
    ctx.fillRect(dx + dw + iw*0.06, dy - h*0.05, slitW, slitH);
    // Player banner
    this._isoFlag(ctx, v.t0, color, h);
  },

  _drawIsoArcheryRange(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;
    const v = this._isoBox(ctx, isoTL, sz, h * 0.72,
      '#c8a860',  // top: warm wood
      '#a08848',  // left face
      '#806830'   // right face
    );
    // Thatched roof ridge line across top
    ctx.strokeStyle = '#5a3010';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y - 2);
    ctx.lineTo(v.t1.x, v.t1.y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y - 2);
    ctx.lineTo(v.t3.x, v.t3.y - 2);
    ctx.stroke();
    // Archery target on right wall: concentric rings
    const tx2 = lerp(v.t2.x, v.t1.x, 0.55);
    const ty2 = lerp(v.t2.y, v.t1.y, 0.55) + h * 0.15;
    const tr = h * 0.14;
    ctx.fillStyle = '#f0f0e0'; ctx.beginPath(); ctx.arc(tx2, ty2, tr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d03020'; ctx.beginPath(); ctx.arc(tx2, ty2, tr*0.7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f0f0e0'; ctx.beginPath(); ctx.arc(tx2, ty2, tr*0.45, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d03020'; ctx.beginPath(); ctx.arc(tx2, ty2, tr*0.22, 0, Math.PI*2); ctx.fill();
    // Arrow embedded in target
    ctx.strokeStyle = '#5a2808'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tx2 - tr*0.6, ty2 - 1); ctx.lineTo(tx2 + tr*0.3, ty2 - 1); ctx.stroke();
    // Open-frame posts above roof for training yard feel
    ctx.strokeStyle = '#6a4020';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(v.t0.x, v.t0.y); ctx.lineTo(v.t0.x, v.t0.y - h*0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v.t1.x, v.t1.y); ctx.lineTo(v.t1.x, v.t1.y - h*0.3); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(v.t0.x, v.t0.y - h*0.3); ctx.lineTo(v.t1.x, v.t1.y - h*0.3); ctx.stroke();
    this._isoFlag(ctx, v.t0, color, h * 0.9);
  },

  _drawIsoStable(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    const v = this._isoBox(ctx, isoTL, sz, h * 0.85,
      '#b88850',  // top: wood planks
      '#907040',  // left face
      '#6a5028'   // right face darker
    );
    // Thatched peaked roof (triangle above the box walls)
    const roofH = h * 0.35;
    const ridgeX = (v.t0.x + v.t1.x) / 2, ridgeY = v.t0.y - roofH;
    ctx.fillStyle = '#8b5e28';  // dark thatch
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y); ctx.lineTo(v.t1.x, v.t1.y);
    ctx.lineTo(ridgeX, ridgeY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a4018';  // left slope darker
    ctx.beginPath();
    ctx.moveTo(v.t0.x, v.t0.y); ctx.lineTo(v.t3.x, v.t3.y);
    ctx.lineTo(ridgeX, ridgeY); ctx.closePath(); ctx.fill();
    // Ridge cap
    ctx.strokeStyle = '#4a2c10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(v.t3.x, v.t3.y); ctx.lineTo(ridgeX, ridgeY); ctx.lineTo(v.t1.x, v.t1.y); ctx.stroke();
    // Stall doors on right face
    for (let i = 0; i < 2; i++) {
      const fi = (i + 0.28) / 2;
      const sx = lerp(v.t2.x, v.t1.x, fi), sy = lerp(v.t2.y, v.t1.y, fi);
      ctx.fillStyle = '#2e1808';
      ctx.fillRect(sx - 4, sy + h*0.1, 7, h * 0.46);
      // Top split of Dutch door
      ctx.fillStyle = '#4a2a10';
      ctx.fillRect(sx - 4, sy + h*0.1, 7, h * 0.18);
    }
    // Hay bale (golden ellipse near base)
    ctx.fillStyle = '#d4b028';
    ctx.beginPath(); ctx.ellipse(v.t2.x + 4, v.t2.y - 3, 7, 3.5, 0.1, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#a88020'; ctx.lineWidth = 0.8; ctx.stroke();
  },

  _drawIsoBlacksmith(ctx, isoTL, sz, h, color) {
    const v = this._isoBox(ctx, isoTL, sz, h,
      '#7a7068',  // top: dark stone
      '#5a5050',  // left
      '#3a3838'   // right
    );
    // Chimney on top
    const chX = v.t0.x + 5, chBaseY = v.t0.y;
    ctx.fillStyle = '#6a6060';
    ctx.fillRect(chX - 4, chBaseY - h * 0.5, 8, h * 0.5);
    // Forge glow on right face
    ctx.save();
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,120,20,0.5)';
    const gx = (v.t2.x + v.t1.x)/2 - 5;
    const gy = (v.t2.y + v.t1.y)/2;
    ctx.fillRect(gx, gy, 10, h * 0.4);
    ctx.restore();
    // Smoke puffs
    ctx.fillStyle = 'rgba(120,120,120,0.4)';
    ctx.beginPath(); ctx.arc(chX, chBaseY - h*0.5 - 5, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(chX+2, chBaseY - h*0.5 - 11, 3, 0, Math.PI*2); ctx.fill();
  },

  _drawIsoLumberCamp(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    const v = this._isoBox(ctx, isoTL, sz, h * 0.8,
      '#b89058',  // top wood
      '#907040',  // left
      '#705028'   // right
    );
    // Saw frame on the right face (A-frame structure)
    const rx2 = lerp(v.t2.x, v.t1.x, 0.5), ry2 = lerp(v.t2.y, v.t1.y, 0.5);
    ctx.strokeStyle = '#4a2808'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx2 - iw*0.08, ry2 + h*0.2); ctx.lineTo(rx2, ry2 - h*0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx2 + iw*0.06, ry2 + h*0.2); ctx.lineTo(rx2, ry2 - h*0.1); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rx2 - iw*0.06, ry2 + h*0.05); ctx.lineTo(rx2 + iw*0.04, ry2 + h*0.07); ctx.stroke();
    // Log pile stacked on left face — 3 logs with end circles
    for (let i = 0; i < 3; i++) {
      const ly = v.t3.y + h*(0.15 + i*0.22);
      ctx.fillStyle = '#4a2c10';
      ctx.beginPath();
      ctx.ellipse(v.t3.x + 7, ly, 9, 5, -0.15, 0, Math.PI*2);
      ctx.fill();
      // Bark rings
      ctx.strokeStyle = '#2e1a08'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(v.t3.x + 7, ly, 9, 5, -0.15, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(v.t3.x + 7, ly, 5, 3, -0.15, 0, Math.PI*2); ctx.stroke();
      // Tree ring center
      ctx.fillStyle = '#3a2208';
      ctx.beginPath(); ctx.arc(v.t3.x + 7, ly, 1.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fillRect(v.t0.x - 3, v.t0.y - 10, 8, 5);
  },

  _drawIsoMiningCamp(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    const v = this._isoBox(ctx, isoTL, sz, h * 0.85,
      '#9a9080',  // stone top
      '#7a7060',  // left
      '#5a5040'   // right
    );
    // Mine shaft entrance arch on right wall
    const mx = lerp(v.t2.x, v.t1.x, 0.45), my = lerp(v.t2.y, v.t1.y, 0.45);
    const archW = h * 0.18, archH = h * 0.42;
    ctx.fillStyle = '#100808';
    ctx.fillRect(mx - archW/2, my + h*0.05, archW, archH);
    ctx.beginPath(); ctx.arc(mx, my + h*0.05, archW/2, Math.PI, 0); ctx.fill();
    // Mine cart support beam across arch top
    ctx.strokeStyle = '#5a3c20'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx - archW/2 - 2, my + h*0.05); ctx.lineTo(mx + archW/2 + 2, my + h*0.08); ctx.stroke();
    // Gold/stone ore chunks on left face
    const oreColors = ['#c8a030', '#a09090', '#c8a030'];
    for (let i = 0; i < 3; i++) {
      const fi = (i + 0.5) / 3;
      const ox = lerp(v.t3.x, v.t2.x, fi);
      const oy = lerp(v.t3.y, v.t2.y, fi) + h * 0.45;
      ctx.fillStyle = oreColors[i];
      ctx.beginPath(); ctx.arc(ox + 4, oy, 4.5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    // Winch post above
    ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(v.t0.x, v.t0.y); ctx.lineTo(v.t0.x, v.t0.y - h*0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v.t0.x - 8, v.t0.y - h*0.35); ctx.lineTo(v.t0.x + 8, v.t0.y - h*0.35); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(v.t0.x - 3, v.t0.y - h*0.35 - 6, 8, 5);
  },

  _drawIsoMill(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    const v = this._isoBox(ctx, isoTL, sz, h,
      '#c8a870',  // top: warm stone
      '#a08850',  // left
      '#806638'   // right
    );
    // Mill windmill sails — prominent cross frame on front face
    const scx = lerp(v.t2.x, v.t1.x, 0.5) + 4;
    const scy = lerp(v.t2.y, v.t1.y, 0.5) - h * 0.15;
    const sailLen = h * 0.5;
    // Hub
    ctx.fillStyle = '#4a2c10';
    ctx.beginPath(); ctx.arc(scx, scy, 4, 0, Math.PI*2); ctx.fill();
    // 4 sail arms
    const angles = [Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75];
    for (const a of angles) {
      const ex = scx + Math.cos(a) * sailLen;
      const ey = scy + Math.sin(a) * sailLen * 0.6;
      ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(scx, scy); ctx.lineTo(ex, ey); ctx.stroke();
      // Sail canvas fill (trapezoid)
      const pw = 5;
      ctx.fillStyle = 'rgba(240,220,160,0.75)';
      ctx.beginPath();
      ctx.moveTo(scx + Math.cos(a + 1.2)*pw, scy + Math.sin(a + 1.2)*pw*0.6);
      ctx.lineTo(ex + Math.cos(a + 1.2)*pw*2, ey + Math.sin(a + 1.2)*pw*1.2);
      ctx.lineTo(ex + Math.cos(a - 1.2)*pw*2, ey + Math.sin(a - 1.2)*pw*1.2);
      ctx.lineTo(scx + Math.cos(a - 1.2)*pw, scy + Math.sin(a - 1.2)*pw*0.6);
      ctx.closePath(); ctx.fill();
    }
    // Re-draw hub on top
    ctx.fillStyle = '#3a2008';
    ctx.beginPath(); ctx.arc(scx, scy, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(scx, scy, 2, 0, Math.PI*2); ctx.fill();
  },

  _drawIsoFarm(ctx, isoTL, sz, color) {
    const iw = ISO_TILE_W * sz, ih = ISO_TILE_H * sz;
    const tlx = isoTL.x, tly = isoTL.y;
    // Flat farm field - plowed rows within diamond
    const farmBg = ctx.createLinearGradient(tlx, tly, tlx + iw, tly + ih);
    farmBg.addColorStop(0, '#8a6840');
    farmBg.addColorStop(1, '#6a5030');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tlx + iw/2, tly);
    ctx.lineTo(tlx + iw, tly + ih/2);
    ctx.lineTo(tlx + iw/2, tly + ih);
    ctx.lineTo(tlx, tly + ih/2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = farmBg;
    ctx.fillRect(tlx, tly, iw, ih);
    // Row stripes
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(tlx + (iw/5)*i, tly);
      ctx.lineTo(tlx + (iw/5)*i, tly + ih);
      ctx.stroke();
    }
    // Crop dots
    ctx.fillStyle = '#5a8820';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const cx2 = tlx + iw * (0.15 + col*0.22);
        const cy2 = tly + ih * (0.25 + row*0.28);
        ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI*2); ctx.fill();
      }
    }
    // Fence
    ctx.strokeStyle = '#7a5030';
    ctx.lineWidth = 2;
    ctx.strokeRect(tlx, tly, iw, ih);
    ctx.restore();
  },

  _drawIsoTower(ctx, isoTL, sz, h, color) {
    const iw = ISO_TILE_W * sz;
    // Slightly narrower tower
    const inset = iw * 0.08;
    const towerIso = { x: isoTL.x + inset, y: isoTL.y + inset*0.5 };
    const towerSz = sz * 0.84;
    const v = this._isoBox(ctx, towerIso, towerSz, h,
      '#b4a894',  // top
      '#8a8272',  // left
      '#6a6252'   // right
    );
    this._drawCrenellations(ctx, towerIso, towerSz, h, '#9a9080', 4);
    // Two arrow slits on right wall
    ctx.fillStyle = 'rgba(15,10,5,0.92)';
    for (const fx of [0.3, 0.7]) {
      const sx = lerp(v.t2.x, v.t1.x, fx) - 2;
      const sy = lerp(v.t2.y, v.t1.y, fx) + h * 0.08;
      // Cross-shaped arrow slit
      ctx.fillRect(sx, sy, 4, h * 0.28);
      ctx.fillRect(sx - 3, sy + h * 0.1, 10, h * 0.08);
    }
    // Torch glow at top
    ctx.fillStyle = 'rgba(255,160,40,0.35)';
    ctx.beginPath();
    ctx.arc(v.t0.x, v.t0.y - 4, 5, 0, Math.PI*2);
    ctx.fill();
  },

  _drawIsoWall(ctx, isoTL, sz, h, color) {
    this._isoBox(ctx, isoTL, sz, h,
      '#9e9282',  // top stone
      '#7a7060',  // left
      '#5c5648'   // right
    );
    this._drawCrenellations(ctx, isoTL, sz, h, '#8a8270', 3);
  },

  _drawIsoSiegeWorkshop(ctx, isoTL, sz, h, color) {
    const v = this._isoBox(ctx, isoTL, sz, h,
      '#7a6858',  // top
      '#5a5048',  // left
      '#3a3830'   // right
    );
    // Large workshop door
    const dw = ISO_TILE_W * sz * 0.2, dh = h * 0.55;
    const dx = (v.t2.x + v.t1.x)/2 - dw/2;
    const dy = (v.t2.y + v.t1.y)/2 - dh + h;
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(dx, dy, dw, dh);
    // Trebuchet silhouette inside opening
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(dx + dw*0.3, dy + dh*0.1, dw*0.1, dh * 0.6);
    ctx.fillRect(dx + dw*0.1, dy + dh*0.2, dw*0.8, dh*0.1);
    this._isoFlag(ctx, v.t0, color, h);
  },

  _drawIsoGeneric(ctx, isoTL, sz, h, color) {
    this._isoBox(ctx, isoTL, sz, h,
      color + 'dd',
      '#8a8070',
      '#605848'
    );
  },

  _drawTownCenter(ctx, wx, wy, pw, ph, color) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(wx + 6, wy + 6, pw, ph);

    // Stone foundation
    const stoneGrad = ctx.createLinearGradient(wx, wy, wx + pw, wy + ph);
    stoneGrad.addColorStop(0, '#9a8a70');
    stoneGrad.addColorStop(0.5, '#b8a888');
    stoneGrad.addColorStop(1, '#8a7a60');
    ctx.fillStyle = stoneGrad;
    ctx.fillRect(wx, wy, pw, ph);

    // Horizontal stone lines (facade texture)
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    for (let y = wy + 8; y < wy + ph; y += 10) {
      ctx.beginPath();
      ctx.moveTo(wx, y);
      ctx.lineTo(wx + pw, y);
      ctx.stroke();
    }

    // Right tower
    const tw = pw * 0.22;
    const tg = ctx.createLinearGradient(wx + pw - tw, wy, wx + pw, wy + ph);
    tg.addColorStop(0, '#8a7a68');
    tg.addColorStop(1, '#6a5a48');
    ctx.fillStyle = tg;
    ctx.fillRect(wx + pw - tw, wy - ph*0.1, tw, ph*1.1);
    // Left tower
    ctx.fillStyle = tg;
    ctx.fillRect(wx, wy - ph*0.05, tw, ph*1.05);

    // Crenelations along top
    ctx.fillStyle = '#7a6a58';
    const crenW = pw / 9;
    for (let i = 0; i < 9; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(wx + i*crenW, wy - ph*0.08, crenW, ph*0.1);
      }
    }

    // Gate/door
    ctx.fillStyle = '#3a2010';
    const gateW = pw * 0.2;
    const gateH = ph * 0.3;
    const gateX = wx + pw/2 - gateW/2;
    const gateY = wy + ph - gateH;
    ctx.fillRect(gateX, gateY, gateW, gateH);
    // Gate arch
    ctx.beginPath();
    ctx.arc(gateX + gateW/2, gateY, gateW/2, Math.PI, 0);
    ctx.fill();

    // Windows
    ctx.fillStyle = 'rgba(60,40,10,0.8)';
    const winPositions = [
      [wx + pw*0.25, wy + ph*0.2, pw*0.08, ph*0.14],
      [wx + pw*0.45, wy + ph*0.2, pw*0.08, ph*0.14],
      [wx + pw*0.65, wy + ph*0.2, pw*0.08, ph*0.14],
    ];
    for (const [wx2, wy2, ww, wh] of winPositions) {
      ctx.fillRect(wx2, wy2, ww, wh);
    }

    // Player color banner on front
    ctx.fillStyle = color;
    const banW = pw * 0.1;
    const banH = ph * 0.2;
    const banX = wx + pw*0.4;
    const banY = wy + ph*0.45;
    ctx.fillRect(banX, banY, banW, banH);
    // Banner pole
    ctx.strokeStyle = '#7a6050';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(banX + banW/2, banY - ph*0.05);
    ctx.lineTo(banX + banW/2, banY + banH + ph*0.02);
    ctx.stroke();

    // Warm torch-light glow at base
    const torchGrad = ctx.createLinearGradient(wx, wy + ph*0.7, wx, wy + ph);
    torchGrad.addColorStop(0, 'rgba(255,160,40,0)');
    torchGrad.addColorStop(1, 'rgba(255,160,40,0.08)');
    ctx.fillStyle = torchGrad;
    ctx.fillRect(wx, wy, pw, ph);

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawHouse(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Stone walls
    const wallG = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    wallG.addColorStop(0, '#c0b090');
    wallG.addColorStop(1, '#988870');
    ctx.fillStyle = wallG;
    ctx.fillRect(wx, wy + ph*0.3, pw, ph*0.7);

    // Thatched roof (triangle)
    ctx.fillStyle = '#8b6030';
    ctx.beginPath();
    ctx.moveTo(wx - pw*0.05, wy + ph*0.35);
    ctx.lineTo(wx + pw*0.5, wy);
    ctx.lineTo(wx + pw*1.05, wy + ph*0.35);
    ctx.closePath();
    ctx.fill();
    // Roof shading
    ctx.fillStyle = '#6a4820';
    ctx.beginPath();
    ctx.moveTo(wx + pw*0.5, wy);
    ctx.lineTo(wx + pw*0.5, wy + ph*0.35);
    ctx.lineTo(wx + pw*1.05, wy + ph*0.35);
    ctx.closePath();
    ctx.fill();
    // Roof strokes (thatch texture)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      const ly = wy + (i/6) * ph*0.35;
      ctx.moveTo(wx + pw*0.5 - (i/6)*pw*0.55, ly);
      ctx.lineTo(wx + pw*0.5 + (i/6)*pw*0.55, ly);
      ctx.stroke();
    }

    // Chimney
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(wx + pw*0.7, wy, pw*0.12, ph*0.25);

    // Windows (player color shutters)
    ctx.fillStyle = 'rgba(40,30,10,0.75)';
    ctx.fillRect(wx + pw*0.12, wy + ph*0.45, pw*0.22, ph*0.2);
    ctx.fillRect(wx + pw*0.62, wy + ph*0.45, pw*0.22, ph*0.2);
    ctx.fillStyle = color + '99';
    ctx.fillRect(wx + pw*0.11, wy + ph*0.44, pw*0.05, ph*0.22);
    ctx.fillRect(wx + pw*0.34, wy + ph*0.44, pw*0.05, ph*0.22);
    ctx.fillRect(wx + pw*0.61, wy + ph*0.44, pw*0.05, ph*0.22);
    ctx.fillRect(wx + pw*0.84, wy + ph*0.44, pw*0.05, ph*0.22);

    // Door
    ctx.fillStyle = '#4a2a10';
    ctx.fillRect(wx + pw*0.38, wy + ph*0.65, pw*0.24, ph*0.35);
    ctx.fillStyle = color + '88';
    ctx.fillRect(wx + pw*0.38, wy + ph*0.65, pw*0.11, ph*0.35);

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawBarracks(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(wx + 5, wy + 5, pw, ph);

    // Heavy stone walls
    const wg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    wg.addColorStop(0, '#7a7060');
    wg.addColorStop(1, '#5a5040');
    ctx.fillStyle = wg;
    ctx.fillRect(wx, wy, pw, ph);

    // Flat roof
    ctx.fillStyle = '#4a4030';
    ctx.fillRect(wx - pw*0.02, wy, pw*1.04, ph*0.12);

    // Arrow slit windows
    ctx.fillStyle = 'rgba(10,8,5,0.85)';
    const slitPositions = [0.2, 0.45, 0.7];
    for (const xp of slitPositions) {
      ctx.fillRect(wx + pw*xp, wy + ph*0.25, pw*0.06, ph*0.22);
    }

    // Torch holders
    for (const xp of [0.15, 0.85]) {
      ctx.fillStyle = '#ff9a30';
      ctx.beginPath();
      ctx.arc(wx + pw*xp, wy + ph*0.35, pw*0.04, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,180,50,0.3)';
      ctx.beginPath();
      ctx.arc(wx + pw*xp, wy + ph*0.35, pw*0.1, 0, Math.PI*2);
      ctx.fill();
    }

    // Heavy door
    ctx.fillStyle = '#2a1a08';
    const dw = pw*0.28, dh = ph*0.32;
    ctx.fillRect(wx + pw/2 - dw/2, wy + ph - dh, dw, dh);
    // Door reinforcement bars
    ctx.strokeStyle = '#4a3a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + pw/2 - dw/2, wy + ph - dh*0.6);
    ctx.lineTo(wx + pw/2 + dw/2, wy + ph - dh*0.6);
    ctx.stroke();

    // Flag/banner on roof
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(wx + pw*0.5, wy - ph*0.03);
    ctx.lineTo(wx + pw*0.5, wy + ph*0.1);
    ctx.lineTo(wx + pw*0.65, wy + ph*0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a6050';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx + pw*0.5, wy + ph*0.12);
    ctx.lineTo(wx + pw*0.5, wy - ph*0.05);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawArcheryRange(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Lighter wood floor
    const fg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    fg.addColorStop(0, '#c8a060');
    fg.addColorStop(1, '#a07840');
    ctx.fillStyle = fg;
    ctx.fillRect(wx, wy, pw, ph);

    // Open front wooden frame posts
    ctx.fillStyle = '#7a5030';
    const postW = pw * 0.07;
    ctx.fillRect(wx + pw*0.05, wy + ph*0.05, postW, ph*0.7);
    ctx.fillRect(wx + pw*0.45, wy + ph*0.05, postW, ph*0.7);
    ctx.fillRect(wx + pw*0.88, wy + ph*0.05, postW, ph*0.7);
    // Cross beams
    ctx.fillRect(wx + pw*0.05, wy + ph*0.1, pw*0.9, ph*0.07);
    ctx.fillRect(wx + pw*0.05, wy + ph*0.45, pw*0.9, ph*0.06);

    // Target dummy silhouette
    ctx.fillStyle = '#4a3018';
    ctx.fillRect(wx + pw*0.12, wy + ph*0.4, pw*0.12, ph*0.35);
    ctx.beginPath();
    ctx.arc(wx + pw*0.18, wy + ph*0.36, pw*0.09, 0, Math.PI*2);
    ctx.fill();

    // Arrow rack on wall
    ctx.strokeStyle = '#c8a040';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const ax = wx + pw*0.55 + i*pw*0.08;
      ctx.moveTo(ax, wy + ph*0.2);
      ctx.lineTo(ax - pw*0.04, wy + ph*0.55);
      ctx.stroke();
    }

    // Player color marker
    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.82, wy + ph*0.07, pw*0.14, ph*0.06);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawStable(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Wide wooden building
    const bg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    bg.addColorStop(0, '#a07848');
    bg.addColorStop(1, '#7a5830');
    ctx.fillStyle = bg;
    ctx.fillRect(wx, wy, pw, ph);

    // Roof
    ctx.fillStyle = '#5a3a18';
    ctx.fillRect(wx - pw*0.02, wy, pw*1.04, ph*0.15);

    // Stall openings (3 along front)
    const stallCount = 3;
    const stallW = pw * 0.25;
    const stallGap = (pw - stallCount * stallW) / (stallCount + 1);
    ctx.fillStyle = '#3a2010';
    for (let i = 0; i < stallCount; i++) {
      const sx = wx + stallGap + i*(stallW + stallGap);
      ctx.fillRect(sx, wy + ph*0.45, stallW, ph*0.55);
    }

    // Hay bale in middle stall
    const hsx = wx + stallGap + stallW + stallGap;
    ctx.fillStyle = '#c8a030';
    ctx.fillRect(hsx + stallW*0.1, wy + ph*0.5, stallW*0.7, ph*0.25);
    ctx.strokeStyle = '#a07820';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(hsx + stallW*0.1, wy + ph*0.5 + i*(ph*0.07));
      ctx.lineTo(hsx + stallW*0.8, wy + ph*0.5 + i*(ph*0.07));
      ctx.stroke();
    }

    // Horse head silhouette in first stall
    ctx.fillStyle = '#5a3818';
    ctx.beginPath();
    ctx.ellipse(wx + stallGap + stallW*0.5, wy + ph*0.62, stallW*0.25, stallW*0.2, 0, 0, Math.PI*2);
    ctx.fill();

    // Wooden fence
    ctx.strokeStyle = '#7a5030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx, wy + ph);
    ctx.lineTo(wx + pw, wy + ph);
    ctx.stroke();
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(wx + i*(pw/5), wy + ph*0.9);
      ctx.lineTo(wx + i*(pw/5), wy + ph*1.06);
      ctx.stroke();
    }

    // Player color
    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.44, wy + ph*0.05, pw*0.12, ph*0.08);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawBlacksmith(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(wx + 5, wy + 5, pw, ph);

    // Stone building
    const sg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    sg.addColorStop(0, '#7a7068');
    sg.addColorStop(1, '#5a5050');
    ctx.fillStyle = sg;
    ctx.fillRect(wx, wy, pw, ph);

    // Forge glow
    ctx.save();
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'rgba(255,120,20,0.5)';
    ctx.fillRect(wx + pw*0.1, wy + ph*0.55, pw*0.4, ph*0.3);
    ctx.restore();

    // Chimney (tall)
    ctx.fillStyle = '#6a6060';
    ctx.fillRect(wx + pw*0.7, wy - ph*0.22, pw*0.15, ph*0.38);
    // Smoke
    ctx.fillStyle = 'rgba(100,100,100,0.4)';
    ctx.beginPath();
    ctx.arc(wx + pw*0.775, wy - ph*0.2, pw*0.08, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx + pw*0.79, wy - ph*0.3, pw*0.06, 0, Math.PI*2);
    ctx.fill();

    // Anvil shape at entrance
    ctx.fillStyle = '#3a3030';
    ctx.fillRect(wx + pw*0.12, wy + ph*0.6, pw*0.18, ph*0.08);
    ctx.fillRect(wx + pw*0.15, wy + ph*0.52, pw*0.12, ph*0.1);

    // Tools on wall
    ctx.strokeStyle = '#9a9090';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(wx + pw*(0.55+i*0.12), wy + ph*0.25);
      ctx.lineTo(wx + pw*(0.55+i*0.12), wy + ph*0.5);
      ctx.stroke();
    }

    // Door
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(wx + pw*0.38, wy + ph*0.62, pw*0.24, ph*0.38);

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawLumberCamp(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Light wood building
    const wg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    wg.addColorStop(0, '#b08850');
    wg.addColorStop(1, '#8a6a38');
    ctx.fillStyle = wg;
    ctx.fillRect(wx, wy, pw, ph);

    // Log pile
    ctx.fillStyle = '#6a4820';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(wx + pw*0.55, wy + ph*(0.4+i*0.12), pw*0.3, ph*0.06, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.strokeStyle = '#4a3010';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(wx + pw*0.55, wy + ph*(0.4+i*0.12), pw*0.3, ph*0.06, 0, 0, Math.PI*2);
      ctx.stroke();
    }

    // Roof
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(wx, wy, pw, ph*0.18);

    // Player color marker
    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.05, wy + ph*0.05, pw*0.18, ph*0.08);

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawMiningCamp(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Stone camp
    const sg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    sg.addColorStop(0, '#9a9080');
    sg.addColorStop(1, '#7a7060');
    ctx.fillStyle = sg;
    ctx.fillRect(wx, wy, pw, ph);

    // Ore pile (gold/stone bits)
    ctx.fillStyle = '#c8a040';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(wx + pw*(0.45+i*0.06), wy + ph*0.6, pw*0.055, 0, Math.PI*2);
      ctx.fill();
    }

    // Roof
    ctx.fillStyle = '#5a5040';
    ctx.fillRect(wx, wy, pw, ph*0.16);

    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.05, wy + ph*0.04, pw*0.18, ph*0.08);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawMill(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    const bg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    bg.addColorStop(0, '#c0a870');
    bg.addColorStop(1, '#a08858');
    ctx.fillStyle = bg;
    ctx.fillRect(wx, wy, pw, ph);

    // Mill wheel
    ctx.strokeStyle = '#5a3a18';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wx + pw*0.75, wy + ph*0.55, pw*0.2, 0, Math.PI*2);
    ctx.stroke();
    // Wheel spokes
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(wx + pw*0.75, wy + ph*0.55);
      ctx.lineTo(wx + pw*0.75 + Math.cos(a)*pw*0.2, wy + ph*0.55 + Math.sin(a)*pw*0.2);
      ctx.stroke();
    }

    // Roof
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(wx, wy, pw, ph*0.15);

    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.05, wy + ph*0.04, pw*0.15, ph*0.07);

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawFarm(ctx, wx, wy, pw, ph, color) {
    // Plowed field pattern
    const fg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    fg.addColorStop(0, '#8a6a38');
    fg.addColorStop(1, '#6a5028');
    ctx.fillStyle = fg;
    ctx.fillRect(wx, wy, pw, ph);

    // Row stripes
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    const rowCount = 5;
    for (let i = 0; i < rowCount; i++) {
      const fy = wy + (i / rowCount) * ph;
      ctx.beginPath();
      ctx.moveTo(wx, fy);
      ctx.lineTo(wx + pw, fy);
      ctx.stroke();
    }

    // Crop dots (green)
    ctx.fillStyle = '#5a8820';
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < 5; col++) {
        ctx.beginPath();
        ctx.arc(wx + (col+0.5)*(pw/5), wy + (row+0.5)*(ph/rowCount), pw*0.035, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // Fence border
    ctx.strokeStyle = '#7a5030';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, wy, pw, ph);

    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.42, wy - ph*0.04, pw*0.16, ph*0.06);
  },

  _drawTower(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);

    // Wider base
    const baseG = ctx.createLinearGradient(wx, wy, wx + pw, wy + ph);
    baseG.addColorStop(0, '#9a8a78');
    baseG.addColorStop(1, '#6a5a48');
    ctx.fillStyle = baseG;
    ctx.fillRect(wx - pw*0.08, wy + ph*0.7, pw*1.16, ph*0.3);

    // Main tower cylinder (approximated with rect + highlight)
    const tg = ctx.createLinearGradient(wx, wy, wx + pw, wy + ph);
    tg.addColorStop(0, '#a89a88');
    tg.addColorStop(0.5, '#c0b0a0');
    tg.addColorStop(1, '#7a6a58');
    ctx.fillStyle = tg;
    ctx.fillRect(wx + pw*0.08, wy, pw*0.84, ph*0.75);

    // Stone texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    for (let y = wy + 10; y < wy + ph*0.7; y += 10) {
      ctx.beginPath();
      ctx.moveTo(wx + pw*0.08, y);
      ctx.lineTo(wx + pw*0.92, y);
      ctx.stroke();
    }

    // Arrow slits
    ctx.fillStyle = 'rgba(20,15,10,0.8)';
    ctx.fillRect(wx + pw*0.42, wy + ph*0.25, pw*0.16, ph*0.22);
    ctx.fillRect(wx + pw*0.42, wy + ph*0.55, pw*0.16, ph*0.12);

    // Crenelations on top
    const crenW = pw * 0.15;
    ctx.fillStyle = '#8a7a68';
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(wx + pw*0.08 + i*crenW, wy - ph*0.06, crenW*0.9, ph*0.1);
      }
    }

    // Flag
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(wx + pw*0.5, wy - ph*0.12);
    ctx.lineTo(wx + pw*0.5, wy + ph*0.04);
    ctx.lineTo(wx + pw*0.75, wy - ph*0.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a6050';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx + pw*0.5, wy + ph*0.06);
    ctx.lineTo(wx + pw*0.5, wy - ph*0.14);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawWall(ctx, wx, wy, pw, ph, color) {
    // Stone masonry base
    const mg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    mg.addColorStop(0, '#b0a898');
    mg.addColorStop(0.3, '#c8c0b0');
    mg.addColorStop(1, '#8a8070');
    ctx.fillStyle = mg;
    ctx.fillRect(wx, wy, pw, ph);

    // Brick rows
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    const brickH = ph / 3;
    for (let row = 0; row < 3; row++) {
      const by = wy + row * brickH;
      ctx.beginPath();
      ctx.moveTo(wx, by);
      ctx.lineTo(wx + pw, by);
      ctx.stroke();
      // Vertical brick breaks (offset per row)
      const offset = row % 2 === 0 ? 0 : pw * 0.4;
      for (let bx = offset; bx < pw; bx += pw * 0.8) {
        ctx.beginPath();
        ctx.moveTo(wx + bx, by);
        ctx.lineTo(wx + bx, by + brickH);
        ctx.stroke();
      }
    }

    // 3D depth - darker top edge, lighter bottom
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(wx, wy, pw, ph * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(wx, wy + ph*0.92, pw, ph*0.08);

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawSiegeWorkshop(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(wx + 5, wy + 5, pw, ph);

    const bg = ctx.createLinearGradient(wx, wy, wx, wy + ph);
    bg.addColorStop(0, '#8a7a68');
    bg.addColorStop(1, '#5a4a38');
    ctx.fillStyle = bg;
    ctx.fillRect(wx, wy, pw, ph);

    // Large door for siege equipment
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(wx + pw*0.2, wy + ph*0.45, pw*0.6, ph*0.55);

    // Roof
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(wx - pw*0.02, wy, pw*1.04, ph*0.15);

    // Trebuche silhouette inside
    ctx.fillStyle = '#3a2808';
    ctx.fillRect(wx + pw*0.35, wy + ph*0.2, pw*0.06, ph*0.25);
    ctx.fillRect(wx + pw*0.3, wy + ph*0.18, pw*0.35, ph*0.06);

    // Player color
    ctx.fillStyle = color;
    ctx.fillRect(wx + pw*0.44, wy + ph*0.04, pw*0.12, ph*0.08);

    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  _drawGenericBuilding(ctx, wx, wy, pw, ph, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(wx + 4, wy + 4, pw, ph);
    ctx.fillStyle = '#8a8070';
    ctx.fillRect(wx, wy, pw, ph);
    ctx.fillStyle = color + '88';
    ctx.fillRect(wx, wy, pw, ph * 0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, ph);
  },

  // ── RESOURCE NODES ────────────────────────────────────────

  // isoX, isoY are the isometric world position of the node center
  drawResourceNode(ctx, node, camera, isoX, isoY) {
    const r = node.radius;
    switch (node.nodeType) {
      case 'TREE':          this._drawTree(ctx, isoX, isoY, r); break;
      case 'GOLD_MINE':     this._drawGoldMine(ctx, isoX, isoY, r); break;
      case 'STONE_QUARRY':  this._drawStoneQuarry(ctx, isoX, isoY, r); break;
      case 'BERRY_BUSH':    this._drawBerryBush(ctx, isoX, isoY, r); break;
    }
  },

  _drawTree(ctx, sx, sy, r) {
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r*0.75, r*0.9, r*0.28, 0, 0, Math.PI*2);
    ctx.fill();

    // Trunk (tapered)
    const trunkG = ctx.createLinearGradient(sx - r*0.2, sy, sx + r*0.2, sy + r);
    trunkG.addColorStop(0, '#7a5030');
    trunkG.addColorStop(1, '#4a2e10');
    ctx.fillStyle = trunkG;
    ctx.beginPath();
    ctx.moveTo(sx - r*0.18, sy + r*0.85);
    ctx.lineTo(sx - r*0.12, sy + r*0.1);
    ctx.lineTo(sx + r*0.12, sy + r*0.1);
    ctx.lineTo(sx + r*0.18, sy + r*0.85);
    ctx.closePath();
    ctx.fill();

    // Root bumps
    ctx.fillStyle = '#5a3818';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(sx + i*r*0.18, sy + r*0.78, r*0.1, 0, Math.PI*2);
      ctx.fill();
    }

    // Back canopy (darkest)
    ctx.fillStyle = '#1e3d18';
    ctx.beginPath();
    ctx.arc(sx, sy - r*0.08, r*0.85, 0, Math.PI*2);
    ctx.fill();

    // Mid canopy
    ctx.fillStyle = '#2d5a22';
    ctx.beginPath();
    ctx.arc(sx - r*0.1, sy - r*0.2, r*0.72, 0, Math.PI*2);
    ctx.fill();

    // Front canopy (lightest)
    const cg = ctx.createRadialGradient(sx - r*0.15, sy - r*0.3, 0, sx, sy - r*0.15, r*0.68);
    cg.addColorStop(0, '#5a9044');
    cg.addColorStop(1, '#3a7030');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(sx + r*0.1, sy - r*0.28, r*0.62, 0, Math.PI*2);
    ctx.fill();

    // Top highlight
    ctx.fillStyle = 'rgba(120,200,80,0.35)';
    ctx.beginPath();
    ctx.arc(sx, sy - r*0.5, r*0.28, Math.PI, 0);
    ctx.fill();

    // Leaf dots around canopy edge
    const leafColor = '#1e3d18';
    const leafDots = [
      [-0.7,-0.2], [0.7,-0.1], [-0.5,-0.6], [0.5,-0.55],
      [-0.8,0.1], [0.75,0.15], [-0.3,-0.85], [0.3,-0.8],
      [-0.6,0.25], [0.6,0.2], [0,-0.9], [-0.1,-0.15]
    ];
    ctx.fillStyle = leafColor;
    for (const [lx, ly] of leafDots) {
      ctx.beginPath();
      ctx.ellipse(sx + lx*r*0.78, sy + ly*r*0.78, r*0.14, r*0.1, lx*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
  },

  _drawGoldMine(ctx, sx, sy, r) {
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r*0.8, r*1.0, r*0.3, 0, 0, Math.PI*2);
    ctx.fill();

    // Rocky base (irregular polygon)
    ctx.fillStyle = '#6a6058';
    ctx.beginPath();
    const rockPts = [
      [0, -0.9], [0.6, -0.7], [1.0, -0.2], [0.9, 0.5],
      [0.3, 0.85], [-0.3, 0.85], [-0.9, 0.4], [-1.0, -0.1], [-0.6, -0.7]
    ];
    for (let i = 0; i < rockPts.length; i++) {
      const [px, py] = rockPts[i];
      i === 0 ? ctx.moveTo(sx + px*r, sy + py*r) : ctx.lineTo(sx + px*r, sy + py*r);
    }
    ctx.closePath();
    ctx.fill();

    // Gold veins
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 2.5;
    const veins = [
      [[-0.4,-0.5],[0.3,-0.1]], [[0,-0.3],[0.5,0.3]], [[-0.2,0.2],[0.4,0.5]]
    ];
    for (const [[x1,y1],[x2,y2]] of veins) {
      ctx.beginPath();
      ctx.moveTo(sx + x1*r, sy + y1*r);
      ctx.lineTo(sx + x2*r, sy + y2*r);
      ctx.stroke();
    }

    // Crystal formations (hexagonal)
    ctx.fillStyle = 'rgba(240,200,40,0.8)';
    const crystalPos = [[-0.25,-0.55],[0.35,-0.3],[0,-0.4]];
    for (const [cx, cy] of crystalPos) {
      const cSize = r * 0.22;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI/6;
        const px = sx + cx*r + Math.cos(a) * cSize;
        const py = sy + cy*r + Math.sin(a) * cSize * 1.5;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f8e080';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Sparkles
    const sparklePos = [[-0.3,-0.6],[0.4,-0.35],[0.1,-0.5]];
    for (const [spx, spy] of sparklePos) {
      ctx.fillStyle = 'rgba(255,255,200,0.9)';
      const rx = sx + spx*r, ry = sy + spy*r;
      const ss = r * 0.08;
      // 4-pointed star
      ctx.beginPath();
      ctx.moveTo(rx, ry - ss*2.5);
      ctx.lineTo(rx + ss*0.7, ry - ss*0.7);
      ctx.lineTo(rx + ss*2.5, ry);
      ctx.lineTo(rx + ss*0.7, ry + ss*0.7);
      ctx.lineTo(rx, ry + ss*2.5);
      ctx.lineTo(rx - ss*0.7, ry + ss*0.7);
      ctx.lineTo(rx - ss*2.5, ry);
      ctx.lineTo(rx - ss*0.7, ry - ss*0.7);
      ctx.closePath();
      ctx.fill();
    }
  },

  _drawStoneQuarry(ctx, sx, sy, r) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r*0.8, r*1.1, r*0.3, 0, 0, Math.PI*2);
    ctx.fill();

    // 3 overlapping grey ellipses
    const boulders = [
      [0, 0, 1.0, 0.75, '#7a7a78'],
      [-0.35, -0.2, 0.65, 0.55, '#9a9a98'],
      [0.3, -0.15, 0.7, 0.52, '#8a8a88'],
    ];
    for (const [bx, by, bw, bh, bc] of boulders) {
      ctx.fillStyle = bc;
      ctx.beginPath();
      ctx.ellipse(sx + bx*r, sy + by*r, bw*r, bh*r, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // Crack lines
    ctx.strokeStyle = 'rgba(40,40,40,0.55)';
    ctx.lineWidth = 1.2;
    const cracks = [
      [[-0.2,-0.4],[0.3,0.0]], [[0.1,-0.5],[0.5,0.1]], [[-0.5,-0.1],[-0.1,0.4]]
    ];
    for (const [[x1,y1],[x2,y2]] of cracks) {
      ctx.beginPath();
      ctx.moveTo(sx + x1*r, sy + y1*r);
      ctx.lineTo(sx + x2*r, sy + y2*r);
      ctx.stroke();
    }

    // Flat cut face (fresh stone)
    ctx.fillStyle = '#c0c0be';
    ctx.beginPath();
    ctx.moveTo(sx + r*0.4, sy - r*0.4);
    ctx.lineTo(sx + r*0.85, sy - r*0.1);
    ctx.lineTo(sx + r*0.8, sy + r*0.3);
    ctx.lineTo(sx + r*0.35, sy + r*0.1);
    ctx.closePath();
    ctx.fill();
    // Cut face lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + r*(0.4+i*0.06), sy - r*0.4 + i*r*0.22);
      ctx.lineTo(sx + r*(0.78+i*0.02), sy - r*0.1 + i*r*0.13);
      ctx.stroke();
    }

    // Rubble dots at base
    ctx.fillStyle = '#888880';
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI + Math.PI*0.1;
      ctx.beginPath();
      ctx.arc(sx + Math.cos(ang)*r*0.88, sy + r*0.72 + Math.sin(ang)*r*0.1, r*0.07, 0, Math.PI*2);
      ctx.fill();
    }
  },

  _drawBerryBush(ctx, sx, sy, r) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r*0.85, r*0.9, r*0.28, 0, 0, Math.PI*2);
    ctx.fill();

    // Back bush layer
    ctx.fillStyle = '#1e4a12';
    ctx.beginPath();
    ctx.ellipse(sx, sy + r*0.1, r*0.95, r*0.75, 0, 0, Math.PI*2);
    ctx.fill();

    // Mid bush
    ctx.fillStyle = '#2a6218';
    ctx.beginPath();
    ctx.ellipse(sx - r*0.1, sy - r*0.05, r*0.8, r*0.65, 0.15, 0, Math.PI*2);
    ctx.fill();

    // Front bush
    ctx.fillStyle = '#357022';
    ctx.beginPath();
    ctx.ellipse(sx + r*0.05, sy - r*0.1, r*0.72, r*0.58, -0.1, 0, Math.PI*2);
    ctx.fill();

    // Leaf highlights
    ctx.strokeStyle = 'rgba(80,160,40,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI - Math.PI*0.2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a)*r*0.3, sy + Math.sin(a)*r*0.3 - r*0.1);
      ctx.lineTo(sx + Math.cos(a)*r*0.7, sy + Math.sin(a)*r*0.5 - r*0.1);
      ctx.stroke();
    }

    // Red berries
    const berryPos = [
      [-0.45,-0.3],[0.1,-0.4],[0.4,-0.1],[-0.1,-0.15],
      [0.2,0.1],[-0.35,0.05],[0.35,0.25],[-0.15,0.25]
    ];
    for (const [bx, by] of berryPos) {
      ctx.fillStyle = '#cc2244';
      ctx.beginPath();
      ctx.arc(sx + bx*r, sy + by*r, r*0.14, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,100,120,0.5)';
      ctx.beginPath();
      ctx.arc(sx + bx*r - r*0.04, sy + by*r - r*0.04, r*0.055, 0, Math.PI*2);
      ctx.fill();
    }
  },

  // ── UI HELPERS ────────────────────────────────────────────

  drawHealthBar(ctx, x, y, w, hp, maxHp, zoom) {
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const h = 4 / zoom;
    const bx = x - w/2;
    const by = y;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx - 1/zoom, by - 1/zoom, w + 2/zoom, h + 2/zoom, 2/zoom);
    } else {
      ctx.rect(bx - 1/zoom, by - 1/zoom, w + 2/zoom, h + 2/zoom);
    }
    ctx.fill();

    // HP fill gradient
    const hpGrad = ctx.createLinearGradient(bx, by, bx + w, by);
    if (ratio > 0.6) {
      hpGrad.addColorStop(0, '#22bb22');
      hpGrad.addColorStop(1, '#44ee44');
    } else if (ratio > 0.3) {
      hpGrad.addColorStop(0, '#cc8800');
      hpGrad.addColorStop(1, '#ffcc00');
    } else {
      hpGrad.addColorStop(0, '#aa1111');
      hpGrad.addColorStop(1, '#ff3333');
    }
    ctx.fillStyle = hpGrad;
    ctx.fillRect(bx, by, w * ratio, h);

    // HP text (only when zoomed in)
    if (zoom > 1.2 && w > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `bold ${4/zoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(hp)}/${maxHp}`, bx + w/2, by + h/2);
    }
  },

  drawSelectionGlow(ctx, x, y, radius, color, zoom) {
    const layers = [
      { blur: 20, alpha: 0.2 },
      { blur: 10, alpha: 0.35 },
      { blur: 4,  alpha: 0.6 }
    ];
    ctx.save();
    for (const layer of layers) {
      ctx.shadowColor = color;
      ctx.shadowBlur = layer.blur / zoom;
      ctx.globalAlpha = layer.alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.ellipse(x, y + radius * 0.35, radius * 1.15, radius * 0.42, 0, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  drawFloatingText(ctx, text, x, y, alpha, color, size, zoom) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 1/zoom, y + 1/zoom);
    // Main text
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
