// ============================================================
// IRON DOMINION - Building Entity
// ============================================================

class Building extends Entity {
  constructor(buildingType, tx, ty, playerId, game) {
    const def = BUILDING_DEFS[buildingType];
    const cx = (tx + def.size / 2) * TILE_SIZE;
    const cy = (ty + def.size / 2) * TILE_SIZE;
    super(buildingType, cx, cy, playerId);

    this.game        = game;
    this.def         = def;
    this.name        = def.name;
    this.size        = def.size;
    this.tileX       = tx;
    this.tileY       = ty;

    this.maxHp       = def.maxHp;
    this.hp          = def.maxHp * 0.01; // Start at 1% hp (under construction)
    this.built       = false;
    this.buildProgress = 0; // 0-100

    this.meleeArmor  = 0;
    this.pierceArmor = 0;

    // Training queue
    this.trainQueue  = [];
    this.trainTimer  = 0;
    this.trainTotal  = 0;
    this.autoTrain   = null; // unit type to keep re-queuing when queue empties

    // Research queue
    this.researchQueue = [];
    this.researchTimer = 0;
    this.researchTotal = 0;

    // Attack (towers, town centers)
    this.atk         = def.atk || 0;
    this.atkRange    = (def.atkRange || 0) * TILE_SIZE;
    this.atkCooldown = def.atkCooldown || 0;
    this.atkTimer    = 0;
    this.hasProjectile = true;

    // Rally point
    this.rallyX = cx + def.size * TILE_SIZE * 0.5 + TILE_SIZE;
    this.rallyY = cy;

    // Food farm state
    this.farmTimer   = 0;
    this.foodYield   = def.foodYield || 0;
    this.farmStored  = this.foodYield;

    // Floats
    this.floats = [];

    // Garrison
    this.garrisonedUnits = [];

    // Damage state timer (fire/smoke effects)
    this._damageEffectTimer = 0;
  }

  get tx() { return this.tileX; }
  get ty() { return this.tileY; }

  // ── Update ───────────────────────────────────────────────
  update(dt) {
    if (this.dead) return;

    // Building under construction
    if (!this.built) {
      this.hp = (this.buildProgress / 100) * this.maxHp;
      return;
    }

    // Training queue
    if (this.trainTimer > 0) {
      this.trainTimer -= dt;
      if (this.trainTimer <= 0) {
        this._finishTraining();
      }
    }

    // Research queue
    if (this.researchTimer > 0) {
      this.researchTimer -= dt;
      if (this.researchTimer <= 0) {
        this._finishResearch();
      }
    }

    // Auto-attack turret behavior
    if (this.atk > 0 && this.atkTimer <= 0) {
      const enemy = this._findNearestEnemy();
      if (enemy) {
        this.game.spawnProjectile(this, enemy);
        this.atkTimer = this.atkCooldown;
      }
    }
    if (this.atkTimer > 0) this.atkTimer = Math.max(0, this.atkTimer - dt);

    // Heal garrisoned units
    for (const u of this.garrisonedUnits) {
      if (u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt / 1000);
      }
    }

    // Garrison bonus arrows: garrisoned units each contribute an arrow shot
    if (this.garrisonedUnits.length > 0 && this.atk > 0 && this.atkTimer <= 0) {
      const bonusEnemy = this._findNearestEnemy();
      if (bonusEnemy) {
        const bonusShots = Math.floor(this.garrisonedUnits.length / 2);
        for (let i = 0; i < bonusShots; i++) {
          this.game.spawnProjectile(this, bonusEnemy);
        }
      }
    }

