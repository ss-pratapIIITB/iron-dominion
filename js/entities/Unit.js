// ============================================================
// IRON DOMINION - Unit Entity
// FSM: IDLE | MOVING | ATTACKING | GATHERING | RETURNING_RESOURCE | BUILDING | DEAD
// ============================================================

class Unit extends Entity {
  constructor(unitType, x, y, playerId, game) {
    super(unitType, x, y, playerId);
    this.game = game;

    const def = UNIT_DEFS[unitType];
    this.def         = def;
    this.name        = def.name;
    this.hp          = def.maxHp;
    this.maxHp       = def.maxHp;
    this.atk         = def.atk;
    this.atkRange    = def.atkRange * TILE_SIZE;  // pixels
    this.atkCooldown = def.atkCooldown;
    this.speed       = def.speed * TILE_SIZE;     // pixels/sec
    this.los         = def.los;                    // tile radius
    this.meleeArmor  = def.meleeArmor || 0;
    this.pierceArmor = def.pierceArmor || 0;
    this.unitClass   = def.class;
    this.gatherRate  = def.gatherRate || 0;
    this.carryCap    = def.carryCap || 0;
    this.size        = def.size || 1.0;
    this.hasProjectile = !!def.projectile;

    this.radius = Math.round(18 * this.size);

    // State machine
    this.state      = UNIT_STATE.IDLE;
    this.path       = [];
    this.pathTarget = null;  // {tx,ty}
    this.target     = null;  // entity to attack
    this.atkTimer   = 0;     // ms until next attack

    // Gathering
    this.gatherTarget   = null; // ResourceNode
    this.carrying       = 0;
    this.carryType      = null;
    this.gatherProgress = 0;    // ms progress toward gather tick

    // Building / repair
    this.buildTarget  = null;   // Building under construction or being repaired
    this.buildTimer   = 0;
    this.repairMode   = false;  // true when build target is already-built (repair)

    // Animation
    this.facing    = 0;  // radians
    this.walkFrame = 0;
    this.walkTimer = 0;

    // Stuck detection
    this.stuckTimer   = 0;
    this.lastX        = x;
    this.lastY        = y;

    // Rally point reference (for returning resources)
    this.rallyBuilding = null;

    // Floating damage numbers
    this.floats = [];

    // Auto-attack aggro range (tiles)
    this.aggroRange = def.atkRange * TILE_SIZE * 1.5;

    // Stance: AGGRESSIVE (default military), DEFENSIVE, PASSIVE (default civilian)
    this.stance = (def.class === 'civilian') ? 'PASSIVE' : 'AGGRESSIVE';

    // Patrol waypoints
    this.patrolA = null; // {tx, ty}
    this.patrolB = null; // {tx, ty}
    this.patrolGoingToB = true;

    // Attack-move: move to destination but attack enemies on the way
    this.attackMoving = false;
    this.attackMoveDest = null; // {tx, ty}

    // Garrisoning
    this.garrisoned       = false;
    this.garrisonBuilding = null;
    this._garrisonTarget  = null;

    // Veteran system (kills tracked; 3+ kills = veteran, 7+ kills = elite)
    this.kills     = 0;
    this.isVeteran = false;
    this.isElite   = false; // Elite tier: 7+ kills

    // Enemy ghost tracking (last-seen position for fog rendering)
    this._ghostX    = null;
    this._ghostY    = null;
    this._ghostAge  = 0;   // ms since unit was last visible (counts up)

    // Upkeep broke penalty flag (set by Player each tick)
    this._upkeepBroke = false;

    // Trebuchet pack/unpack mechanic (not applicable to mechanical siege like tanks)
    this._packed     = (def.class === 'siege' && !def.isMechSiege); // treb starts packed; tanks don't
    this._packTimer  = 0;    // ms remaining in pack/unpack transition (0 = settled)
    this._packingDir = 0;    // +1 = unpacking, -1 = packing

    // Active buff system (Battlecry and future abilities)
    this._buffAtk    = 0;    // bonus attack while buffed
    this._buffSpeed  = 0;    // speed multiplier bonus (0.4 = +40%)
    this._buffTimer  = 0;    // ms remaining on buff

    // Ability cooldown (hero units only)
    this._abilityCooldown = 0; // ms remaining

    // Out-of-combat regeneration (civilian units never regen)
    this._combatCooldown = 0; // ms remaining; set when attacking or hit

    // PARALYZED state (from Monk EMP burst)
    this._paralyzeTimer = 0; // ms remaining; >0 = cannot act

    // Monk-specific: heal path cooldown
    this._healPathTimer = 0;
  }

  // ── Main update ───────────────────────────────────────────
  update(dt) {
    if (this.dead) return;

    // Handle garrisoned state: heal inside building, skip normal update
    if (this.garrisoned) {
      if (this.garrisonBuilding && this.garrisonBuilding.dead) {
        // Building destroyed — eject (building.die handles this, but safety net)
        this.garrisoned = false;
        this.garrisonBuilding = null;
      } else {
        // Heal at 5% max HP per second while garrisoned
        if (this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05 * dt / 1000);
        }
        return;
      }
    }

