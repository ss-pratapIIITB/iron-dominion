// ============================================================
// IRON DOMINION - Main Game Class
// ============================================================

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.running  = false;
    this.winner   = null;  // 0 or 1 or null
    this.gameOver = false;
    this.gameTime = 0;
    this.fps      = 60;
    this.dt       = LOGIC_TICK;

    // Fixed timestep
    this.LOGIC_TICK  = LOGIC_TICK;
    this.lastTime    = 0;
    this.accumulator = 0;

    // Game state
    this.units         = [];   // all units in game
    this.buildings     = [];   // all buildings in game
    this.resourceNodes = [];   // all resource nodes
    this.projectiles   = [];   // active projectiles
    this.effects       = [];   // visual effects

    // Players
    this.players = [
      new Player(0, PLAYER_COLORS[0]),
      new Player(1, PLAYER_COLORS[1]),
    ];

    // Systems
    this.map        = new GameMap();
    this.pathfinder = new Pathfinder(this.map);
    this.fog        = new FogOfWar(MAP_W, MAP_H);
    this.camera     = new Camera(canvas.width, canvas.height - UI_TOP_H);
    this.selection  = new SelectionManager(this);
    this.input      = new InputManager(canvas, this);
    this.ai         = new AIController(this);
    this.ui         = new UIManager(this);

    // FPS tracking
    this._fpsFrames = 0;
    this._fpsTimer  = 0;
    this._restartBtn = null;

    // Alert sound throttle: ms timestamp of last alert
    this._lastAlertTime = 0;

    // Age advance banner
    this._ageAdvanceTimer = 0;
    this._ageAdvanceName  = '';

    // Hook restart click
    canvas.addEventListener('mouseup', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.handleRestartClick(sx, sy);
    });
  }

  // ── Initialization ────────────────────────────────────────
  init() {
    SpriteR.init();
    this.map.generate();
    this._placeResources();
    this._setupPlayer(0, 8, 8);    // NW quadrant (inside quadrant, away from central roads)
    this._setupPlayer(1, 50, 50);  // SE quadrant

    // Center camera on player 1 base — offset downward slightly so the tall
    // town center building appears fully in frame (not clipped at top)
    const p1tc = this.players[0].buildings[0];
    if (p1tc) {
      const iso = simToIso(p1tc.x, p1tc.y);
      this.camera.centerOn(iso.x, iso.y + 120); // +120 iso units down to show full building
    }

    // Debug URL params: ?zoom=0.3&cx=3072&cy=1536 sets camera for screenshots
    const _dp = new URLSearchParams(location.search);
    if (_dp.has('zoom')) {
      this.camera.zoom = parseFloat(_dp.get('zoom'));
      const iso = tileToIso(32, 32); // map center
      this.camera.centerOn(
        parseFloat(_dp.get('cx') || iso.x),
        parseFloat(_dp.get('cy') || iso.y)
      );
    }
    if (_dp.has('nofog')) {
      this.fog.disabled = true;
    }

    this._updateFog();
    this.running = true;
  }

  _setupPlayer(pid, startTx, startTy) {
    // Clear start zone
    this.map._clearStartZone(startTx + 2, startTy + 2, 10);

    // Place Town Center
    const tc = this.placeBuilding('TOWN_CENTER', startTx, startTy, pid, true);

    // Place 3 Villagers around the Town Center
    const offsets = [[5, 2], [6, 2], [5, 3]];
    for (const [ox, oy] of offsets) {
      const wx = (startTx + ox) * TILE_SIZE + TILE_SIZE / 2;
      const wy = (startTy + oy) * TILE_SIZE + TILE_SIZE / 2;
      this.spawnUnit('VILLAGER', wx, wy, pid);
    }

    // Starting resources
    const player = this.players[pid];
    player.wood  = 200;
    player.food  = 200;
    player.gold  = 100;
    player.stone = 0;
  }

  _placeResources() {
    const place = (type, count, minDist) => {
      let placed = 0, attempts = 0;
      const isTree = type === 'TREE';
      while (placed < count && attempts < 800) {
        attempts++;
        const tx = randomInt(4, MAP_W - 5);
        const ty = randomInt(4, MAP_H - 5);
        if (this._isNearStart(tx, ty, minDist)) continue;
        if (!this.map.isPassable(tx, ty)) continue;
        // Trees prefer to be adjacent to forest terrain (AoE2 wood line feel)
        if (isTree) {
          let nearForest = false;
          for (let dy = -2; dy <= 2 && !nearForest; dy++)
            for (let dx = -2; dx <= 2 && !nearForest; dx++)
              if (this.map.getTile(tx+dx, ty+dy) === TERRAIN.FOREST) nearForest = true;
          // 70% chance to require forest proximity; 30% chance to place anywhere (scattered trees)
          if (!nearForest && Math.random() < 0.70) continue;
        }
        // Not too close to existing nodes (trees cluster tighter — min dist 2 instead of 3)
        let tooClose = false;
        const minNodeDist = isTree ? 2 : 3;
        for (const n of this.resourceNodes) {
          if (distTiles(tx, ty, n.tileX, n.tileY) < minNodeDist) { tooClose = true; break; }
        }
        if (tooClose) continue;
        this.resourceNodes.push(new ResourceNode(type, tx, ty, this));
        placed++;
      }
    };

    place('TREE',         100,  7);   // abundant wood — many trees near forests
    place('GOLD_MINE',     18, 11);
    place('STONE_QUARRY',  14, 11);
    place('BERRY_BUSH',    28,  6);  // berries close to base like AoE2
  }

  _isNearStart(tx, ty, r) {
    return distTiles(tx, ty, 8, 8) < r || distTiles(tx, ty, 54, 54) < r;
  }

  // ── Entity Spawning ───────────────────────────────────────
  spawnUnit(unitType, wx, wy, playerId) {
    // Jitter position slightly to avoid stacking
    wx += randomFloat(-8, 8);
    wy += randomFloat(-8, 8);
    const unit = new Unit(unitType, wx, wy, playerId, this);
    this.units.push(unit);
    this.players[playerId].units.push(unit);
    this.players[playerId].recalcPop();
    this.players[playerId].recalcPopCap();
    return unit;
  }

  placeBuilding(buildingType, tx, ty, playerId, preBuilt) {
    if (!BUILDING_DEFS[buildingType]) return null;
    const b = new Building(buildingType, tx, ty, playerId, this);
    if (preBuilt) {
      b.built = true;
      b.buildProgress = 100;
      b.hp = b.maxHp;
    }
    this.buildings.push(b);
    this.players[playerId].buildings.push(b);
    this.map.occupyBuilding(tx, ty, b.size, false);
    this.players[playerId].recalcPopCap();
    return b;
  }

  canPlaceBuilding(buildingType, tx, ty) {
    const def = BUILDING_DEFS[buildingType];
    if (!def) return false;
    const size = def.size;
    const player = this.players[0];

    if (def.requires && AGE_ORDER.indexOf(player.age) < AGE_ORDER.indexOf(def.requires)) return false;
    if (!inBounds(tx, ty) || !inBounds(tx + size - 1, ty + size - 1)) return false;

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (!this.map.isPassable(tx + dx, ty + dy)) return false;
        for (const b of this.buildings) {
          if (b.dead) continue;
          if (tx + dx >= b.tileX && tx + dx < b.tileX + b.size &&
              ty + dy >= b.tileY && ty + dy < b.tileY + b.size) return false;
        }
      }
    }
    return true;
  }

  tryPlaceBuilding(buildingType, tx, ty) {
    const def = BUILDING_DEFS[buildingType];
    const player = this.players[0];

    if (!this.canPlaceBuilding(buildingType, tx, ty)) {
      this.ui.addNotification('Cannot place building here!', '#ff4444');
      return null;
    }
    if (!player.canAfford(def.cost)) {
      this.ui.addNotification('Not enough resources!', '#ff4444');
      return null;
    }

    player.spend(def.cost);
    const b = this.placeBuilding(buildingType, tx, ty, 0, false);

    // Assign nearest idle villager
    let bestV = null, bestDist = Infinity;
    for (const u of player.units) {
      if (u.dead || u.type !== 'VILLAGER') continue;
      const d = dist(u.x, u.y, b.x, b.y);
      if (d < bestDist) { bestDist = d; bestV = u; }
    }
    if (bestV) bestV.cmdBuild(b);

    this.ui.addNotification(`Placing ${def.name}...`, '#88ccff');
    return b;
  }

  spawnProjectile(shooter, target) {
    const p = new Projectile(shooter, target, this);
    this.projectiles.push(p);
    return p;
  }

  spawnEffect(effect) {
    this.effects.push({ ...effect, timer: effect.life });
  }

  // ── Game Loop ─────────────────────────────────────────────
  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(t => this._loop(t));
  }

  _loop(timestamp) {
    const delta = Math.min(timestamp - this.lastTime, 200);
    this.lastTime = timestamp;

    // FPS
    this._fpsFrames++;
    this._fpsTimer += delta;
    if (this._fpsTimer >= 500) {
      this.fps = (this._fpsFrames / this._fpsTimer * 1000) | 0;
      this._fpsFrames = 0;
      this._fpsTimer  = 0;
    }

    if (!this.gameOver) {
      this.accumulator += delta;
      while (this.accumulator >= this.LOGIC_TICK) {
        this.update(this.LOGIC_TICK);
        this.accumulator -= this.LOGIC_TICK;
      }
    }

    this.render(this.accumulator / this.LOGIC_TICK);
    requestAnimationFrame(t => this._loop(t));
  }

  // ── Logic Update ──────────────────────────────────────────
  update(dt) {
    this.gameTime += dt;
    this.dt = dt;

    // Camera
    this.camera.update(dt, this.input.keys, this.input.mouseX, this.input.mouseY);
    this.input.update();

    // Age advancement
    for (const p of this.players) {
      if (p.updateAge(dt)) {
        if (p.id === 0) {
          this.ui.addNotification(`Advanced to ${AGE_DEFS[p.age].name}!`, '#c8a94e');
          // Trigger full-screen age banner
          this._ageAdvanceName  = AGE_DEFS[p.age].name;
          this._ageAdvanceTimer = 3500; // ms to show banner
        }
      }
    }

    // Fog of war
    this._updateFog();

    // Units
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.dead) {
        this.units.splice(i, 1);
      } else {
        u.update(dt);
      }
    }

    // Buildings
    for (const b of this.buildings) {
      if (!b.dead) b.update(dt);
    }

    // Resource nodes
    for (const n of this.resourceNodes) n.update(dt);

    // Map (water animation tick)
    this.map.update(dt);

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }

    // Effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].timer -= dt;
      if (this.effects[i].timer <= 0) this.effects.splice(i, 1);
    }

    // AI
    this.ai.update(dt);

    // Population sync
    for (const p of this.players) p.recalcPop();
  }

  _updateFog() {
    this.fog.beginFrame();
    for (const u of this.players[0].units) {
      if (!u.dead) this.fog.reveal(u.tx, u.ty, u.los);
    }
    for (const b of this.players[0].buildings) {
      if (!b.dead && b.built) {
        this.fog.reveal(b.tileX + Math.floor(b.size / 2), b.tileY + Math.floor(b.size / 2), b.def.los);
      }
    }
  }

  // ── Win/Lose ──────────────────────────────────────────────
  // Throttled alert when player units/buildings are attacked
  triggerAttackAlert(simX, simY) {
    const now = performance.now();
    if (now - this._lastAlertTime > 3000) { // max once per 3s
      this._lastAlertTime = now;
      if (simX !== undefined) {
        this._attackFlashX    = simX;
        this._attackFlashY    = simY;
        this._attackFlashTime = now; // timestamp for fade calculation
      }
      if (typeof Sound !== 'undefined') Sound.alert();
    }
  }

  onTownCenterDestroyed(playerId) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.winner = playerId === 0 ? 1 : 0;
    if (typeof Sound !== 'undefined') {
      this.winner === 0 ? Sound.victory() : Sound.defeat();
    }
  }

  // ── Hit Testing ───────────────────────────────────────────
  getEntityAt(wx, wy) {
    for (const u of this.units) {
      if (u.dead) continue;
      if (dist(u.x, u.y, wx, wy) <= u.radius + 6) return u;
    }
    for (const n of this.resourceNodes) {
      if (n.depleted) continue;
      if (dist(n.x, n.y, wx, wy) <= n.radius + 6) return n;
    }
    for (const b of this.buildings) {
      if (b.dead) continue;
      const bx1 = b.tileX * TILE_SIZE;
      const by1 = b.tileY * TILE_SIZE;
      const bx2 = bx1 + b.size * TILE_SIZE;
      const by2 = by1 + b.size * TILE_SIZE;
      if (wx >= bx1 && wx <= bx2 && wy >= by1 && wy <= by2) return b;
    }
    return null;
  }

  getNearestResource(wx, wy, type) {
    let best = null, bestDist = Infinity;
    for (const n of this.resourceNodes) {
      if (n.depleted) continue;
      if (type && n.resourceType !== type) continue;
      const d = dist(n.x, n.y, wx, wy);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }

  // ── Render ────────────────────────────────────────────────
  render(interp) {
    const ctx = this.ctx;
    const cam = this.camera;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fill background with forest color so tile seams don't show as black
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, W, H);

    // Camera-space rendering
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.worldX, -cam.worldY);

    // Map terrain
    this.map.render(ctx, cam);

    // Resource nodes
    for (const n of this.resourceNodes) {
      if (this.fog.isSeen(n.tileX, n.tileY)) n.render(ctx, cam);
    }

    // ISO depth-sorted buildings + units (sort by tx+ty = iso depth)
    const renderables = [];
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (b.playerId === 0 || this.fog.isSeen(b.tileX, b.tileY)) {
        // depth = center tile tx+ty (for iso ordering)
        const depth = b.tileX + b.size/2 + b.tileY + b.size/2;
        renderables.push({ e: b, depth });
      }
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.playerId === 0 || this.fog.isWorldVisible(u.x, u.y)) {
        const depth = u.x / TILE_SIZE + u.y / TILE_SIZE;
        renderables.push({ e: u, depth });
      }
    }
    renderables.sort((a, b) => a.depth - b.depth);
    for (const r of renderables) r.e.render(ctx, cam);

    // Projectiles
    for (const p of this.projectiles) p.render(ctx, cam);

    // Effects
    for (const ef of this.effects) this._renderEffect(ctx, cam, ef);

    ctx.restore();

    // Fog of war overlay (in world space, rendered separately)
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.worldX, -cam.worldY);
    this.fog.render(ctx, cam);
    ctx.restore();

    // Enemy ghost positions (last-seen, rendered after fog, before HUD)
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.worldX, -cam.worldY);
    this._renderEnemyGhosts(ctx, cam);
    ctx.restore();

    // HUD (screen space)
    this.ui.render(ctx);
    if (this.ui.buildMenuOpen) {
      this.ui.renderBuildMenu(ctx, W, H);
    }

    // Age advance announcement banner
    if (this._ageAdvanceTimer > 0) {
      this._ageAdvanceTimer = Math.max(0, this._ageAdvanceTimer - (this.dt || 16));
      this._renderAgeAdvanceBanner(ctx, W, H);
    }

    // Game over screen
    if (this.gameOver) this._renderGameOver(ctx, W, H);
  }

  _renderEffect(ctx, cam, ef) {
    const pct = 1 - ef.timer / ef.life;
    const iso = simToIso(ef.x, ef.y);
    const ix = iso.x + (ef.vx || 0) * pct * ef.life * 0.001;
    const iy = iso.y + (ef.vy || 0) * pct * ef.life * 0.001;

    if (ef.type === 'explosion') {
      const r = ef.radius * pct;
      ctx.globalAlpha = (1 - pct) * 0.85;
      const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, r));
      g.addColorStop(0,   '#ffffff');
      g.addColorStop(0.3, '#ff8800');
      g.addColorStop(1,   'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'dust') {
      const r = ef.radius * (0.4 + pct * 0.6);
      ctx.globalAlpha = (1 - pct) * 0.45;
      const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, r));
      g.addColorStop(0, 'rgba(200,180,140,0.8)');
      g.addColorStop(1, 'rgba(200,180,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ix, iy, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'gather_spark') {
      const r = ef.radius * (1 - pct * 0.5);
      ctx.globalAlpha = (1 - pct) * 0.9;
      ctx.fillStyle = ef.color || '#f0c040';
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(0.5, r * 0.4), 0, Math.PI * 2);
      ctx.fill();
      // Star sparkle at peak
      if (pct < 0.4) {
        const ss = r * 0.6;
        ctx.beginPath();
        ctx.moveTo(ix, iy - ss); ctx.lineTo(ix + ss * 0.3, iy - ss * 0.3);
        ctx.lineTo(ix + ss, iy); ctx.lineTo(ix + ss * 0.3, iy + ss * 0.3);
        ctx.lineTo(ix, iy + ss); ctx.lineTo(ix - ss * 0.3, iy + ss * 0.3);
        ctx.lineTo(ix - ss, iy); ctx.lineTo(ix - ss * 0.3, iy - ss * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

    } else if (ef.type === 'building_smoke') {
      const r = ef.radius * (0.6 + pct * 0.7);
      const rise = (ef.vy || -18) * pct * ef.life * 0.001;
      const drift = (ef.vx || 0) * pct * ef.life * 0.001;
      ctx.globalAlpha = (1 - pct) * 0.55;
      const g = ctx.createRadialGradient(ix + drift, iy + rise, 0, ix + drift, iy + rise, Math.max(1, r));
      g.addColorStop(0, 'rgba(80,70,60,0.9)');
      g.addColorStop(1, 'rgba(80,70,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ix + drift, iy + rise, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'fire') {
      const r = ef.radius * (1 - pct * 0.4);
      const rise = (ef.vy || -18) * pct * ef.life * 0.001;
      const drift = (ef.vx || 0) * pct * ef.life * 0.001;
      ctx.globalAlpha = (1 - pct) * 0.85;
      const g = ctx.createRadialGradient(ix + drift, iy + rise, 0, ix + drift, iy + rise, Math.max(1, r));
      g.addColorStop(0,   'rgba(255,255,160,0.95)');
      g.addColorStop(0.3, 'rgba(255,130,20,0.85)');
      g.addColorStop(0.7, 'rgba(200,40,0,0.5)');
      g.addColorStop(1,   'rgba(80,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ix + drift, iy + rise, r * 0.55, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'hit_flash') {
      const r = ef.radius * (1 - pct);
      ctx.globalAlpha = (1 - pct) * 0.7;
      const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, r));
      g.addColorStop(0, 'rgba(255,255,200,0.9)');
      g.addColorStop(0.5, 'rgba(255,120,50,0.5)');
      g.addColorStop(1,   'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'explosion') {
      // Trebuchet / siege impact explosion
      const maxR = ef.radius * 0.45;
      const fireball = maxR * (1 - pct * 0.6); // fireball shrinks slightly
      const shockR   = maxR * (0.3 + pct * 0.7); // shockwave expands

      // Central fireball
      ctx.globalAlpha = (1 - pct) * 0.9;
      const fg = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, fireball));
      fg.addColorStop(0,   'rgba(255,255,220,1)');
      fg.addColorStop(0.2, 'rgba(255,180,30,0.95)');
      fg.addColorStop(0.5, 'rgba(220,70,10,0.8)');
      fg.addColorStop(1,   'rgba(80,20,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(1, fireball), 0, Math.PI * 2);
      ctx.fill();

      // Smoke plume rising
      if (pct > 0.2) {
        const smokeR = maxR * (pct - 0.2) * 1.4;
        const smokeY = iy - smokeR * 1.5 * (pct - 0.2);
        ctx.globalAlpha = (pct - 0.2) * (1 - pct) * 1.5;
        const sg = ctx.createRadialGradient(ix, smokeY, 0, ix, smokeY, Math.max(1, smokeR));
        sg.addColorStop(0, 'rgba(60,55,50,0.8)');
        sg.addColorStop(1, 'rgba(60,55,50,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(ix, smokeY, smokeR * 0.8, smokeR, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Expanding shockwave ring
      ctx.globalAlpha = (1 - pct) * 0.5;
      ctx.strokeStyle = 'rgba(255,120,40,0.8)';
      ctx.lineWidth = Math.max(1, (1 - pct) * 4);
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(1, shockR), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

    } else if (ef.type === 'emp_burst') {
      // Electric cyan expanding rings
      const maxR = ef.radius * 0.5;
      for (let ring = 0; ring < 3; ring++) {
        const ringPct = Math.min(1, pct * 1.5 + ring * 0.15);
        const ringR   = maxR * ringPct;
        const alpha   = (1 - ringPct) * 0.7;
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ring === 0 ? '#00eeff' : ring === 1 ? '#44aaff' : '#ffffff';
        ctx.lineWidth = (3 - ring) * (1 - pct) + 0.5;
        ctx.beginPath();
        ctx.arc(ix, iy, Math.max(1, ringR), 0, Math.PI * 2);
        ctx.stroke();
      }
      // Central flash
      if (pct < 0.2) {
        const flashR = maxR * 0.25 * (1 - pct / 0.2);
        ctx.globalAlpha = (1 - pct / 0.2) * 0.8;
        const fg = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, flashR));
        fg.addColorStop(0, 'rgba(220,255,255,1)');
        fg.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(ix, iy, Math.max(1, flashR), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

    } else if (ef.type === 'battlecry') {
      // Expanding golden ring + inner fill burst
      const maxR = ef.radius * 0.55; // convert sim radius to rough iso scale
      const ringR = maxR * pct;       // ring expands outward
      const alpha = (1 - pct) * 0.75;

      // Outer expanding ring
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 4 * (1 - pct) + 1;
      ctx.beginPath();
      ctx.arc(ix, iy, Math.max(1, ringR), 0, Math.PI * 2);
      ctx.stroke();

      // Second ring slightly behind (trail)
      if (pct > 0.1) {
        const trail = maxR * (pct - 0.1);
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, Math.max(1, trail), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Central burst at start
      if (pct < 0.3) {
        const burstR = maxR * 0.3 * (1 - pct / 0.3);
        ctx.globalAlpha = (1 - pct / 0.3) * 0.6;
        const bg = ctx.createRadialGradient(ix, iy, 0, ix, iy, Math.max(1, burstR));
        bg.addColorStop(0, 'rgba(255,255,200,0.9)');
        bg.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(ix, iy, Math.max(1, burstR), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  _renderEnemyGhosts(ctx, cam) {
    const GHOST_LIFETIME = 30000; // 30 seconds before ghost fades out
    for (const u of this.units) {
      if (u.dead || u.playerId === 0) continue;
      if (u._ghostX === null) continue;
      if (u._ghostAge > GHOST_LIFETIME) continue;
      // Only draw if currently NOT visible (it's in fog)
      if (this.fog.isWorldVisible(u.x, u.y)) continue;

      const fadeAlpha = Math.max(0, 1 - u._ghostAge / GHOST_LIFETIME) * 0.45;
      if (fadeAlpha < 0.02) continue;

      const iso = simToIso(u._ghostX, u._ghostY);
      const wx = iso.x, wy = iso.y;
      const r = u.radius;

      // Cull
      if (wx + r < cam.worldX || wx - r > cam.worldX + cam.viewW / cam.zoom) continue;
      if (wy + r < cam.worldY || wy - r > cam.worldY + cam.viewH / cam.zoom) continue;

      ctx.globalAlpha = fadeAlpha;
      // Draw faded ghost circle
      ctx.fillStyle = PLAYER_COLORS[u.playerId];
      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Question mark
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${r * 0.9}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', wx, wy);
      ctx.globalAlpha = 1;
    }
  }

  _renderAgeAdvanceBanner(ctx, W, H) {
    const TOTAL = 3500;
    const elapsed = TOTAL - this._ageAdvanceTimer;
    // Fade in over 400ms, hold, fade out over 800ms at end
    let alpha;
    if (elapsed < 400) {
      alpha = elapsed / 400;
    } else if (this._ageAdvanceTimer < 800) {
      alpha = this._ageAdvanceTimer / 800;
    } else {
      alpha = 1;
    }

    const ageName = this._ageAdvanceName || '';
    const ageColors = { 'Dark Age':'#8a7060', 'Feudal Age':'#7090a0', 'Castle Age':'#6080b0', 'Imperial Age':'#c8a840' };
    const color = ageColors[ageName] || '#c8a94e';

    // Semi-transparent dark overlay band
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = 'rgba(10,8,5,0.9)';
    ctx.fillRect(0, H / 2 - 80, W, 160);
    ctx.globalAlpha = alpha;

    // Horizontal separator lines
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W * 0.05, H / 2 - 78); ctx.lineTo(W * 0.95, H / 2 - 78); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.05, H / 2 + 78); ctx.lineTo(W * 0.95, H / 2 + 78); ctx.stroke();

    // "AGE ADVANCE" label
    ctx.fillStyle = 'rgba(180,160,120,0.9)';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ AGE ADVANCE ✦', W / 2, H / 2 - 44);

    // Age name (large)
    ctx.fillStyle = color;
    ctx.font = `bold 52px Arial`;
    ctx.fillText(ageName.toUpperCase(), W / 2, H / 2 + 6);

    // Subtitle
    ctx.fillStyle = 'rgba(200,185,155,0.85)';
    ctx.font = '14px Arial';
    ctx.fillText('New technologies and units now available', W / 2, H / 2 + 52);

    ctx.restore();
  }

  _renderGameOver(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(0, 0, W, H);

    const isWin = this.winner === 0;
    const cx = W / 2, cy = H / 2;
    const panelW = 580, panelH = 390;
    const px = cx - panelW / 2, py = cy - panelH / 2;

    // Panel background
    ctx.fillStyle = isWin ? 'rgba(12,40,12,0.97)' : 'rgba(40,12,12,0.97)';
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = isWin ? '#44cc44' : '#cc4444';
    ctx.lineWidth = 3;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.stroke();

    // Title
    ctx.fillStyle = isWin ? '#88ff88' : '#ff8888';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isWin ? 'VICTORY!' : 'DEFEAT', cx, py + 48);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '16px Arial';
    ctx.fillText(isWin ? 'The enemy empire is destroyed!' : 'Your Town Center has fallen!', cx, py + 84);

    const t = this.gameTime / 1000;
    const mins = Math.floor(t / 60), secs = Math.floor(t % 60);
    ctx.fillStyle = '#7788aa';
    ctx.font = '14px Arial';
    ctx.fillText(`Game Time: ${mins}:${secs.toString().padStart(2,'0')}`, cx, py + 108);

    // Stats columns: player vs AI
    const p0 = this.players[0], p1 = this.players[1];
    const s0 = p0.stats, s1 = p1.stats;
    const colL = px + 50, colR = px + panelW - 50;
    const statsY = py + 138;

    // Column headers
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = PLAYER_COLORS[0];
    ctx.fillText('YOU', colL + 100, statsY);
    ctx.fillStyle = '#cccccc';
    ctx.fillText('STAT', cx, statsY);
    ctx.fillStyle = PLAYER_COLORS[1];
    ctx.fillText('AI', colR - 100, statsY);

    // Divider
    ctx.strokeStyle = '#445544';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 20, statsY + 14);
    ctx.lineTo(px + panelW - 20, statsY + 14);
    ctx.stroke();

    const rows = [
      ['Units Killed',    s0.unitsKilled,    s1.unitsKilled],
      ['Units Trained',   s0.unitsTrained,   s1.unitsTrained],
      ['Buildings Built', s0.buildingsBuilt,  s1.buildingsBuilt],
      ['Bldgs Destroyed', s0.buildingsDestroyed, s1.buildingsDestroyed],
      ['Wood Gathered',   Math.round(s0.woodGathered),  Math.round(s1.woodGathered)],
      ['Food Gathered',   Math.round(s0.foodGathered),  Math.round(s1.foodGathered)],
      ['Gold Gathered',   Math.round(s0.goldGathered),  Math.round(s1.goldGathered)],
    ];

    rows.forEach(([label, v0, v1], i) => {
      const ry = statsY + 28 + i * 22;
      const isP0Better = v0 > v1;
      const isP1Better = v1 > v0;

      ctx.font = '13px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cccccc';
      ctx.fillText(label, cx, ry);

      ctx.font = `${isP0Better ? 'bold' : ''} 13px Arial`.trim();
      ctx.fillStyle = isP0Better ? '#88ff88' : '#aaaaaa';
      ctx.fillText(v0, colL + 100, ry);

      ctx.font = `${isP1Better ? 'bold' : ''} 13px Arial`.trim();
      ctx.fillStyle = isP1Better ? '#ff8888' : '#aaaaaa';
      ctx.fillText(v1, colR - 100, ry);
    });

    // Bar showing resource totals (simple visual)
    const totalRes0 = Math.round(s0.woodGathered + s0.foodGathered + s0.goldGathered);
    const totalRes1 = Math.round(s1.woodGathered + s1.foodGathered + s1.goldGathered);
    const totalMax  = Math.max(1, totalRes0 + totalRes1);
    const barY = py + panelH - 88;
    const barW = panelW - 100;
    const barH = 12;
    const barX = px + 50;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    const p0w = barW * (totalRes0 / totalMax);
    ctx.fillStyle = PLAYER_COLORS[0];
    ctx.fillRect(barX, barY, p0w, barH);
    ctx.fillStyle = PLAYER_COLORS[1];
    ctx.fillRect(barX + p0w, barY, barW - p0w, barH);
    ctx.fillStyle = '#888';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Total Resources Gathered', barX, barY - 5);

    // Play Again button
    const bx = cx - 90, by = py + panelH - 56;
    ctx.fillStyle = '#2a4060';
    roundRect(ctx, bx, by, 180, 42, 8);
    ctx.fill();
    ctx.strokeStyle = '#4488aa';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, 180, 42, 8);
    ctx.stroke();
    ctx.fillStyle = '#ccddff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Play Again', cx, by + 21);
    this._restartBtn = { x: bx, y: by, w: 180, h: 42 };
  }

  handleRestartClick(sx, sy) {
    if (!this.gameOver || !this._restartBtn) return;
    const b = this._restartBtn;
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
      this._restart();
    }
  }

  _restart() {
    SpriteR.init();
    this.units         = [];
    this.buildings     = [];
    this.resourceNodes = [];
    this.projectiles   = [];
    this.effects       = [];
    this.gameOver      = false;
    this.winner        = null;
    this.gameTime      = 0;

    this.players = [
      new Player(0, PLAYER_COLORS[0]),
      new Player(1, PLAYER_COLORS[1]),
    ];

    this.map        = new GameMap();
    this.pathfinder = new Pathfinder(this.map);
    this.fog        = new FogOfWar(MAP_W, MAP_H);
    this.camera     = new Camera(this.canvas.width, this.canvas.height - UI_TOP_H);
    this.selection  = new SelectionManager(this);
    this.input.game = this;
    this.input.buildMode = false;
    this.ai         = new AIController(this);
    this.ui         = new UIManager(this);
    this.ui.notifications = [];

    this.init();
  }
}