    // Fire/smoke damage state effects
    if (this.built && this.hp < this.maxHp * 0.5) {
      this._damageEffectTimer += dt;
      const interval = this.hp < this.maxHp * 0.25 ? 400 : 900;
      if (this._damageEffectTimer >= interval) {
        this._damageEffectTimer = 0;
        const ox = (Math.random() - 0.5) * this.size * TILE_SIZE * 0.6;
        const oy = (Math.random() - 0.5) * this.size * TILE_SIZE * 0.4;
        const isCritical = this.hp < this.maxHp * 0.25;
        this.game.spawnEffect({
          type: isCritical ? 'fire' : 'building_smoke',
          x: this.x + ox, y: this.y + oy - this.size * TILE_SIZE * 0.4,
          life: isCritical ? 900 : 1400,
          radius: isCritical ? 10 : 14,
          vx: (Math.random() - 0.5) * 6,
          vy: -18 - Math.random() * 10,
        });
      }
    }

    // Farm generates food slowly (boosted by Mill research)
    if (this.type === 'FARM' && this.farmStored > 0) {
      this.farmTimer += dt;
      if (this.farmTimer >= 5000) {
        this.farmTimer = 0;
        const player = this.game.players[this.playerId];
        const yieldMult = player.getFarmYieldBonus ? player.getFarmYieldBonus() : 1;
        const gain = Math.min(5 * yieldMult, this.farmStored);
        player.addResource('food', gain);
        this.farmStored -= gain;
      }
    }