    // If walking to garrison a building, enter when close enough
    if (this._garrisonTarget) {
      if (this._garrisonTarget.dead) {
        this._garrisonTarget = null;
      } else if (this.distTo(this._garrisonTarget) <= TILE_SIZE * 2.5) {
        this._enterGarrison(this._garrisonTarget);
        this._garrisonTarget = null;
        return;
      }
    }

    // Ghost tracking: enemy units update their last-known position when visible
    if (this.playerId !== 0) {
      if (this.game.fog.isWorldVisible(this.x, this.y)) {
        this._ghostX   = this.x;
        this._ghostY   = this.y;
        this._ghostAge = 0;
      } else if (this._ghostX !== null) {
        this._ghostAge += dt;
      }
    }

    // Count down attack cooldown
    if (this.atkTimer > 0) {
      this.atkTimer = Math.max(0, this.atkTimer - dt);
    }

    // Tick down active buffs
    if (this._buffTimer > 0) {
      this._buffTimer = Math.max(0, this._buffTimer - dt);
      if (this._buffTimer <= 0) {
        this._buffAtk   = 0;
        this._buffSpeed = 0;
      }
    }
    // Tick down ability cooldown
    if (this._abilityCooldown > 0) {
      this._abilityCooldown = Math.max(0, this._abilityCooldown - dt);
    }

    // Out-of-combat regeneration for non-civilian military units
    if (this.unitClass !== 'civilian' && this.hp < this.maxHp) {
      if (this._combatCooldown > 0) {
        this._combatCooldown = Math.max(0, this._combatCooldown - dt);
      } else {
        // 0.5% maxHp/s normally, 1% for elite units
        const regenRate = this.isElite ? 0.01 : 0.005;
        const regen = this.maxHp * regenRate * dt / 1000;
        this.hp = Math.min(this.maxHp, this.hp + regen);
      }
    }

    // Trebuchet pack/unpack transition
    if (this._packTimer > 0) {
      this._packTimer = Math.max(0, this._packTimer - dt);
      if (this._packTimer <= 0) {
        // Transition complete — flip packed state
        this._packed = (this._packingDir === -1); // -1=packing → now packed; +1=unpacking → now unpacked
        this._packingDir = 0;
      }
    }