    // Floating damage numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].life -= dt;
      this.floats[i].y -= dt * 0.02;
      if (this.floats[i].life <= 0) this.floats.splice(i, 1);
    }
  }

  // ── Training ─────────────────────────────────────────────
  enqueueUnit(unitType) {
    const def = UNIT_DEFS[unitType];
    if (!def) return false;
    if (!this.def.trainUnits || !this.def.trainUnits.includes(unitType)) return false;
    if (this.trainQueue.length >= 5) return false;

    const player = this.game.players[this.playerId];
    // Age requirement for unit type
    if (def.requires && AGE_ORDER.indexOf(player.age) < AGE_ORDER.indexOf(def.requires)) return false;
    if (!player.canAfford(def.cost)) return false;
    if (player.pop >= player.popCap) return false;

    // Hero limit: one WARLORD per player
    if (def.isHero) {
      const alreadyExists = player.units.some(u => !u.dead && u.type === unitType) ||
                            this.trainQueue.includes(unitType);
      if (alreadyExists) return 'hero_limit';
    }

    player.spend(def.cost);
    this.trainQueue.push(unitType);
    if (this.trainTimer <= 0) this._startNextTraining();
    return true;
  }

  cancelTraining(index) {
    if (index === 0 && this.trainTimer > 0) {
      // Refund in progress unit
      const utype = this.trainQueue[0];
      const def = UNIT_DEFS[utype];
      const player = this.game.players[this.playerId];
      // Partial refund
      const refundPct = this.trainTimer / this.trainTotal;
      for (const [res, amt] of Object.entries(def.cost)) {
        player[res] += Math.floor(amt * refundPct);
      }
      this.trainQueue.splice(0, 1);
      this.trainTimer = 0;
      if (this.trainQueue.length > 0) this._startNextTraining();
    } else if (index > 0 && index < this.trainQueue.length) {
      const utype = this.trainQueue[index];
      const def = UNIT_DEFS[utype];
      const player = this.game.players[this.playerId];
      for (const [res, amt] of Object.entries(def.cost)) {
        player[res] += amt;
      }
      this.trainQueue.splice(index, 1);
    }
  }

  _startNextTraining() {
    if (this.trainQueue.length === 0) return;
    const utype = this.trainQueue[0];
    const def   = UNIT_DEFS[utype];
    this.trainTimer = def.trainTime;
    this.trainTotal = def.trainTime;
  }

  _finishTraining() {
    const utype = this.trainQueue.shift();
    this.trainTimer = 0;
    if (this.playerId === 0 && typeof Sound !== 'undefined') Sound.complete();
    const trainPlayer = this.game.players[this.playerId];
    if (trainPlayer && trainPlayer.stats) trainPlayer.stats.unitsTrained++;
    // Spawn unit adjacent to building, then walk to rally point
    const spawnX = this.x + this.size * TILE_SIZE * 0.5 + TILE_SIZE;
    const spawnY = this.y + this.size * TILE_SIZE * 0.5;
    const unit = this.game.spawnUnit(utype, spawnX, spawnY, this.playerId);
    // Walk to rally point if it's meaningfully different from spawn
    if (unit) {
      const dx = this.rallyX - spawnX, dy = this.rallyY - spawnY;
      if (dx * dx + dy * dy > TILE_SIZE * TILE_SIZE * 4) {
        const rtx = Math.floor(this.rallyX / TILE_SIZE);
        const rty = Math.floor(this.rallyY / TILE_SIZE);
        unit.cmdMove(rtx, rty);
      }
    }
    if (this.trainQueue.length > 0) {
      this._startNextTraining();
    } else if (this.autoTrain) {
      // Auto-queue the same unit type again
      this.enqueueUnit(this.autoTrain);
    }
  }

  get trainProgress() {
    if (this.trainTotal === 0 || this.trainQueue.length === 0) return 0;
    return 1 - this.trainTimer / this.trainTotal;
  }

  // ── Research ──────────────────────────────────────────────
  enqueueResearch(key) {
    const def = RESEARCH_DEFS[key];
    if (!def) return false;
    if (def.building !== this.type) return false;
    if (this.researchQueue.length >= 1) return false; // one at a time per building

    const player = this.game.players[this.playerId];
    if (!player.canAfford(def.cost)) return false;
    if (!player.canResearch(key)) return false;

    player.spend(def.cost);
    this.researchQueue.push(key);
    if (this.researchTimer <= 0) this._startNextResearch();
    return true;
  }

  cancelResearch(index) {
    if (index === 0 && this.researchTimer > 0) {
      const key = this.researchQueue[0];
      const def = RESEARCH_DEFS[key];
      const player = this.game.players[this.playerId];
      const refundPct = this.researchTimer / this.researchTotal;
      for (const [res, amt] of Object.entries(def.cost)) player[res] += Math.floor(amt * refundPct);
      this.researchQueue.splice(0, 1);
      this.researchTimer = 0;
      this.researchTotal = 0;
    }
  }

  _startNextResearch() {
    if (this.researchQueue.length === 0) return;
    const def = RESEARCH_DEFS[this.researchQueue[0]];
    this.researchTimer = def.time;
    this.researchTotal = def.time;
  }

  _finishResearch() {
    const key = this.researchQueue.shift();
    this.researchTimer = 0;
    this.researchTotal = 0;
    const player = this.game.players[this.playerId];
    player.researched.add(key);
    const def = RESEARCH_DEFS[key];
    this.game.ui.addNotification(`Research complete: ${def.name}!`, '#c8e888');
    if (this.playerId === 0 && typeof Sound !== 'undefined') Sound.research();
    if (this.researchQueue.length > 0) this._startNextResearch();
  }

  get researchProgress() {
    if (this.researchTotal === 0 || this.researchQueue.length === 0) return 0;
    return 1 - this.researchTimer / this.researchTotal;
  }

  // ── Enemy scan ───────────────────────────────────────────
  _findNearestEnemy() {
    let best = null, bestDist = this.atkRange;
    for (const u of this.game.units) {
      if (u.dead || u.playerId === this.playerId) continue;
      const d = this.distTo(u);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    return best;
  }

  // ── Damage ───────────────────────────────────────────────
  takeDamage(amount, attacker) {
    const prevHp = this.hp;
    this.hp -= Math.max(0, amount);
    this.floats.push({ text: Math.round(amount), x: this.x, y: this.y - this.size * TILE_SIZE / 2, life: 900, color: '#ff8888' });
    if (this.playerId === 0 && this.built) this.game.triggerAttackAlert(this.x, this.y);
    // Critical damage warning (crosses 25% threshold)
    if (this.playerId === 0 && this.built && this.game.ui) {
      const threshold = this.maxHp * 0.25;
      if (prevHp > threshold && this.hp <= threshold) {
        this.game.ui.addNotification(`⚠ ${this.def.name} critically damaged!`, '#ff9900');
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker);
    }
  }

  die(attacker) {
    if (this.dead) return;
    this.dead = true;

    // Eject garrisoned units around the building
    for (const u of [...this.garrisonedUnits]) {
      u.garrisoned = false;
      u.garrisonBuilding = null;
      u.x = this.x + (Math.random() - 0.5) * this.size * TILE_SIZE * 0.8;
      u.y = this.y + (Math.random() - 0.5) * this.size * TILE_SIZE * 0.8;
      u._setState(UNIT_STATE.IDLE);
    }
    this.garrisonedUnits = [];

    // Free map tiles
    this.game.map.occupyBuilding(this.tileX, this.tileY, this.size, true);
    // Remove from player buildings
    const player = this.game.players[this.playerId];
    const idx = player.buildings.indexOf(this);
    if (idx !== -1) player.buildings.splice(idx, 1);
    // Recalc pop cap
    player.recalcPopCap();
    // Track destruction stat for attacker
    if (attacker && attacker.playerId !== undefined && attacker.playerId !== this.playerId) {
      const attackerPlayer = this.game.players[attacker.playerId];
      if (attackerPlayer && attackerPlayer.stats) attackerPlayer.stats.buildingsDestroyed++;
    }
    // Notification for player buildings lost
    if (this.playerId === 0 && this.game.ui) {
      const isTC = this.type === 'TOWN_CENTER';
      this.game.ui.addNotification(
        `${isTC ? '🏰 ' : ''}${this.def.name} destroyed!`,
        isTC ? '#ff2222' : '#ff6644'
      );
    }
    // Notification when enemy loses buildings (intel)
    if (this.playerId === 1 && this.game.ui) {
      this.game.ui.addNotification(`Enemy ${this.def.name} destroyed!`, '#88ff44');
    }

    // Check win/lose
    if (this.type === 'TOWN_CENTER') {
      this.game.onTownCenterDestroyed(this.playerId);
    }
  }

  // ── Render ───────────────────────────────────────────────
  // Called inside ctx.scale(zoom)/ctx.translate(-worldX,-worldY) transform block
  render(ctx, camera) {
    if (this.dead) return;

    // Convert tile position to isometric world position
    const isoTL = tileToIso(this.tileX, this.tileY);
    const isoBR = tileToIso(this.tileX + this.size, this.tileY + this.size);
    const isoCenter = simToIso(this.x, this.y);

    // Isometric bounding for culling: use the footprint diamond extents
    const isoMinX = tileToIso(this.tileX, this.tileY + this.size).x;
    const isoMaxX = tileToIso(this.tileX + this.size, this.tileY).x + ISO_TILE_W;
    const isoMinY = isoTL.y;
    const isoMaxY = isoBR.y + ISO_TILE_H;

    if (isoMaxX < camera.worldX || isoMinX > camera.worldX + camera.viewW / camera.zoom) return;
    if (isoMaxY < camera.worldY || isoMinY > camera.worldY + camera.viewH / camera.zoom) return;

    // Draw building sprite
    SpriteR.drawBuilding(ctx, this, camera, isoTL, isoCenter);

    // Selection glow
    if (this.selected) {
      const glowW = (isoMaxX - isoMinX) * 0.7;
      SpriteR.drawSelectionGlow(ctx, isoCenter.x, isoCenter.y, glowW * 0.5, PLAYER_COLORS[this.playerId], camera.zoom);
    }

    // Health bar
    const barW = this.size * ISO_TILE_W * 0.8;
    SpriteR.drawHealthBar(ctx, isoCenter.x, isoMinY - 8/camera.zoom, barW, this.hp, this.maxHp, camera.zoom);

    // Construction overlay (scaffold effect)
    if (!this.built) {
      const pct = this.buildProgress / 100;
      // Progress bar below building
      const bh = 4 / camera.zoom;
      ctx.fillStyle = '#111a';
      ctx.fillRect(isoCenter.x - barW/2, isoMaxY + 2/camera.zoom, barW, bh);
      ctx.fillStyle = '#44ee88';
      ctx.fillRect(isoCenter.x - barW/2, isoMaxY + 2/camera.zoom, barW * pct, bh);
    }

    // Training progress bar
    if (this.built && this.trainQueue.length > 0) {
      const bh = 3 / camera.zoom;
      ctx.fillStyle = '#111a';
      ctx.fillRect(isoCenter.x - barW/2, isoMaxY + 6/camera.zoom, barW, bh);
      ctx.fillStyle = '#88aaff';
      ctx.fillRect(isoCenter.x - barW/2, isoMaxY + 6/camera.zoom, barW * this.trainProgress, bh);
    }

    // Rally point
    if (this.selected && this.built && this.def.trainUnits) {
      const riso = simToIso(this.rallyX, this.rallyY);
      ctx.strokeStyle = PLAYER_COLORS[this.playerId];
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.setLineDash([4/camera.zoom, 3/camera.zoom]);
      ctx.beginPath();
      ctx.moveTo(isoCenter.x, isoCenter.y);
      ctx.lineTo(riso.x, riso.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PLAYER_COLORS[this.playerId];
      ctx.beginPath();
      ctx.arc(riso.x, riso.y, 5/camera.zoom, 0, Math.PI*2);
      ctx.fill();
    }

    // Garrison count indicator
    if (this.built && this.garrisonedUnits.length > 0) {
      const maxG = this.def.maxGarrison || 0;
      const gx = isoCenter.x;
      const gy = isoMinY - 20 / camera.zoom;
      const iconR = 5 / camera.zoom;
      ctx.fillStyle = '#fff8cc';
      ctx.beginPath();
      ctx.arc(gx - iconR * 1.6, gy, iconR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#443300';
      ctx.font = `bold ${9 / camera.zoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.garrisonedUnits.length, gx - iconR * 1.6, gy + 0.5 / camera.zoom);
      ctx.fillStyle = '#cccccc';
      ctx.font = `${8 / camera.zoom}px Arial`;
      ctx.fillText(`/${maxG}`, gx + iconR * 1.2, gy);
    }

    // Floating damage
    for (const f of this.floats) {
      const fiso = simToIso(f.x, f.y);
      SpriteR.drawFloatingText(ctx, f.text, fiso.x, fiso.y, Math.min(1, f.life/400), f.color, 12/camera.zoom, camera.zoom);
    }
  }

  _getShortLabel() {
    switch (this.type) {
      case 'TOWN_CENTER':    return 'TC';
      case 'HOUSE':          return '🏠';
      case 'BARRACKS':       return 'BRK';
      case 'ARCHERY_RANGE':  return 'AR';
      case 'STABLE':         return 'STB';
      case 'SIEGE_WORKSHOP': return 'SW';
      case 'BLACKSMITH':     return 'BS';
      case 'LUMBER_CAMP':    return 'LC';
      case 'MINING_CAMP':    return 'MC';
      case 'MILL':           return 'ML';
      case 'FARM':           return 'FM';
      case 'TOWER':          return 'TW';
      case 'WALL':           return 'WL';
      default: return this.type.slice(0, 3);
    }
  }

  _blendWithGray(hex, t) {
    // t=0: original, t=1: gray
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const gray = 120;
    const nr = Math.round(r + (gray - r) * t);
    const ng = Math.round(g + (gray - g) * t);
    const nb = Math.round(b + (gray - b) * t);
    return `rgb(${nr},${ng},${nb})`;
  }
}