    // Update floating damage numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].life -= dt;
      this.floats[i].y -= dt * 0.03;
      if (this.floats[i].life <= 0) this.floats.splice(i, 1);
    }

    // Walk animation
    this.walkTimer += dt;
    if (this.walkTimer > 200) { this.walkFrame = (this.walkFrame + 1) % 4; this.walkTimer = 0; }

    // PARALYZED: can't act until timer expires
    if (this._paralyzeTimer > 0) {
      this._paralyzeTimer = Math.max(0, this._paralyzeTimer - dt);
      if (this._paralyzeTimer <= 0) this._setState(UNIT_STATE.IDLE);
      return;
    }

    // Monk passive: heal nearby friendlies every tick
    if (this.unitClass === 'support' && this.def.healRate) {
      const healR = (this.def.healRadius || 1.5) * TILE_SIZE;
      for (const u of this.game.units) {
        if (u.dead || u.playerId !== this.playerId || u === this || u.hp >= u.maxHp) continue;
        if (this.distTo(u) <= healR) {
          u.hp = Math.min(u.maxHp, u.hp + this.def.healRate * dt / 1000);
        }
      }
    }

    switch (this.state) {
      case UNIT_STATE.IDLE:               this._updateIdle(dt); break;
      case UNIT_STATE.MOVING:             this._updateMoving(dt); break;
      case UNIT_STATE.ATTACKING:          this._updateAttacking(dt); break;
      case UNIT_STATE.GATHERING:          this._updateGathering(dt); break;
      case UNIT_STATE.RETURNING_RESOURCE: this._updateReturning(dt); break;
      case UNIT_STATE.BUILDING:           this._updateBuilding(dt); break;
      case UNIT_STATE.PATROL:             this._updatePatrol(dt); break;
    }
  }

  // ── IDLE ─────────────────────────────────────────────────
  _updateIdle(dt) {
    // Monks auto-walk toward nearest damaged friendly in 6-tile radius
    if (this.unitClass === 'support') {
      this._healPathTimer = Math.max(0, this._healPathTimer - dt);
      if (this._healPathTimer <= 0) {
        this._healPathTimer = 1500; // re-evaluate every 1.5s
        const SEEK_RANGE = 6 * TILE_SIZE;
        let best = null, bestDist = SEEK_RANGE;
        for (const u of this.game.units) {
          if (u.dead || u.playerId !== this.playerId || u === this) continue;
          if (u.hp >= u.maxHp * 0.85) continue; // only walk to significantly injured
          const d = this.distTo(u);
          if (d < bestDist) { bestDist = d; best = u; }
        }
        if (best && bestDist > (this.def.healRadius || 1.5) * TILE_SIZE) {
          this._requestPath(Math.floor(best.x / TILE_SIZE), Math.floor(best.y / TILE_SIZE));
          this._setState(UNIT_STATE.MOVING);
        }
      }
      return;
    }

    if (this.stance === 'PASSIVE') return;
    // DEFENSIVE: only react within attack range; AGGRESSIVE: full aggro range
    const range = this.stance === 'DEFENSIVE' ? this.atkRange * 1.3 : this.aggroRange;
    const enemy = this._findNearestEnemy(range);
    if (enemy) {
      this._setState(UNIT_STATE.ATTACKING);
      this.target = enemy;
    }
  }

  // ── MOVING ───────────────────────────────────────────────
  _updateMoving(dt) {
    if (this.path.length === 0) {
      this.attackMoving = false;
      this.attackMoveDest = null;
      this._setState(UNIT_STATE.IDLE);
      return;
    }

    this._stepPath(dt);

    // Attack-move or aggressive: attack enemies encountered while moving
    if (this.unitClass !== 'civilian' && (this.attackMoving || this.stance === 'AGGRESSIVE')) {
      const range = this.attackMoving ? this.aggroRange : this.atkRange;
      const enemy = this._findNearestEnemy(range);
      if (enemy) {
        this.target = enemy;
        this._setState(UNIT_STATE.ATTACKING);
        return;
      }
    }

    // Stuck detection
    this.stuckTimer += dt;
    if (this.stuckTimer >= 2000) {
      const moved = dist(this.x, this.y, this.lastX, this.lastY);
      this.lastX = this.x; this.lastY = this.y;
      this.stuckTimer = 0;
      if (moved < 8) {
        // Recalculate path
        if (this.pathTarget) {
          this._requestPath(this.pathTarget.tx, this.pathTarget.ty);
        } else {
          this.path = [];
          this._setState(UNIT_STATE.IDLE);
        }
      }
    }
  }

  // ── ATTACKING ────────────────────────────────────────────
  _updateAttacking(dt) {
    if (!this.target || this.target.dead) {
      this.target = null;
      // Resume patrol or attack-move after combat
      if (this.patrolA && this.patrolB) {
        this._setState(UNIT_STATE.PATROL);
      } else if (this.attackMoving && this.attackMoveDest) {
        this._requestPath(this.attackMoveDest.tx, this.attackMoveDest.ty);
        this._setState(UNIT_STATE.MOVING);
      } else {
        this._setState(UNIT_STATE.IDLE);
      }
      return;
    }

    // DEFENSIVE stance: don't chase if target moves too far away
    if (this.stance === 'DEFENSIVE') {
      const d = this.distTo(this.target);
      if (d > this.atkRange * 3) {
        this.target = null;
        this._setState(UNIT_STATE.IDLE);
        return;
      }
    }

    const d = this.distTo(this.target);

    // Trebuchet-style siege units: auto-unpack when in attack range of target
    if (this.def.class === 'siege' && !this.def.isMechSiege) {
      if (this._packTimer > 0) return; // wait for transition to complete
      if (this._packed) {
        // In range? Auto-start deploying
        const dToTarget = this.target ? this.distTo(this.target) : Infinity;
        if (dToTarget <= this.getEffectiveAtkRange() * 1.1) {
          this.cmdUnpack(); // start unpacking
        } else {
          // Move closer while still packed
          this._requestPath(this.target.tx, this.target.ty);
          this._stepPath(dt);
        }
        return;
      }
      // Unpacked but target moved out of range — just wait (siege can't chase while deployed)
    }

    if (d > this.atkRange * 1.2) {
      // Unpacked trebuchet siege can't chase — wait for target to come in range or re-pack
      if (this.def.class === 'siege' && !this.def.isMechSiege && !this._packed) {
        // Stay put; if target drifts out of max range * 2, give up
        if (d > this.getEffectiveAtkRange() * 2.5) {
          this._setState(UNIT_STATE.IDLE);
        }
        return;
      }
      // Move toward target
      this._requestPath(this.target.tx, this.target.ty);
      this._stepPath(dt);
    } else {
      // In range - face and attack
      this.facing = angle(this.x, this.y, this.target.x, this.target.y);
      this.path = [];

      if (this.atkTimer === 0) {
        this._doAttack(this.target);
        this.atkTimer = this.atkCooldown;
      }
    }
  }

  getEffectiveAtk() {
    const player = this.game.players[this.playerId];
    const veteranBonus = this.isVeteran ? 2 : 0;
    const eliteBonus   = this.isElite   ? 2 : 0; // stacks with veteran (+4 total)
    return this.atk + (player.getAtkBonus ? player.getAtkBonus(this.unitClass) : 0) + veteranBonus + eliteBonus + this._buffAtk;
  }

  getEffectiveAtkRange() {
    const player = this.game.players[this.playerId];
    const bonus = player.getAtkRangeBonus ? player.getAtkRangeBonus(this.unitClass) : 0;
    return this.atkRange + bonus * TILE_SIZE;
  }

  _doAttack(target) {
    this._combatCooldown = 8000; // 8s before regen starts after attacking
    if (this.hasProjectile) {
      // Projectile uses getEffectiveAtk via the shooter reference in Projectile constructor
      this.game.spawnProjectile(this, target);
    } else {
      // Melee - direct damage with research bonuses
      const player = this.game.players[this.playerId];
      let dmg = this.getEffectiveAtk();
      if (this.unitClass === 'archer') {
        dmg = Math.max(1, dmg - (target.pierceArmor || 0));
      } else {
        dmg = Math.max(1, dmg - (target.meleeArmor || 0));
      }
      if (this.def.bonuses && this.def.bonuses[target.unitClass]) {
        dmg += this.def.bonuses[target.unitClass];
      }
      target.takeDamage(dmg, this);
      // Melee hit sound (player units or visible enemy units only, throttled)
      if (typeof Sound !== 'undefined' && this.game.fog.isWorldVisible(this.x, this.y)) {
        Sound.meleeHit();
      }
    }
  }

  // ── GATHERING ────────────────────────────────────────────
  _updateGathering(dt) {
    if (!this.gatherTarget || this.gatherTarget.depleted || this.gatherTarget.dead) {
      // Persistent gather: auto-find nearest node of same resource type
      const wantType = this.gatherTarget ? this.gatherTarget.resourceType : this.carryType;
      if (wantType) {
        const nearest = this.game.getNearestResource(this.x, this.y, wantType);
        if (nearest) {
          this.gatherTarget = nearest;
          return; // continue gathering at new node
        }
      }
      this.gatherTarget = null;
      this._setState(UNIT_STATE.IDLE);
      return;
    }

    const node = this.gatherTarget;
    const d = this.distTo(node);
    const gatherDist = TILE_SIZE * 1.8;

    if (d > gatherDist) {
      // Walk to resource
      if (this.path.length === 0) {
        this._requestPath(node.tx, node.ty);
      }
      this._stepPath(dt);
      return;
    }

    // At resource - gather
    this.path = [];
    this.facing = angle(this.x, this.y, node.x, node.y);
    this.gatherProgress += dt;

    const player = this.game.players[this.playerId];
    const gatherMult = player.getGatherBonus ? player.getGatherBonus(node.resourceType) : 1;
    const gatherInterval = 3000 / gatherMult; // faster with research
    if (this.gatherProgress >= gatherInterval) {
      this.gatherProgress = 0;
      const effCarryCap = Math.floor(this.carryCap * (player.getCarryCapBonus ? player.getCarryCapBonus(node.resourceType) : 1));
      const amount = Math.min(effCarryCap, node.amount);
      if (amount <= 0) {
        this.gatherTarget = null;
        this._setState(UNIT_STATE.IDLE);
        return;
      }
      node.amount -= amount;
      if (node.amount <= 0) {
        node.amount = 0;
        node.depleted = true;
      }
      this.carrying  = amount;
      this.carryType = node.resourceType;
      if (this.playerId === 0 && typeof Sound !== 'undefined') Sound.gather();
      // Gathering spark burst
      const sparkColor = node.resourceType === 'gold' ? '#f8d848' :
                         node.resourceType === 'stone' ? '#c0c8d0' :
                         node.resourceType === 'wood'  ? '#a06830' : '#66cc44';
      for (let s = 0; s < 4; s++) {
        const ang = (s / 4) * Math.PI * 2;
        this.game.spawnEffect({
          type: 'gather_spark', x: node.x + Math.cos(ang) * 8, y: node.y + Math.sin(ang) * 8,
          life: 400 + s * 60, radius: 5, color: sparkColor,
          vx: Math.cos(ang) * 18, vy: Math.sin(ang) * 10 - 15,
        });
      }
      this._setState(UNIT_STATE.RETURNING_RESOURCE);
    }
  }

  // ── RETURNING ────────────────────────────────────────────
  _updateReturning(dt) {
    const dropoff = this._findNearestDropoff();
    if (!dropoff) {
      this._setState(UNIT_STATE.IDLE);
      return;
    }

    const d = this.distTo(dropoff);
    if (d > TILE_SIZE * 2) {
      if (this.path.length === 0) {
        this._requestPath(dropoff.tx, dropoff.ty);
      }
      this._stepPath(dt);
    } else {
      // Deposit resources
      this.path = [];
      if (this.carrying > 0 && this.carryType) {
        this.game.players[this.playerId].addResource(this.carryType, this.carrying);
        this.carrying  = 0;
        this.carryType = null;
      }
      // Return to gather more — persistent: if original node gone, find nearest of same type
      if (this.gatherTarget && !this.gatherTarget.depleted && !this.gatherTarget.dead) {
        this._setState(UNIT_STATE.GATHERING);
      } else if (this.carryType) {
        const nearest = this.game.getNearestResource(this.x, this.y, this.carryType);
        if (nearest) {
          this.gatherTarget = nearest;
          this._setState(UNIT_STATE.GATHERING);
        } else {
          this.gatherTarget = null;
          this._setState(UNIT_STATE.IDLE);
        }
      } else {
        this._setState(UNIT_STATE.IDLE);
      }
    }
  }

  _findNearestDropoff() {
    const player = this.game.players[this.playerId];
    let best = null, bestDist = Infinity;
    for (const b of player.buildings) {
      if (b.dead || !b.built) continue;
      const def = BUILDING_DEFS[b.type];
      if (!def.dropOff) continue;
      if (!def.dropOff.includes(this.carryType)) continue;
      const d = this.distTo(b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  // ── BUILDING / REPAIR ────────────────────────────────────
  _updateBuilding(dt) {
    if (!this.buildTarget || this.buildTarget.dead) {
      this.buildTarget = null;
      this.repairMode = false;
      this._setState(UNIT_STATE.IDLE);
      return;
    }
    const b = this.buildTarget;

    // Repair mode: building already built, restore HP
    if (b.built) {
      if (!this.repairMode || b.hp >= b.maxHp) {
        this.buildTarget = null;
        this.repairMode = false;
        this._setState(UNIT_STATE.IDLE);
        return;
      }
      const d = this.distTo(b);
      if (d > TILE_SIZE * (b.size + 1)) {
        if (this.path.length === 0) {
          this._requestPath(b.tx + Math.floor(b.size / 2), b.ty + Math.floor(b.size / 2));
        }
        this._stepPath(dt);
      } else {
        this.path = [];
        this.facing = angle(this.x, this.y, b.x, b.y);
        const repairAmt = b.maxHp * 0.02 * dt / 1000; // 2% maxHp/sec
        const woodCost  = repairAmt / b.maxHp * 5;     // 5 wood per maxHp restored
        const player = this.game.players[this.playerId];
        if (player.wood >= woodCost) {
          player.wood -= woodCost;
          b.hp = Math.min(b.maxHp, b.hp + repairAmt);
        } else {
          this.repairMode = false;
          this.buildTarget = null;
          this._setState(UNIT_STATE.IDLE);
          if (this.playerId === 0) this.game.ui.addNotification('Not enough wood to repair!', '#ff8844');
        }
        if (b.hp >= b.maxHp) {
          this.repairMode = false;
          this.buildTarget = null;
          this._setState(UNIT_STATE.IDLE);
        }
      }
      return;
    }

    // Construction mode
    const d = this.distTo(b);
    if (d > TILE_SIZE * (b.size + 1)) {
      if (this.path.length === 0) {
        this._requestPath(b.tx + Math.floor(b.size / 2), b.ty + Math.floor(b.size / 2));
      }
      this._stepPath(dt);
    } else {
      this.path = [];
      this.facing = angle(this.x, this.y, b.x, b.y);
      b.buildProgress += dt * 0.005; // ~20 seconds to build with one villager
      if (b.buildProgress >= 100) {
        b.buildProgress = 100;
        b.built = true;
        // Track stat
        const builder = this.game.players[this.playerId];
        if (builder && builder.stats) builder.stats.buildingsBuilt++;
        this.buildTarget = null;
        this._setState(UNIT_STATE.IDLE);
      }
    }
  }

  // ── PATROL ───────────────────────────────────────────────
  _updatePatrol(dt) {
    // Attack enemies spotted while patrolling
    if (this.stance !== 'PASSIVE') {
      const enemy = this._findNearestEnemy(this.aggroRange);
      if (enemy) {
        this.target = enemy;
        this._setState(UNIT_STATE.ATTACKING);
        return;
      }
    }

    if (!this.patrolA || !this.patrolB) {
      this._setState(UNIT_STATE.IDLE);
      return;
    }

    const dest = this.patrolGoingToB ? this.patrolB : this.patrolA;
    if (this.path.length === 0) {
      this._requestPath(dest.tx, dest.ty);
    }
    this._stepPath(dt);

    // Check arrival (within 1.5 tiles)
    const myTx = Math.floor(this.x / TILE_SIZE);
    const myTy = Math.floor(this.y / TILE_SIZE);
    if (Math.abs(myTx - dest.tx) <= 1 && Math.abs(myTy - dest.ty) <= 1) {
      this.patrolGoingToB = !this.patrolGoingToB;
      this.path = [];
    }
  }

  // ── Path helpers ─────────────────────────────────────────
  _requestPath(tx, ty) {
    const myTx = this.tx, myTy = this.ty;
    const path = this.game.pathfinder.findPath(myTx, myTy, tx, ty);
    this.path = path;
    this.pathTarget = { tx, ty };
    this.stuckTimer = 0;
    this.lastX = this.x; this.lastY = this.y;
  }

  _stepPath(dt) {
    if (this.path.length === 0) return;
    const next = this.path[0];
    const wx = next.tx * TILE_SIZE + TILE_SIZE / 2;
    const wy = next.ty * TILE_SIZE + TILE_SIZE / 2;
    const dx = wx - this.x, dy = wy - this.y;
    const d  = Math.sqrt(dx * dx + dy * dy);

    if (d < 4) {
      this.path.shift();
      return;
    }

    // Unpacked trebuchet-style siege units can't move (tanks can always move)
    if (this.def.class === 'siege' && !this.def.isMechSiege && !this._packed && this._packTimer <= 0) {
      this.path = [];
      return;
    }
    const speedMult = (this._upkeepBroke ? 0.5 : 1.0) * (1 + this._buffSpeed);
    const spd = this.speed * speedMult * dt / 1000;
    const move = Math.min(spd, d);
    this.x += (dx / d) * move;
    this.y += (dy / d) * move;
    this.facing = Math.atan2(dy, dx);

    // Occasional walk dust puff (not on water/mountain terrain)
    this._dustTimer = (this._dustTimer || 0) + dt;
    if (this._dustTimer > 350) {
      this._dustTimer = 0;
      const tx = Math.floor(this.x / TILE_SIZE);
      const ty = Math.floor(this.y / TILE_SIZE);
      const terrain = this.game.map.getTile(tx, ty);
      if (terrain !== TERRAIN.WATER && terrain !== TERRAIN.MOUNTAIN) {
        this.game.spawnEffect({
          type: 'dust', x: this.x, y: this.y, life: 550,
          radius: this.radius * 1.4,
          vx: -dx / d * 8, vy: -dy / d * 4,
        });
      }
    }
  }

  // ── Enemy scan ───────────────────────────────────────────
  _findNearestEnemy(range) {
    range = range || this.atkRange;
    let best = null, bestDist = range;
    const myPid = this.playerId;

    for (const u of this.game.units) {
      if (u.dead || u.playerId === myPid) continue;
      const d = this.distTo(u);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    for (const b of this.game.buildings) {
      if (b.dead || b.playerId === myPid) continue;
      const d = this.distTo(b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  // ── Commands ─────────────────────────────────────────────
  cmdMove(tx, ty) {
    this.target = null;
    this.gatherTarget = null;
    this.buildTarget  = null;
    this._requestPath(tx, ty);
    this._setState(UNIT_STATE.MOVING);
  }

  cmdAttack(target) {
    this.target = target;
    this._setState(UNIT_STATE.ATTACKING);
    if (this.distTo(target) > this.atkRange) {
      this._requestPath(target.tx, target.ty);
    }
  }

  cmdGather(node) {
    this.gatherTarget = node;
    this.carrying = 0;
    this.carryType = null;
    this._setState(UNIT_STATE.GATHERING);
    this._requestPath(node.tx, node.ty);
  }

  cmdBuild(building) {
    this.buildTarget = building;
    this.repairMode = false;
    this._setState(UNIT_STATE.BUILDING);
    this._requestPath(building.tx + Math.floor(building.size / 2), building.ty + Math.floor(building.size / 2));
  }

  cmdRepair(building) {
    if (!building || building.dead || !building.built || building.hp >= building.maxHp) return;
    this.buildTarget = building;
    this.repairMode = true;
    this._setState(UNIT_STATE.BUILDING);
    this._requestPath(building.tx + Math.floor(building.size / 2), building.ty + Math.floor(building.size / 2));
  }

  // Monk EMP Burst: paralyzes all enemies within 4 tiles for 3 seconds
  cmdEMPBurst() {
    if (this.unitClass !== 'support') return;
    if (this._abilityCooldown > 0) return;

    this._abilityCooldown = 45000; // 45-second cooldown

    const RADIUS = 4 * TILE_SIZE;
    let count = 0;
    for (const u of this.game.units) {
      if (u.dead || u.playerId === this.playerId) continue;
      if (this.distTo(u) > RADIUS) continue;
      u._paralyzeTimer = 3000; // 3 seconds paralyzed
      u.path = [];
      u._setState(UNIT_STATE.PARALYZED);
      count++;
    }

    // EMP visual effect
    this.game.spawnEffect({ type: 'emp_burst', x: this.x, y: this.y, life: 800, radius: RADIUS });

    if (this.playerId === 0 && this.game.ui) {
      this.game.ui.addNotification(`⚡ EMP Burst! ${count} enemy unit(s) paralyzed for 3s`, '#00eeff');
    }
  }

  // Trebuchet: unpack to enable firing (takes 3s), pack to re-enable movement (2s)
  cmdUnpack() {
    if (this.def.class !== 'siege') return;
    if (!this._packed || this._packTimer > 0) return; // already unpacked or mid-transition
    this._packingDir = 1;    // +1 = unpacking
    this._packTimer  = 3000; // 3 seconds to deploy
    this.path = [];
    this._setState(UNIT_STATE.IDLE);
  }

  cmdPack() {
    if (this.def.class !== 'siege') return;
    if (this._packed || this._packTimer > 0) return; // already packed or mid-transition
    this._packingDir = -1;   // -1 = packing
    this._packTimer  = 2000; // 2 seconds to pack up
    this._setState(UNIT_STATE.IDLE);
  }

  // Warlord active ability: Battlecry — buffs all friendly units within 5 tiles
  cmdBattlecry() {
    if (this.unitClass !== 'hero') return;
    if (this._abilityCooldown > 0) return;

    this._abilityCooldown = 30000; // 30-second cooldown

    const RADIUS = 5 * TILE_SIZE;
    let count = 0;
    for (const u of this.game.units) {
      if (u.dead || u.playerId !== this.playerId) continue;
      if (this.distTo(u) > RADIUS) continue;
      u._buffAtk   = 4;      // +4 attack
      u._buffSpeed = 0.4;    // +40% movement speed
      u._buffTimer = 10000;  // 10 seconds
      count++;
    }

    // Spawn expanding ring effect
    this.game.spawnEffect({ type: 'battlecry', x: this.x, y: this.y, life: 1000, radius: RADIUS });

    if (this.playerId === 0 && this.game.ui) {
      this.game.ui.addNotification(`⚔ Battlecry! Buffed ${count} units: +4 ATK, +40% SPD for 10s`, '#ffd700');
    }
  }

  cmdStop() {
    this.target = null;
    this.gatherTarget = null;
    this.buildTarget  = null;
    this.repairMode   = false;
    this.attackMoving = false;
    this.attackMoveDest = null;
    this.patrolA = null;
    this.patrolB = null;
    this._garrisonTarget = null;
    this.path = [];
    this._setState(UNIT_STATE.IDLE);
  }

  cmdGarrison(building) {
    if (!building || building.dead || !building.built) return;
    if (!building.def.maxGarrison) return;
    if (building.garrisonedUnits.length >= building.def.maxGarrison) {
      if (this.playerId === 0) this.game.ui.addNotification('Garrison is full!', '#ff8844');
      return;
    }
    if (building.playerId !== this.playerId) return;

    this._garrisonTarget = building;
    this.target = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairMode = false;
    this.patrolA = null;
    this.patrolB = null;
    this.attackMoving = false;
    this._requestPath(building.tx + Math.floor(building.size / 2), building.ty + Math.floor(building.size / 2));
    this._setState(UNIT_STATE.MOVING);
  }

  _enterGarrison(building) {
    if (building.garrisonedUnits.length >= building.def.maxGarrison) return;
    building.garrisonedUnits.push(this);
    this.garrisoned = true;
    this.garrisonBuilding = building;
    this.selected = false;
    this.path = [];
    this._setState(UNIT_STATE.IDLE);
  }

  ungarrison() {
    if (!this.garrisoned) return;
    const b = this.garrisonBuilding;
    if (b) {
      const idx = b.garrisonedUnits.indexOf(this);
      if (idx !== -1) b.garrisonedUnits.splice(idx, 1);
      // Spawn next to building exit
      this.x = b.x + b.size * TILE_SIZE * 0.5 + TILE_SIZE * 1.2;
      this.y = b.y + b.size * TILE_SIZE * 0.5;
    }
    this.garrisoned = false;
    this.garrisonBuilding = null;
    this._setState(UNIT_STATE.IDLE);
  }

  cmdPatrol(tx, ty) {
    this.patrolA = { tx: Math.floor(this.x / TILE_SIZE), ty: Math.floor(this.y / TILE_SIZE) };
    this.patrolB = { tx, ty };
    this.patrolGoingToB = true;
    this.attackMoving = false;
    this.attackMoveDest = null;
    this._setState(UNIT_STATE.PATROL);
    this._requestPath(tx, ty);
  }

  cmdAttackMove(tx, ty) {
    this.target = null;
    this.patrolA = null;
    this.patrolB = null;
    this.attackMoving = true;
    this.attackMoveDest = { tx, ty };
    this._requestPath(tx, ty);
    this._setState(UNIT_STATE.MOVING);
  }

  cmdSetStance(stance) {
    this.stance = stance;
  }

  _setState(s) {
    this.state = s;
  }

  _getSymbol() {
    const map = { VILLAGER:'V', MILITIA:'M', SWORDSMAN:'Sw', ARCHER:'A', CROSSBOWMAN:'X', SPEARMAN:'Sp', SCOUT:'Sc', KNIGHT:'K', TREBUCHET:'T', WARLORD:'W', MONK:'Mo' };
    return map[this.type] || '?';
  }

  // ── Damage ───────────────────────────────────────────────
  takeDamage(amount, attacker) {
    if (this.garrisoned) return; // garrisoned units can't be targeted individually
    this.hp -= amount;
    this.floats.push({ text: Math.round(amount), x: this.x, y: this.y - this.radius, life: 900, color: '#ff6666' });
    // Hit flash effect
    this.game.spawnEffect({ type: 'hit_flash', x: this.x, y: this.y, life: 280, radius: this.radius * 2.5 });
    // Alert player minimap
    if (this.playerId === 0) this.game.triggerAttackAlert(this.x, this.y);
    // Reset regen cooldown on hit
    this._combatCooldown = 8000;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker);
    } else if (this.state === UNIT_STATE.IDLE && this.unitClass !== 'civilian' && attacker) {
      // Auto-retaliate
      this.target = attacker;
      this._setState(UNIT_STATE.ATTACKING);
    }
  }

  die(killer) {
    this.dead = true;
    this.state = UNIT_STATE.DEAD;
    this.path = [];
    // Remove from garrison without ejecting (unit is dead)
    if (this.garrisoned && this.garrisonBuilding) {
      const idx = this.garrisonBuilding.garrisonedUnits.indexOf(this);
      if (idx !== -1) this.garrisonBuilding.garrisonedUnits.splice(idx, 1);
      this.garrisoned = false;
      this.garrisonBuilding = null;
    }
    // Remove from player unit list
    const player = this.game.players[this.playerId];
    const idx = player.units.indexOf(this);
    if (idx !== -1) player.units.splice(idx, 1);
    // Track kill stat for the attacker + veteran promotion
    if (killer && killer.playerId !== undefined) {
      const killerPlayer = this.game.players[killer.playerId];
      if (killerPlayer && killerPlayer.stats) killerPlayer.stats.unitsKilled++;
      // Veteran promotion for unit killers only (not building attackers)
      if (killer instanceof Unit && killer.unitClass !== 'civilian') {
        killer.kills++;
        if (!killer.isVeteran && killer.kills >= 3) {
          killer.isVeteran = true;
          killer.meleeArmor  += 1;
          killer.pierceArmor += 1;
          if (killer.playerId === 0 && this.game.ui) {
            this.game.ui.addNotification(`${killer.name} became a Veteran! (+2 ATK, +1 armor)`, '#ffd700');
          }
        }
        // Elite promotion: 7+ kills — second tier
        if (killer.isVeteran && !killer.isElite && killer.kills >= 7) {
          killer.isElite = true;
          killer.meleeArmor  += 1;
          killer.pierceArmor += 1;
          // Elite gets a passive regen bonus (handled in regen code)
          if (killer.playerId === 0 && this.game.ui) {
            this.game.ui.addNotification(`⚡ ${killer.name} reached ELITE status! (+4 ATK total, regen 2x)`, '#00eeff');
          }
        }
      }
    }
  }

  // ── Render ───────────────────────────────────────────────
  // Called inside ctx.scale(zoom)/ctx.translate(-worldX,-worldY) transform block
  render(ctx, camera) {
    if (this.dead || this.garrisoned) return;

    // Convert sim position to isometric world position for rendering
    const iso = simToIso(this.x, this.y);
    const wx = iso.x, wy = iso.y;
    const r = this.radius;

    // Cull check in iso world space
    if (wx + r < camera.worldX || wx - r > camera.worldX + camera.viewW / camera.zoom) return;
    if (wy + r < camera.worldY || wy - r > camera.worldY + camera.viewH / camera.zoom) return;

    // Selection glow (ellipse under unit for iso perspective)
    if (this.selected) {
      SpriteR.drawSelectionGlow(ctx, wx, wy, r, PLAYER_COLORS[this.playerId], camera.zoom);
    }

    // Draw sprite
    SpriteR.drawUnit(ctx, wx, wy, r, PLAYER_COLORS[this.playerId], this.facing, this.state, this.carryType, this.type, this.walkFrame);

    // Health bar
    SpriteR.drawHealthBar(ctx, wx, wy - r - 6 / camera.zoom, r * 2, this.hp, this.maxHp, camera.zoom);

    // Veteran / Elite star badge
    if (this.isVeteran) {
      const starSize = 7 / camera.zoom;
      const sx = wx + r * 0.6;
      const sy = wy - r - 4 / camera.zoom;
      ctx.font = `bold ${starSize * 2}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.isElite) {
        // Elite: cyan double-star with glow
        ctx.fillStyle = '#00eeff';
        ctx.fillText('★★', sx, sy);
      } else {
        ctx.fillStyle = '#ffd700';
        ctx.fillText('★', sx, sy);
      }
    }

    // Upkeep broke indicator (red coin icon)
    if (this._upkeepBroke && this.def.upkeep) {
      const bx = wx - r * 0.5;
      const by = wy - r - 4 / camera.zoom;
      ctx.fillStyle = '#ff4444';
      ctx.font = `bold ${8 / camera.zoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💸', bx, by);
    }

    // Trebuchet pack state indicator (not for mechanical siege like Tank)
    if (this.def.class === 'siege' && !this.def.isMechSiege) {
      const labelSize = 7 / camera.zoom;
      ctx.font = `bold ${labelSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (this._packTimer > 0) {
        // Transitioning: show pulsing yellow label
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
        ctx.fillStyle = `rgba(255,220,50,${0.7 + pulse * 0.3})`;
        ctx.fillText(this._packingDir > 0 ? 'DEPLOYING...' : 'PACKING...', wx, wy + r + 2 / camera.zoom);
      } else if (this._packed) {
        ctx.fillStyle = 'rgba(180,220,255,0.85)';
        ctx.fillText('PACKED', wx, wy + r + 2 / camera.zoom);
      } else {
        ctx.fillStyle = 'rgba(255,140,50,0.90)';
        ctx.fillText('DEPLOYED', wx, wy + r + 2 / camera.zoom);
      }
      ctx.textBaseline = 'middle';
    }

    // Paralyzed: pulsing electric blue ring
    if (this._paralyzeTimer > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
      ctx.save();
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.strokeStyle = '#00eeff';
      ctx.lineWidth = 3 / camera.zoom;
      ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(wx, wy, r * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Monk: soft cyan heal aura when healing is active
    if (this.unitClass === 'support') {
      const healR = (this.def.healRadius || 1.5) * TILE_SIZE * 0.5;
      const pulse = 0.3 + 0.2 * Math.sin(performance.now() / 500);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#44ffcc';
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.beginPath();
      ctx.arc(wx, wy, healR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Battlecry buff aura (pulsing golden ring)
    if (this._buffTimer > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160);
      ctx.save();
      ctx.globalAlpha = pulse * 0.6;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.beginPath();
      ctx.arc(wx, wy, r * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Floating damage numbers
    for (const f of this.floats) {
      const fiso = simToIso(f.x, f.y);
      SpriteR.drawFloatingText(ctx, f.text, fiso.x, fiso.y - r, Math.min(1, f.life / 400), f.color, 14 / camera.zoom, camera.zoom);
    }
  }
}
